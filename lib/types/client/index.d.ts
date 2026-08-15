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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Locale namespace of the browser half (reserved for future dictionary use). */
export declare const NS = "ref-pics";
/** Required services: slots (toolview), sessions (agent round trips). The betterSidebar service is optional and wired opportunistically. */
export declare const inject: string[];
/** Apply the browser half. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map