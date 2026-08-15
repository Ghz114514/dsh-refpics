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

import {
  MAX_COUNT,
  MIN_COUNT,
  type Orientation,
  type ProviderId,
  type RefImage,
} from './core/outcome.ts'

/** One provider page after normalization. */
export interface ProviderPage {
  /** Total matches the provider reported for the query. */
  total: number
  /** Requested page, echoed back (1-based). */
  page: number
  /** Images on this page, in provider order. */
  images: RefImage[]
}

/** Injectable transport: exactly what the adapter needs from fetch. */
export type SearchFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Per-request timeout budget in milliseconds. */
export const SEARCH_TIMEOUT_MS = 20_000

/** The API key a provider needs; undefined for keyless providers. */
export function keyFieldOf(provider: ProviderId): 'pexelsKey' | 'pixabayKey' | 'unsplashKey' | undefined {
  switch (provider) {
    case 'pexels': return 'pexelsKey'
    case 'pixabay': return 'pixabayKey'
    case 'unsplash': return 'unsplashKey'
    case 'openverse': return undefined
  }
}

/** A human-readable hint telling the user where to get a key. */
export function keyHint(provider: ProviderId): string {
  switch (provider) {
    case 'pexels': return 'Get a free key at https://www.pexels.com/api/ and fill it under Settings -> Plugins -> Reference pictures'
    case 'pixabay': return 'Get a free key at https://pixabay.com/api/docs/ and fill it under Settings -> Plugins -> Reference pictures'
    case 'unsplash': return 'Get a free access key at https://unsplash.com/developers and fill it under Settings -> Plugins -> Reference pictures'
    case 'openverse': return ''
  }
}

/** Clamp a requested count into the supported band. */
export function clampCount(count: number): number {
  if (!Number.isFinite(count)) return MIN_COUNT
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.floor(count)))
}

/** Orientation mapping per provider; undefined means the provider has no filter. */
function orientationParam(provider: ProviderId, orientation: Orientation): string | undefined {
  switch (provider) {
    case 'openverse':
    case 'pexels':
    case 'pixabay':
      return orientation === 'any' ? undefined : orientation
    case 'unsplash':
      // Unsplash accepts landscape/portrait/squarish; 'square' maps to 'squarish'.
      return orientation === 'any' ? undefined : orientation === 'square' ? 'squarish' : orientation
  }
}

/** Run one provider search through the injectable transport. */
export async function searchProvider(
  provider: ProviderId,
  apiKey: string | undefined,
  query: string,
  page: number,
  count: number,
  orientation: Orientation,
  signal: AbortSignal | undefined,
  fetchFn: SearchFetch = fetch,
): Promise<ProviderPage> {
  const perPage = clampCount(count)
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS)
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  switch (provider) {
    case 'openverse': return searchOpenverse(query, page, perPage, orientation, combined, fetchFn)
    case 'pexels': return searchPexels(apiKey, query, page, perPage, orientation, combined, fetchFn)
    case 'pixabay': return searchPixabay(apiKey, query, page, perPage, orientation, combined, fetchFn)
    case 'unsplash': return searchUnsplash(apiKey, query, page, perPage, orientation, combined, fetchFn)
  }
}

/** Throw a friendly failure with the provider's HTTP status when a call fails. */
function badStatus(provider: ProviderId, status: number, body: string): never {
  const trimmed = body.slice(0, 200)
  throw new Error(`search_refs: ${provider} responded ${status}${trimmed.length > 0 ? `: ${trimmed}` : ''}`)
}

/** Require a non-empty API key for keyed providers. */
function requireKey(provider: ProviderId, apiKey: string | undefined): string {
  const key = (apiKey ?? '').trim()
  if (key.length === 0) {
    throw new Error(`search_refs: provider "${provider}" needs an API key. ${keyHint(provider)}`)
  }
  return key
}

async function searchOpenverse(
  query: string,
  page: number,
  perPage: number,
  orientation: Orientation,
  signal: AbortSignal,
  fetchFn: SearchFetch,
): Promise<ProviderPage> {
  const url = new URL('https://api.openverse.org/v1/images/')
  url.searchParams.set('q', query)
  url.searchParams.set('page', String(page))
  url.searchParams.set('page_size', String(perPage))
  url.searchParams.set('license_type', 'all')
  const orientationValue = orientationParam('openverse', orientation)
  if (orientationValue !== undefined) url.searchParams.set('orientation', orientationValue)
  const response = await fetchFn(url, { signal, headers: { accept: 'application/json' } })
  if (!response.ok) badStatus('openverse', response.status, await response.text())
  const payload = await response.json() as {
    result_count: number
    results: OpenverseImage[]
  }
  const images = (payload.results ?? []).map(normalizeOpenverse).filter((image): image is RefImage => image !== null)
  return { total: payload.result_count ?? images.length, page, images }
}

interface OpenverseImage {
  id?: unknown
  url?: unknown
  thumbnail?: unknown
  width?: unknown
  height?: unknown
  title?: unknown
  creator?: unknown
  creator_url?: unknown
  foreign_landing_url?: unknown
  license?: unknown
}

function normalizeOpenverse(item: OpenverseImage): RefImage | null {
  if (typeof item.id !== 'string' || item.id.length === 0) return null
  const url = typeof item.url === 'string' ? item.url : ''
  const thumbUrl = typeof item.thumbnail === 'string' ? item.thumbnail : url
  if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl)) return null
  const width = typeof item.width === 'number' ? item.width : 0
  const height = typeof item.height === 'number' ? item.height : 0
  const image: RefImage = {
    id: `openverse:${item.id}`,
    url: /^https?:\/\//i.test(url) ? url : thumbUrl,
    thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
    width: width > 0 ? width : 800,
    height: height > 0 ? height : 600,
  }
  if (typeof item.title === 'string' && item.title.length > 0) image.title = item.title
  if (typeof item.creator === 'string' && item.creator.length > 0) image.author = item.creator
  if (typeof item.creator_url === 'string' && item.creator_url.length > 0) image.authorUrl = item.creator_url
  if (typeof item.foreign_landing_url === 'string' && item.foreign_landing_url.length > 0) image.sourceUrl = item.foreign_landing_url
  if (typeof item.license === 'string' && item.license.length > 0) image.license = item.license
  return image
}

async function searchPexels(
  apiKey: string | undefined,
  query: string,
  page: number,
  perPage: number,
  orientation: Orientation,
  signal: AbortSignal,
  fetchFn: SearchFetch,
): Promise<ProviderPage> {
  const key = requireKey('pexels', apiKey)
  const url = new URL('https://api.pexels.com/v1/search')
  url.searchParams.set('query', query)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(perPage))
  const orientationValue = orientationParam('pexels', orientation)
  if (orientationValue !== undefined) url.searchParams.set('orientation', orientationValue)
  const response = await fetchFn(url, { signal, headers: { authorization: key, accept: 'application/json' } })
  if (!response.ok) badStatus('pexels', response.status, await response.text())
  const payload = await response.json() as { total_results?: number; photos?: PexelsPhoto[] }
  const photos = payload.photos ?? []
  const images = photos.map(normalizePexels).filter((image): image is RefImage => image !== null)
  return { total: payload.total_results ?? images.length, page, images }
}

interface PexelsPhoto {
  id?: unknown
  width?: unknown
  height?: unknown
  url?: unknown
  photographer?: unknown
  photographer_url?: unknown
  alt?: unknown
  avg_color?: unknown
  src?: { large2x?: unknown; large?: unknown; medium?: unknown }
}

function normalizePexels(photo: PexelsPhoto): RefImage | null {
  if (typeof photo.id !== 'number' && typeof photo.id !== 'string') return null
  const src = photo.src ?? {}
  const url = typeof src.large2x === 'string' ? src.large2x : typeof src.large === 'string' ? src.large : ''
  const thumbUrl = typeof src.medium === 'string' ? src.medium : url
  if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl)) return null
  const width = typeof photo.width === 'number' ? photo.width : 0
  const height = typeof photo.height === 'number' ? photo.height : 0
  const image: RefImage = {
    id: `pexels:${String(photo.id)}`,
    url: /^https?:\/\//i.test(url) ? url : thumbUrl,
    thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
    width: width > 0 ? width : 800,
    height: height > 0 ? height : 600,
  }
  if (typeof photo.alt === 'string' && photo.alt.length > 0) image.title = photo.alt
  if (typeof photo.photographer === 'string' && photo.photographer.length > 0) image.author = photo.photographer
  if (typeof photo.photographer_url === 'string' && photo.photographer_url.length > 0) image.authorUrl = photo.photographer_url
  if (typeof photo.url === 'string' && photo.url.length > 0) image.sourceUrl = photo.url
  if (typeof photo.avg_color === 'string' && photo.avg_color.length > 0) image.color = photo.avg_color
  return image
}

async function searchPixabay(
  apiKey: string | undefined,
  query: string,
  page: number,
  perPage: number,
  orientation: Orientation,
  signal: AbortSignal,
  fetchFn: SearchFetch,
): Promise<ProviderPage> {
  const key = requireKey('pixabay', apiKey)
  const url = new URL('https://pixabay.com/api/')
  url.searchParams.set('key', key)
  url.searchParams.set('q', query)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(perPage))
  url.searchParams.set('image_type', 'photo')
  url.searchParams.set('safesearch', 'true')
  const orientationValue = orientationParam('pixabay', orientation)
  if (orientationValue !== undefined) url.searchParams.set('orientation', orientationValue)
  const response = await fetchFn(url, { signal, headers: { accept: 'application/json' } })
  if (!response.ok) badStatus('pixabay', response.status, await response.text())
  const payload = await response.json() as { total?: number; hits?: PixabayHit[] }
  const hits = payload.hits ?? []
  const images = hits.map(normalizePixabay).filter((image): image is RefImage => image !== null)
  return { total: payload.total ?? images.length, page, images }
}

interface PixabayHit {
  id?: unknown
  pageURL?: unknown
  webformatURL?: unknown
  webformatWidth?: unknown
  webformatHeight?: unknown
  largeImageURL?: unknown
  imageWidth?: unknown
  imageHeight?: unknown
  tags?: unknown
  user?: unknown
}

function normalizePixabay(hit: PixabayHit): RefImage | null {
  if (typeof hit.id !== 'number' && typeof hit.id !== 'string') return null
  const url = typeof hit.largeImageURL === 'string' ? hit.largeImageURL : ''
  const thumbUrl = typeof hit.webformatURL === 'string' ? hit.webformatURL : url
  if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl)) return null
  const width = typeof hit.imageWidth === 'number' ? hit.imageWidth : typeof hit.webformatWidth === 'number' ? hit.webformatWidth : 0
  const height = typeof hit.imageHeight === 'number' ? hit.imageHeight : typeof hit.webformatHeight === 'number' ? hit.webformatHeight : 0
  const image: RefImage = {
    id: `pixabay:${String(hit.id)}`,
    url: /^https?:\/\//i.test(url) ? url : thumbUrl,
    thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
    width: width > 0 ? width : 800,
    height: height > 0 ? height : 600,
  }
  if (typeof hit.tags === 'string' && hit.tags.length > 0) image.title = hit.tags
  if (typeof hit.user === 'string' && hit.user.length > 0) image.author = hit.user
  if (typeof hit.pageURL === 'string' && hit.pageURL.length > 0) image.sourceUrl = hit.pageURL
  return image
}

async function searchUnsplash(
  apiKey: string | undefined,
  query: string,
  page: number,
  perPage: number,
  orientation: Orientation,
  signal: AbortSignal,
  fetchFn: SearchFetch,
): Promise<ProviderPage> {
  const key = requireKey('unsplash', apiKey)
  const url = new URL('https://api.unsplash.com/search/photos')
  url.searchParams.set('query', query)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(perPage))
  const orientationValue = orientationParam('unsplash', orientation)
  if (orientationValue !== undefined) url.searchParams.set('orientation', orientationValue)
  const response = await fetchFn(url, { signal, headers: { authorization: `Client-ID ${key}`, accept: 'application/json' } })
  if (!response.ok) badStatus('unsplash', response.status, await response.text())
  const payload = await response.json() as { total?: number; results?: UnsplashPhoto[] }
  const photos = payload.results ?? []
  const images = photos.map(normalizeUnsplash).filter((image): image is RefImage => image !== null)
  return { total: payload.total ?? images.length, page, images }
}

interface UnsplashPhoto {
  id?: unknown
  width?: unknown
  height?: unknown
  color?: unknown
  alt_description?: unknown
  description?: unknown
  urls?: { regular?: unknown; small?: unknown; full?: unknown }
  links?: { html?: unknown }
  user?: { name?: unknown; links?: { html?: unknown } }
}

function normalizeUnsplash(photo: UnsplashPhoto): RefImage | null {
  if (typeof photo.id !== 'string' || photo.id.length === 0) return null
  const urls = photo.urls ?? {}
  const url = typeof urls.regular === 'string' ? urls.regular : typeof urls.full === 'string' ? urls.full ?? '' : ''
  const thumbUrl = typeof urls.small === 'string' ? urls.small : url
  if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl)) return null
  const width = typeof photo.width === 'number' ? photo.width : 0
  const height = typeof photo.height === 'number' ? photo.height : 0
  const image: RefImage = {
    id: `unsplash:${photo.id}`,
    url: /^https?:\/\//i.test(url) ? url : thumbUrl,
    thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
    width: width > 0 ? width : 800,
    height: height > 0 ? height : 600,
  }
  const title = typeof photo.alt_description === 'string' && photo.alt_description.length > 0
    ? photo.alt_description
    : typeof photo.description === 'string' && photo.description.length > 0 ? photo.description : undefined
  if (title !== undefined) image.title = title
  const author = typeof photo.user?.name === 'string' ? photo.user.name : undefined
  if (author !== undefined && author.length > 0) image.author = author
  const authorUrl = typeof photo.user?.links?.html === 'string' ? photo.user.links.html : undefined
  if (authorUrl !== undefined && authorUrl.length > 0) image.authorUrl = authorUrl
  const sourceUrl = typeof photo.links?.html === 'string' ? photo.links.html : undefined
  if (sourceUrl !== undefined && sourceUrl.length > 0) image.sourceUrl = sourceUrl
  if (typeof photo.color === 'string' && photo.color.length > 0) image.color = photo.color
  return image
}
