/**
 * Runtime service bridge: the client apply captures the sessions and
 * better-sidebar services into module singletons so presentational
 * components (the toolview wall, the board tab) can reach session-scoped
 * sends and the sidebar without threading cordis contexts through props.
 * Every consumer degrades gracefully and REPORTS the reason instead of
 * failing silently — a dead button teaches nothing.
 *
 * @module dsh-refpics/client/bridge
 */

import type { ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { BetterSidebarService, SessionScope } from 'dsh-better-sidebar/client/service'

let sessionsService: ISessions | undefined
let betterSidebarService: BetterSidebarService | undefined

/** Capture the sessions service (set once per client apply). */
export function setSessionsService(service: ISessions): void {
  sessionsService = service
  console.info('[refpics] sessions service captured')
}

/** Capture the better-sidebar service; undefined when that plugin is absent. */
export function setBetterSidebarService(service: BetterSidebarService | undefined): void {
  betterSidebarService = service
  console.info(`[refpics] betterSidebar service ${service === undefined ? 'UNAVAILABLE' : 'captured'}`)
}

/** One agent round-trip outcome, always human-readable. */
export interface SendResult {
  ok: boolean
  message: string
}

/**
 * Queue one prompt into a session (the "换一批/翻页" channel): the agent
 * receives it as an ordinary user message and re-runs the tool, so the new
 * result renders as a normal chat wall. The prompt goes through the session
 * FACE directly (`ISession.prompt`) — resolved via sessions.sessionOf /
 * sessions.binding — because service-property access on a scoped context
 * throws cordis's "cannot get property without inject" for sibling-fiber
 * services. Every failure mode comes back as a message the wall displays.
 */
export async function sendToAgent(sessionId: SessionId | undefined, text: string): Promise<SendResult> {
  if (sessionId === undefined || sessionId.length === 0) {
    console.warn('[refpics] sendToAgent: no session id on the toolview props')
    return { ok: false, message: '缺少会话上下文 (sessionId)' }
  }
  if (sessionsService === undefined) {
    console.warn('[refpics] sendToAgent: sessions service was never captured')
    return { ok: false, message: '会话服务不可用 (sessions service missing)' }
  }
  try {
    const scoped = sessionsService.scope(sessionId)
    const session = (scoped !== undefined ? sessionsService.sessionOf(scoped) : undefined)
      ?? sessionsService.binding(sessionId)?.session
    if (session === undefined) {
      console.warn(`[refpics] sendToAgent: session "${sessionId}" resolved no session face`)
      return { ok: false, message: '找不到会话 (no session face)' }
    }
    const result = await session.prompt([{ type: 'text', text }], 'queue')
    if (!result.ok) {
      const error = result.error as { code?: string; message?: string } | undefined
      const message = error?.message !== undefined && error.message.length > 0
        ? `${error.code ?? 'error'}: ${error.message}`
        : error?.code ?? 'unknown rejection'
      return { ok: false, message: `发送被拒绝: ${message}` }
    }
    return { ok: true, message: '' }
  } catch (error) {
    console.error('[refpics] sendToAgent failed:', error)
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `发送失败: ${message}` }
  }
}

/** One sidebar open outcome. */
export interface OpenBoardResult {
  ok: boolean
  message: string
}

/**
 * Open (or focus) the single-instance refpics board tab in the sidebar.
 * The seed carries a `path` marker so better-sidebar treats it as a CONTENT
 * open and auto-expands the hosting panel (type-only opens never expand —
 * the sidebar stays collapsed and the click looks like a no-op).
 */
export function openRefpicsBoard(sessionId: SessionId | undefined): OpenBoardResult {
  if (betterSidebarService === undefined) {
    console.warn('[refpics] openRefpicsBoard: betterSidebar service unavailable')
    return { ok: false, message: '侧边栏插件不可用 (dsh-better-sidebar missing)' }
  }
  const scope: SessionScope | undefined = sessionId === undefined ? undefined : { sessionId }
  betterSidebarService.openTab({ type: 'refpics:board', path: 'refpics:board' }, scope)
  return { ok: true, message: '' }
}

/** Whether the sidebar board is available (better-sidebar installed). */
export function boardAvailable(): boolean {
  return betterSidebarService !== undefined
}
