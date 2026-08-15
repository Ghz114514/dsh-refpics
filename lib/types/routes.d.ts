/**
 * Host routes for the browser half's extra capabilities: direct board
 * search (/refpics/search), proxied image download (/refpics/download), and
 * the save-to-Eagle seam (/refpics/eagle, /refpics/eagle/status). All routes
 * are same-origin with the web shell (loopback deployment) and validate
 * their inputs per request: provider URLs stay http(s), downloads are
 * bounded and content-type gated, Eagle calls only ever target the
 * configured local port, and failure envelopes never leak internals.
 *
 * @module dsh-refpics/routes
 */
import type { Context } from '@deepseek-ai/cordis';
import { type ResolvedConfig } from './config.ts';
import { type Orientation, type ProviderChoice, type RefPicsOutcome } from './core/outcome.ts';
/** Byte cap for proxied downloads. */
export declare const DOWNLOAD_CAP_BYTES: number;
/** Timeout for proxied downloads and Eagle calls. */
export declare const ROUTE_TIMEOUT_MS = 25000;
/** Eagle health probe timeout. */
export declare const EAGLE_STATUS_TIMEOUT_MS = 2500;
/** JSON request-body cap for the Eagle route. */
export declare const MAX_EAGLE_BODY_BYTES: number;
/** Stable route error envelope. */
export interface RouteError {
    code: 'rejected' | 'internal';
    message: string;
}
/** One search request decoded from the query string. */
export interface SearchQueryParams {
    q: string;
    provider?: ProviderChoice;
    page?: number;
    count?: number;
    orientation?: Orientation;
}
/** Run one board search against the configured providers (reuses the tool path). */
export declare function runBoardSearch(cfg: ResolvedConfig, params: SearchQueryParams): Promise<RefPicsOutcome>;
/** Sanitize a display name into a safe download file name (no path separators). */
export declare function safeFileName(name: string, fallback: string): string;
/** Extension from a URL pathname or a content type; '.img' as the last resort. */
export declare function extensionFor(url: string, contentType: string | null): string;
/**
 * Register the /refpics prefix route on the shared webserver. The config
 * spec is read per request so the Settings card's changes (provider keys,
 * Eagle port/token) reach the very next call.
 * @param ctx - registrant context; the route registers only when the webserver is mounted.
 * @param spec - per-call resolved-config reader.
 */
export declare function registerRefpicsRoutes(ctx: Context, spec: () => ResolvedConfig): void;
//# sourceMappingURL=routes.d.ts.map