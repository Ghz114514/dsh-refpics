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
  id: string
  /** Display-sized direct image URL (lightbox / full view). */
  url: string
  /** Smaller thumbnail URL for the masonry wall. */
  thumbUrl: string
  /** Natural pixel width of the display image (aspect-ratio reservation). */
  width: number
  /** Natural pixel height of the display image. */
  height: number
  /** Human-readable title or alt text, when the provider supplies one. */
  title?: string
  /** Creator display name, when known. */
  author?: string
  /** Creator profile / author page URL, when known. */
  authorUrl?: string
  /** Page URL at the provider (attribution and "open in source" affordance). */
  sourceUrl?: string
  /** License short code (Openverse), when known. */
  license?: string
  /** Provider-supplied average color, when known. */
  color?: string
}

/** Provider ids the tool can address. */
export const PROVIDERS = ['openverse', 'pexels', 'pixabay', 'unsplash'] as const
export type ProviderId = (typeof PROVIDERS)[number]

/** Provider choice accepted in tool arguments: an explicit id or auto-resolve. */
export const PROVIDER_CHOICES = ['auto', ...PROVIDERS] as const
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number]

/** Orientation filter accepted in tool arguments. */
export const ORIENTATIONS = ['any', 'landscape', 'portrait', 'square'] as const
export type Orientation = (typeof ORIENTATIONS)[number]

export const DEFAULT_COUNT = 12
export const MIN_COUNT = 1
export const MAX_COUNT = 30

/**
 * The canonical value the search_refs tool returns (and persists as
 * presentation metadata). The browser half renders this shape directly.
 */
export interface RefPicsOutcome {
  /** The query as executed. */
  query: string
  /** The provider that actually served the results. */
  provider: ProviderId
  /** Requested page (1-based). */
  page: number
  /** Images on this page (equals images.length). */
  perPage: number
  /** Total matches the provider reported for the query. */
  total: number
  /** True when the provider reported more matches beyond this page. */
  truncated: boolean
  /** Provider-supplied attribution note, when any. */
  note?: string
  /** Normalized images, in provider order. */
  images: RefImage[]
}

/** Soft-narrow an unknown value to a RefImage; null for anything unusable. */
export function narrowRefImage(value: unknown): RefImage | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id.length === 0) return null
  if (typeof record.url !== 'string' || !/^https?:\/\//i.test(record.url)) return null
  if (typeof record.thumbUrl !== 'string' || !/^https?:\/\//i.test(record.thumbUrl)) return null
  if (typeof record.width !== 'number' || typeof record.height !== 'number') return null
  const image: RefImage = {
    id: record.id,
    url: record.url,
    thumbUrl: record.thumbUrl,
    width: record.width,
    height: record.height,
  }
  for (const field of ['title', 'author', 'authorUrl', 'sourceUrl', 'license', 'color'] as const) {
    const raw = record[field]
    if (typeof raw === 'string' && raw.length > 0) image[field] = raw
  }
  return image
}

/**
 * Soft-parse an unknown value (presentation metadata or a JSON text block)
 * into a RefPicsOutcome. Returns null for anything malformed so renderers
 * degrade to the generic card instead of throwing.
 */
export function narrowOutcome(value: unknown): RefPicsOutcome | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.query !== 'string') return null
  if (typeof record.provider !== 'string' || !PROVIDERS.includes(record.provider as ProviderId)) return null
  if (typeof record.page !== 'number' || typeof record.perPage !== 'number' || typeof record.total !== 'number') return null
  if (record.truncated !== undefined && typeof record.truncated !== 'boolean') return null
  if (!Array.isArray(record.images)) return null
  const images = record.images.map(narrowRefImage).filter((image): image is RefImage => image !== null)
  const outcome: RefPicsOutcome = {
    query: record.query,
    provider: record.provider as ProviderId,
    page: record.page,
    perPage: record.perPage,
    total: record.total,
    truncated: record.truncated === true,
    images,
  }
  if (typeof record.note === 'string' && record.note.length > 0) outcome.note = record.note
  return outcome
}

/** One compact display line for a single image (model-facing text). */
export function imageLine(index: number, image: RefImage): string {
  const attribution = image.author !== undefined ? ` — ${image.author}` : ''
  const size = `${Math.round(image.width)}x${Math.round(image.height)}`
  return `${index}. ${image.title ?? 'Untitled'}${attribution} (${size}) ${image.url}`
}

/**
 * One-line header describing a completed search, used by the model-facing
 * text, the generic result title, and the masonry wall header.
 */
export function outcomeSummary(outcome: RefPicsOutcome): string {
  const plural = outcome.total === 1 ? '' : 's'
  return `${outcome.provider} · ${outcome.total} image${plural} · ${outcome.images.length} shown`
}

/**
 * Compact model-facing render of the whole outcome: a header line plus one
 * numbered line per image so the model can cite specific results by index.
 */
export function renderOutcomeText(outcome: RefPicsOutcome): string {
  const header = `Found ${outcome.total} reference image${outcome.total === 1 ? '' : 's'} for "${outcome.query}" on ${outcome.provider} (showing ${outcome.images.length}).`
  if (outcome.images.length === 0) return header
  const lines = outcome.images.map((image, index) => imageLine(index + 1, image))
  return [header, ...lines].join('\n')
}
