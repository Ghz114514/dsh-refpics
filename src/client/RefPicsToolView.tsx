/**
 * Keyed tool.call.toolview entry for the search_refs tool. Slim wrapper
 * now: it parses the settled block, records the outcome into the shared
 * client store (so the sidebar board can mirror the latest chat search),
 * and renders the shared RefPicsWall with agent round-trip actions — 换一批
 * and 翻页 queue a prompt through the session-scoped conversation service
 * so the new batch renders as a normal chat wall, and "在侧边栏打开" opens
 * the single-instance board tab in dsh-better-sidebar. Every failure path
 * degrades to plain text; the row never breaks.
 *
 * @module dsh-refpics/client/RefPicsToolView
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SessionId, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { narrowOutcome, type RefPicsOutcome } from '../core/outcome.ts'
import { boardAvailable, openRefpicsBoard, sendToAgent, type SendResult } from './bridge.ts'
import { recordChatOutcome, setBoardOutcome } from './store.ts'
import { RefPicsWall, RunningWall, copy } from './wall.tsx'

/** Flatten a settled result's text blocks (soft, never throws). */
function textOf(block: ToolCallBlock): string {
  if (!('kind' in block)) return ''
  const parts: string[] = []
  for (const item of block.content) {
    if (item.type === 'text' && typeof (item as { text?: unknown }).text === 'string') {
      parts.push((item as { text: string }).text)
    }
  }
  return parts.join('\n')
}

/** Extract the structured outcome from a settled block (meta first, text JSON fallback). */
function outcomeOf(block: ToolCallBlock): RefPicsOutcome | null {
  if (!('kind' in block)) return null
  const fromMeta = narrowOutcome(block.meta)
  if (fromMeta !== null) return fromMeta
  const text = textOf(block)
  if (text.trim().length === 0) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return narrowOutcome(parsed)
  } catch {
    return null
  }
}

/** The queued prompt asking the agent for a fresh batch of the same idea. */
function refreshPrompt(outcome: RefPicsOutcome): string {
  return '请帮我换一批参考图：用 search_refs 工具搜索，query: "'
    + `${outcome.query}", provider: "${outcome.provider}", count: ${outcome.perPage}, `
    + '换一批不同的结果（可以换 page 或调整关键词角度），继续以参考图墙的形式展示。'
}

/** The queued prompt asking the agent for the next page of the same query. */
function nextPagePrompt(outcome: RefPicsOutcome): string {
  return '请把刚才的参考图搜索翻到下一页：用 search_refs 工具，query: "'
    + `${outcome.query}", provider: "${outcome.provider}", count: ${outcome.perPage}, page: ${outcome.page + 1}。`
}

/** The slot component: dispatch by block lifecycle, degrade safely. */
export function RefPicsToolView(props: ToolCallOwnerProps & { sessionId?: SessionId }): ReactNode {
  const { block, sessionId } = props
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const outcome = 'kind' in block ? outcomeOf(block) : null
  const seq = 'kind' in block ? block.seq : 0

  useEffect(() => {
    if (outcome !== null && sessionId !== undefined) {
      recordChatOutcome(sessionId, seq, outcome)
    }
  }, [outcome, seq, sessionId])

  if (!('kind' in block)) return <RunningWall />
  if (block.isError) {
    const text = textOf(block)
    const summary = text.length > 0 ? text : `${block.error?.name ?? 'Error'}: ${block.error?.code ?? 'unknown'}`
    return <div className="rfp-error">{summary}</div>
  }
  if (outcome === null) {
    const text = textOf(block)
    return <div className="rfp-plain">{text.length > 0 ? text : JSON.stringify(block.content, null, 2)}</div>
  }
  const fire = (handler: () => Promise<SendResult>): void => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    void handler().then((result) => {
      if (!result.ok) setActionError(result.message)
    }).finally(() => {
      window.setTimeout(() => setBusy(false), 3000)
    })
  }
  const t = copy()
  return (
    <RefPicsWall
      outcome={outcome}
      actions={{
        busy,
        sentNote: t.sent,
        error: actionError ?? undefined,
        onRefresh: () => fire(async () => sendToAgent(sessionId, refreshPrompt(outcome))),
        onNextPage: () => fire(async () => sendToAgent(sessionId, nextPagePrompt(outcome))),
        onOpenBoard: boardAvailable() ? () => {
          // Mirror THIS wall's result into the board first, so the tab opens
          // showing the clicked wall instead of the latest chat search.
          if (sessionId !== undefined) setBoardOutcome(sessionId, outcome)
          const result = openRefpicsBoard(sessionId)
          if (!result.ok) setActionError(result.message)
        } : undefined,
      }}
    />
  )
}

export default RefPicsToolView
