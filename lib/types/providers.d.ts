/**
 * Provider adapters for the search_refs tool: each adapter turns one
 * provider's search endpoint and wire shape into the shared RefImage
 * vocabulary. All adapters are pure request builders + normalizers so the
 * HTTP transport stays a single injectable function (tests pass a fake
 * fetch). Attribution is preserved on every result: author, author URL,
 * source page, and license are carried to the renderer and shown in the UI.
 *
 * @module dsh-refpics/providers
 */
import { type Orientation, type ProviderId, type RefImage } from './core/outcome.ts';
/** One provider page after normalization. */
export interface ProviderPage {
    /** Total matches the provider reported for the query. */
    total: number;
    /** Requested page, echoed back (1-based). */
    page: number;
    /** Images on this page, in provider order. */
    images: RefImage[];
}
/** Injectable transport: exactly what the adapter needs from fetch. */
export type SearchFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
/** Per-request timeout budget in milliseconds. */
export declare const SEARCH_TIMEOUT_MS = 20000;
/** The API key a provider needs; undefined for keyless providers. */
export declare function keyFieldOf(provider: ProviderId): 'pexelsKey' | 'pixabayKey' | 'unsplashKey' | undefined;
/** A human-readable hint telling the user where to get a key. */
export declare function keyHint(provider: ProviderId): string;
/** Clamp a requested count into the supported band. */
export declare function clampCount(count: number): number;
/** Run one provider search through the injectable transport. */
export declare function searchProvider(provider: ProviderId, apiKey: string | undefined, query: string, page: number, count: number, orientation: Orientation, signal: AbortSignal | undefined, fetchFn?: SearchFetch): Promise<ProviderPage>;
//# sourceMappingURL=providers.d.ts.map