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
import type { ReactNode } from 'react';
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client';
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client';
/** The slot component: dispatch by block lifecycle, degrade safely. */
export declare function RefPicsToolView(props: ToolCallOwnerProps & {
    sessionId?: SessionId;
}): ReactNode;
export default RefPicsToolView;
//# sourceMappingURL=RefPicsToolView.d.ts.map