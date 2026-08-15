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
import type { ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client';
import type { BetterSidebarService } from 'dsh-better-sidebar/client/service';
/** Capture the sessions service (set once per client apply). */
export declare function setSessionsService(service: ISessions): void;
/** Capture the better-sidebar service; undefined when that plugin is absent. */
export declare function setBetterSidebarService(service: BetterSidebarService | undefined): void;
/** One agent round-trip outcome, always human-readable. */
export interface SendResult {
    ok: boolean;
    message: string;
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
export declare function sendToAgent(sessionId: SessionId | undefined, text: string): Promise<SendResult>;
/** One sidebar open outcome. */
export interface OpenBoardResult {
    ok: boolean;
    message: string;
}
/**
 * Open (or focus) the single-instance refpics board tab in the sidebar.
 * The seed carries a `path` marker so better-sidebar treats it as a CONTENT
 * open and auto-expands the hosting panel (type-only opens never expand —
 * the sidebar stays collapsed and the click looks like a no-op).
 */
export declare function openRefpicsBoard(sessionId: SessionId | undefined): OpenBoardResult;
/** Whether the sidebar board is available (better-sidebar installed). */
export declare function boardAvailable(): boolean;
//# sourceMappingURL=bridge.d.ts.map