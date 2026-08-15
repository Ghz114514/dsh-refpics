/**
 * Shared pure result vocabulary for dsh-refpics, compiled by both the host
 * program (tool registration / render) and the browser program (the keyed
 * tool.call.toolview masonry renderer). No runtime dependencies: plain JSON
 * data plus soft parsers, so a malformed or version-drifted payload can
 * never crash a render path.
 *
 * @module dsh-refpics/core
 */
/** Provider ids the tool can address. */
export const PROVIDERS = ['openverse', 'pexels', 'pixabay', 'unsplash'];
/** Provider choice accepted in tool arguments: an explicit id or auto-resolve. */
export const PROVIDER_CHOICES = ['auto', ...PROVIDERS];
/** Orientation filter accepted in tool arguments. */
export const ORIENTATIONS = ['any', 'landscape', 'portrait', 'square'];
export const DEFAULT_COUNT = 12;
export const MIN_COUNT = 1;
export const MAX_COUNT = 30;
/** Soft-narrow an unknown value to a RefImage; null for anything unusable. */
export function narrowRefImage(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    const record = value;
    if (typeof record.id !== 'string' || record.id.length === 0)
        return null;
    if (typeof record.url !== 'string' || !/^https?:\/\//i.test(record.url))
        return null;
    if (typeof record.thumbUrl !== 'string' || !/^https?:\/\//i.test(record.thumbUrl))
        return null;
    if (typeof record.width !== 'number' || typeof record.height !== 'number')
        return null;
    const image = {
        id: record.id,
        url: record.url,
        thumbUrl: record.thumbUrl,
        width: record.width,
        height: record.height,
    };
    for (const field of ['title', 'author', 'authorUrl', 'sourceUrl', 'license', 'color']) {
        const raw = record[field];
        if (typeof raw === 'string' && raw.length > 0)
            image[field] = raw;
    }
    return image;
}
/**
 * Soft-parse an unknown value (presentation metadata or a JSON text block)
 * into a RefPicsOutcome. Returns null for anything malformed so renderers
 * degrade to the generic card instead of throwing.
 */
export function narrowOutcome(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    const record = value;
    if (typeof record.query !== 'string')
        return null;
    if (typeof record.provider !== 'string' || !PROVIDERS.includes(record.provider))
        return null;
    if (typeof record.page !== 'number' || typeof record.perPage !== 'number' || typeof record.total !== 'number')
        return null;
    if (record.truncated !== undefined && typeof record.truncated !== 'boolean')
        return null;
    if (!Array.isArray(record.images))
        return null;
    const images = record.images.map(narrowRefImage).filter((image) => image !== null);
    const outcome = {
        query: record.query,
        provider: record.provider,
        page: record.page,
        perPage: record.perPage,
        total: record.total,
        truncated: record.truncated === true,
        images,
    };
    if (typeof record.note === 'string' && record.note.length > 0)
        outcome.note = record.note;
    return outcome;
}
/** One compact display line for a single image (model-facing text). */
export function imageLine(index, image) {
    const attribution = image.author !== undefined ? ` — ${image.author}` : '';
    const size = `${Math.round(image.width)}x${Math.round(image.height)}`;
    return `${index}. ${image.title ?? 'Untitled'}${attribution} (${size}) ${image.url}`;
}
/**
 * One-line header describing a completed search, used by the model-facing
 * text, the generic result title, and the masonry wall header.
 */
export function outcomeSummary(outcome) {
    const plural = outcome.total === 1 ? '' : 's';
    return `${outcome.provider} · ${outcome.total} image${plural} · ${outcome.images.length} shown`;
}
/**
 * Compact model-facing render of the whole outcome: a header line plus one
 * numbered line per image so the model can cite specific results by index.
 */
export function renderOutcomeText(outcome) {
    const header = `Found ${outcome.total} reference image${outcome.total === 1 ? '' : 's'} for "${outcome.query}" on ${outcome.provider} (showing ${outcome.images.length}).`;
    if (outcome.images.length === 0)
        return header;
    const lines = outcome.images.map((image, index) => imageLine(index + 1, image));
    return [header, ...lines].join('\n');
}
