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
import { MAX_COUNT, MIN_COUNT, } from "./core/outcome.js";
/** Per-request timeout budget in milliseconds. */
export const SEARCH_TIMEOUT_MS = 20_000;
/** The API key a provider needs; undefined for keyless providers. */
export function keyFieldOf(provider) {
    switch (provider) {
        case 'pexels': return 'pexelsKey';
        case 'pixabay': return 'pixabayKey';
        case 'unsplash': return 'unsplashKey';
        case 'openverse': return undefined;
    }
}
/** A human-readable hint telling the user where to get a key. */
export function keyHint(provider) {
    switch (provider) {
        case 'pexels': return 'Get a free key at https://www.pexels.com/api/ and fill it under Settings -> Plugins -> Reference pictures';
        case 'pixabay': return 'Get a free key at https://pixabay.com/api/docs/ and fill it under Settings -> Plugins -> Reference pictures';
        case 'unsplash': return 'Get a free access key at https://unsplash.com/developers and fill it under Settings -> Plugins -> Reference pictures';
        case 'openverse': return '';
    }
}
/** Clamp a requested count into the supported band. */
export function clampCount(count) {
    if (!Number.isFinite(count))
        return MIN_COUNT;
    return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.floor(count)));
}
/** Orientation mapping per provider; undefined means the provider has no filter. */
function orientationParam(provider, orientation) {
    switch (provider) {
        case 'openverse':
        case 'pexels':
        case 'pixabay':
            return orientation === 'any' ? undefined : orientation;
        case 'unsplash':
            // Unsplash accepts landscape/portrait/squarish; 'square' maps to 'squarish'.
            return orientation === 'any' ? undefined : orientation === 'square' ? 'squarish' : orientation;
    }
}
/** Run one provider search through the injectable transport. */
export async function searchProvider(provider, apiKey, query, page, count, orientation, signal, fetchFn = fetch) {
    const perPage = clampCount(count);
    const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
    switch (provider) {
        case 'openverse': return searchOpenverse(query, page, perPage, orientation, combined, fetchFn);
        case 'pexels': return searchPexels(apiKey, query, page, perPage, orientation, combined, fetchFn);
        case 'pixabay': return searchPixabay(apiKey, query, page, perPage, orientation, combined, fetchFn);
        case 'unsplash': return searchUnsplash(apiKey, query, page, perPage, orientation, combined, fetchFn);
    }
}
/** Throw a friendly failure with the provider's HTTP status when a call fails. */
function badStatus(provider, status, body) {
    const trimmed = body.slice(0, 200);
    throw new Error(`search_refs: ${provider} responded ${status}${trimmed.length > 0 ? `: ${trimmed}` : ''}`);
}
/** Require a non-empty API key for keyed providers. */
function requireKey(provider, apiKey) {
    const key = (apiKey ?? '').trim();
    if (key.length === 0) {
        throw new Error(`search_refs: provider "${provider}" needs an API key. ${keyHint(provider)}`);
    }
    return key;
}
async function searchOpenverse(query, page, perPage, orientation, signal, fetchFn) {
    const url = new URL('https://api.openverse.org/v1/images/');
    url.searchParams.set('q', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', String(perPage));
    url.searchParams.set('license_type', 'all');
    const orientationValue = orientationParam('openverse', orientation);
    if (orientationValue !== undefined)
        url.searchParams.set('orientation', orientationValue);
    const response = await fetchFn(url, { signal, headers: { accept: 'application/json' } });
    if (!response.ok)
        badStatus('openverse', response.status, await response.text());
    const payload = await response.json();
    const images = (payload.results ?? []).map(normalizeOpenverse).filter((image) => image !== null);
    return { total: payload.result_count ?? images.length, page, images };
}
function normalizeOpenverse(item) {
    if (typeof item.id !== 'string' || item.id.length === 0)
        return null;
    const url = typeof item.url === 'string' ? item.url : '';
    const thumbUrl = typeof item.thumbnail === 'string' ? item.thumbnail : url;
    if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl))
        return null;
    const width = typeof item.width === 'number' ? item.width : 0;
    const height = typeof item.height === 'number' ? item.height : 0;
    const image = {
        id: `openverse:${item.id}`,
        url: /^https?:\/\//i.test(url) ? url : thumbUrl,
        thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
        width: width > 0 ? width : 800,
        height: height > 0 ? height : 600,
    };
    if (typeof item.title === 'string' && item.title.length > 0)
        image.title = item.title;
    if (typeof item.creator === 'string' && item.creator.length > 0)
        image.author = item.creator;
    if (typeof item.creator_url === 'string' && item.creator_url.length > 0)
        image.authorUrl = item.creator_url;
    if (typeof item.foreign_landing_url === 'string' && item.foreign_landing_url.length > 0)
        image.sourceUrl = item.foreign_landing_url;
    if (typeof item.license === 'string' && item.license.length > 0)
        image.license = item.license;
    return image;
}
async function searchPexels(apiKey, query, page, perPage, orientation, signal, fetchFn) {
    const key = requireKey('pexels', apiKey);
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    const orientationValue = orientationParam('pexels', orientation);
    if (orientationValue !== undefined)
        url.searchParams.set('orientation', orientationValue);
    const response = await fetchFn(url, { signal, headers: { authorization: key, accept: 'application/json' } });
    if (!response.ok)
        badStatus('pexels', response.status, await response.text());
    const payload = await response.json();
    const photos = payload.photos ?? [];
    const images = photos.map(normalizePexels).filter((image) => image !== null);
    return { total: payload.total_results ?? images.length, page, images };
}
function normalizePexels(photo) {
    if (typeof photo.id !== 'number' && typeof photo.id !== 'string')
        return null;
    const src = photo.src ?? {};
    const url = typeof src.large2x === 'string' ? src.large2x : typeof src.large === 'string' ? src.large : '';
    const thumbUrl = typeof src.medium === 'string' ? src.medium : url;
    if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl))
        return null;
    const width = typeof photo.width === 'number' ? photo.width : 0;
    const height = typeof photo.height === 'number' ? photo.height : 0;
    const image = {
        id: `pexels:${String(photo.id)}`,
        url: /^https?:\/\//i.test(url) ? url : thumbUrl,
        thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
        width: width > 0 ? width : 800,
        height: height > 0 ? height : 600,
    };
    if (typeof photo.alt === 'string' && photo.alt.length > 0)
        image.title = photo.alt;
    if (typeof photo.photographer === 'string' && photo.photographer.length > 0)
        image.author = photo.photographer;
    if (typeof photo.photographer_url === 'string' && photo.photographer_url.length > 0)
        image.authorUrl = photo.photographer_url;
    if (typeof photo.url === 'string' && photo.url.length > 0)
        image.sourceUrl = photo.url;
    if (typeof photo.avg_color === 'string' && photo.avg_color.length > 0)
        image.color = photo.avg_color;
    return image;
}
async function searchPixabay(apiKey, query, page, perPage, orientation, signal, fetchFn) {
    const key = requireKey('pixabay', apiKey);
    const url = new URL('https://pixabay.com/api/');
    url.searchParams.set('key', key);
    url.searchParams.set('q', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('safesearch', 'true');
    const orientationValue = orientationParam('pixabay', orientation);
    if (orientationValue !== undefined)
        url.searchParams.set('orientation', orientationValue);
    const response = await fetchFn(url, { signal, headers: { accept: 'application/json' } });
    if (!response.ok)
        badStatus('pixabay', response.status, await response.text());
    const payload = await response.json();
    const hits = payload.hits ?? [];
    const images = hits.map(normalizePixabay).filter((image) => image !== null);
    return { total: payload.total ?? images.length, page, images };
}
function normalizePixabay(hit) {
    if (typeof hit.id !== 'number' && typeof hit.id !== 'string')
        return null;
    const url = typeof hit.largeImageURL === 'string' ? hit.largeImageURL : '';
    const thumbUrl = typeof hit.webformatURL === 'string' ? hit.webformatURL : url;
    if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl))
        return null;
    const width = typeof hit.imageWidth === 'number' ? hit.imageWidth : typeof hit.webformatWidth === 'number' ? hit.webformatWidth : 0;
    const height = typeof hit.imageHeight === 'number' ? hit.imageHeight : typeof hit.webformatHeight === 'number' ? hit.webformatHeight : 0;
    const image = {
        id: `pixabay:${String(hit.id)}`,
        url: /^https?:\/\//i.test(url) ? url : thumbUrl,
        thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
        width: width > 0 ? width : 800,
        height: height > 0 ? height : 600,
    };
    if (typeof hit.tags === 'string' && hit.tags.length > 0)
        image.title = hit.tags;
    if (typeof hit.user === 'string' && hit.user.length > 0)
        image.author = hit.user;
    if (typeof hit.pageURL === 'string' && hit.pageURL.length > 0)
        image.sourceUrl = hit.pageURL;
    return image;
}
async function searchUnsplash(apiKey, query, page, perPage, orientation, signal, fetchFn) {
    const key = requireKey('unsplash', apiKey);
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    const orientationValue = orientationParam('unsplash', orientation);
    if (orientationValue !== undefined)
        url.searchParams.set('orientation', orientationValue);
    const response = await fetchFn(url, { signal, headers: { authorization: `Client-ID ${key}`, accept: 'application/json' } });
    if (!response.ok)
        badStatus('unsplash', response.status, await response.text());
    const payload = await response.json();
    const photos = payload.results ?? [];
    const images = photos.map(normalizeUnsplash).filter((image) => image !== null);
    return { total: payload.total ?? images.length, page, images };
}
function normalizeUnsplash(photo) {
    if (typeof photo.id !== 'string' || photo.id.length === 0)
        return null;
    const urls = photo.urls ?? {};
    const url = typeof urls.regular === 'string' ? urls.regular : typeof urls.full === 'string' ? urls.full ?? '' : '';
    const thumbUrl = typeof urls.small === 'string' ? urls.small : url;
    if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl))
        return null;
    const width = typeof photo.width === 'number' ? photo.width : 0;
    const height = typeof photo.height === 'number' ? photo.height : 0;
    const image = {
        id: `unsplash:${photo.id}`,
        url: /^https?:\/\//i.test(url) ? url : thumbUrl,
        thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
        width: width > 0 ? width : 800,
        height: height > 0 ? height : 600,
    };
    const title = typeof photo.alt_description === 'string' && photo.alt_description.length > 0
        ? photo.alt_description
        : typeof photo.description === 'string' && photo.description.length > 0 ? photo.description : undefined;
    if (title !== undefined)
        image.title = title;
    const author = typeof photo.user?.name === 'string' ? photo.user.name : undefined;
    if (author !== undefined && author.length > 0)
        image.author = author;
    const authorUrl = typeof photo.user?.links?.html === 'string' ? photo.user.links.html : undefined;
    if (authorUrl !== undefined && authorUrl.length > 0)
        image.authorUrl = authorUrl;
    const sourceUrl = typeof photo.links?.html === 'string' ? photo.links.html : undefined;
    if (sourceUrl !== undefined && sourceUrl.length > 0)
        image.sourceUrl = sourceUrl;
    if (typeof photo.color === 'string' && photo.color.length > 0)
        image.color = photo.color;
    return image;
}
