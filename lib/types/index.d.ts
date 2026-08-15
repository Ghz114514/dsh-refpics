/**
 * Model-facing reference-image search for the dsh web GUI. The search_refs
 * tool takes a natural-language description and returns normalized images
 * from a design-stock provider: Openverse (keyless, always available) or
 * Pexels / Pixabay / Unsplash (free API keys). The browser half renders
 * each call as a Pinterest-style masonry wall with a lightbox; the
 * model-facing text stays a compact numbered list so the model can cite
 * specific results.
 *
 * Family-style mounting: the aggregate-less package may be installed
 * without configuration (the "auto" provider falls back to Openverse), so
 * per-call facts validate lazily; the "Reference pictures" settings
 * section can fill API keys live from Settings -> Plugins.
 *
 * @module dsh-refpics
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenericCallView } from '@deepseek-ai/dsh-tools';
import { Config } from './config.ts';
import { type Orientation, type ProviderChoice, type RefPicsOutcome } from './core/outcome.ts';
export declare const name = "ref-pics";
export declare const inject: string[];
export { PROVIDERS, PROVIDER_CHOICES, ORIENTATIONS, DEFAULT_COUNT, MIN_COUNT, MAX_COUNT } from './core/outcome.ts';
export type { ProviderChoice, ProviderId, Orientation, RefImage, RefPicsOutcome } from './core/outcome.ts';
export { Config, REFPICS_SETTINGS_NAMESPACE, resolveConfig, resolveProvider, resolveCallRequest, keyFor } from './config.ts';
export { clampCount, searchProvider, SEARCH_TIMEOUT_MS } from './providers.ts';
export type { ProviderPage, SearchFetch } from './providers.ts';
export { registerRefpicsRoutes, runBoardSearch, safeFileName, extensionFor, DOWNLOAD_CAP_BYTES } from './routes.ts';
export type { RouteError, SearchQueryParams } from './routes.ts';
/** search_refs call arguments after validation. Only `query` is required; every other field may be omitted (the schema `default` annotations are model hints — execute materializes them). */
export interface SearchRefsArgs {
    query: string;
    count?: number;
    provider?: ProviderChoice;
    orientation?: Orientation;
    page?: number;
}
/** Pending-state presentation: a generic search card naming the query. */
export declare function searchRefsCallView(args: SearchRefsArgs): GenericCallView;
/** Short-lived semantic cache: identical provider queries reuse the prior page within the TTL. */
export interface SearchCache {
    get(key: string): RefPicsOutcome | undefined;
    set(key: string, value: RefPicsOutcome): void;
}
/** Create a bounded, TTL-scoped cache for provider pages. */
export declare function createSearchCache(maxEntries?: number, ttlMs?: number): SearchCache;
/** Cache key for one provider page. */
export declare function cacheKey(provider: string, query: string, page: number, count: number, orientation: Orientation): string;
/** Result the tool registers on `ctx.tools`. */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map