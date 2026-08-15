/**
 * Browser half of dsh-refpics. Three contributions, each wired through
 * cordis services instead of cross-plugin imports:
 *
 * 1. The keyed tool.call.toolview entry (`key: search_refs`) that renders
 *    each search as a Pinterest-style wall inside the conversation.
 * 2. The dsh-better-sidebar board tab (`refpics:board`), a single-instance
 *    panel mirroring the latest chat search with its own direct search.
 * 3. The service bridge capture (sessions, betterSidebar) that the wall's
 *    换一批/翻页/在侧边栏打开 buttons reach at click time.
 *
 * Failure policy: every DOM/runtime wiring failure is logged, never thrown —
 * the web shell fails the whole boot when a plugin apply throws.
 *
 * @module dsh-refpics/client
 */

import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from 'dsh-better-sidebar/client'
import { RefpicsBoardIcon, RefpicsBoardTab } from './board.tsx'
import { setBetterSidebarService, setSessionsService } from './bridge.ts'
import { RefPicsToolView } from './RefPicsToolView.tsx'

/** Locale namespace of the browser half (reserved for future dictionary use). */
export const NS = 'ref-pics'

/** Required services: slots (toolview), sessions (agent round trips). The betterSidebar service is optional and wired opportunistically. */
export const inject = ['slots', 'sessions']

/** Apply the browser half. */
export function apply(ctx: ClientContext): void {
  ctx.inject(['sessions'], (scope) => {
    setSessionsService(scope.sessions as ISessions)
  })

  // Sidebar board tab: only when dsh-better-sidebar is installed. Its
  // service mounts after ours in the family composition, so registration
  // rides ctx.inject and its disposer rides a fiber effect.
  ctx.inject(['betterSidebar'], (scope) => {
    const sidebar = scope.betterSidebar
    if (sidebar === undefined) return
    setBetterSidebarService(sidebar)
    const dispose = sidebar.registerTab({
      id: 'refpics:board',
      title: () => '参考图',
      icon: (size) => <RefpicsBoardIcon size={size} />,
      order: 130,
      single: true,
      component: (props) => <RefpicsBoardTab {...props} />,
    })
    ctx.effect(() => dispose, 'refpics: sidebar board tab')
  })

  // Keyed toolview: waits for the slot declaration owned by the tool UI package.
  ctx.inject(['slots'], (scope) => {
    scope.slots.inject('tool.call.toolview', () =>
      scope.slots.register(
        { name: 'tool.call.toolview', key: 'search_refs', priority: 0, registrant: 'dsh-refpics' },
        RefPicsToolView,
      ))
  })
}
