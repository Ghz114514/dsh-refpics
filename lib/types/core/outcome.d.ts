/**
 * Shared pure result vocabulary for dsh-refpics, compiled by both the host
 * program (tool registration / render) and the browser program (the keyed
 * tool.call.toolview masonry renderer). No runtime dependencies: plain JSON
 * data plus soft parsers, so a malformed or version-drifted payload can
 * never crash a render path.
 *
 * @module dsh-refpics/core
 */
/** One normalized reference image from any provider. */
export interface RefImage {
    /** Provider-side identifier, stable enough for React keys. */
    id: string;
    /** Display-sized direct image URL (lightbox / full view). */
    url: string;
    /** Smaller thumbnail URL for the masonry wall. */
    thumbUrl: string;
    /** Natural pixel width of the display image (aspect-ratio reservation). */
    width: number;
    /** Natural pixel height of the display image. */
    height: number;
    /** Human-readable title or alt text, when the provider supplies one. */
    title?: string;
    /** Creator display name, when known. */
    author?: string;
    /** Creator profile / author page URL, when known. */
    authorUrl?: string;
    /** Page URL at the provider (attribution and "open in source" affordance). */
    sourceUrl?: string;
    /** License short code (Openverse), when known. */
    license?: string;
    /** Provider-supplied average color, when known. */
    color?: string;
}
/** Provider ids the tool can address. */
export declare const PROVIDERS: readonly ["openverse", "pexels", "pixabay", "unsplash"];
export type ProviderId = (typeof PROVIDERS)[number];
/** Provider choice accepted in tool arguments: an explicit id or auto-resolve. */
export declare const PROVIDER_CHOICES: readonly ["auto", "openverse", "pexels", "pixabay", "unsplash"];
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number];
/** Orientation filter accepted in tool arguments. */
export declare const ORIENTATIONS: readonly ["any", "landscape", "portrait", "square"];
export type Orientation = (typeof ORIENTATIONS)[number];
export declare const DEFAULT_COUNT = 12;
export declare const MIN_COUNT = 1;
export declare const MAX_COUNT = 30;
/**
 * The canonical value the search_refs tool returns (and persists as
 * presentation metadata). The browser half renders this shape directly.
 */
export interface RefPicsOutcome {
    /** The query as executed. */
    query: string;
    /** The provider that actually served the results. */
    provider: ProviderId;
    /** Requested page (1-based). */
    page: number;
    /** Images on this page (equals images.length). */
    perPage: number;
    /** Total matches the provider reported for the query. */
    total: number;
    /** True when the provider reported more matches beyond this page. */
    truncated: boolean;
    /** Provider-supplied attribution note, when any. */
    note?: string;
    /** Normalized images, in provider order. */
    images: RefImage[];
}
/** Soft-narrow an unknown value to a RefImage; null for anything unusable. */
export declare function narrowRefImage(value: unknown): RefImage | null;
/**
 * Soft-parse an unknown value (presentation metadata or a JSON text block)
 * into a RefPicsOutcome. Returns null for anything malformed so renderers
 * degrade to the generic card instead of throwing.
 */
export declare function narrowOutcome(value: unknown): RefPicsOutcome | null;
/** One compact display line for a single image (model-facing text). */
export declare function imageLine(index: number, image: RefImage): string;
/**
 * One-line header describing a completed search, used by the model-facing
 * text, the generic result title, and the masonry wall header.
 */
export declare function outcomeSummary(outcome: RefPicsOutcome): string;
/**
 * Compact model-facing render of the whole outcome: a header line plus one
 * numbered line per image so the model can cite specific results by index.
 */
export declare function renderOutcomeText(outcome: RefPicsOutcome): string;
//# sourceMappingURL=outcome.d.ts.map