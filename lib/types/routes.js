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
import { keyFor, resolveCallRequest } from "./config.js";
import { ORIENTATIONS, PROVIDER_CHOICES } from "./core/outcome.js";
import { searchProvider } from "./providers.js";
/** Byte cap for proxied downloads. */
export const DOWNLOAD_CAP_BYTES = 30 * 1024 * 1024;
/** Timeout for proxied downloads and Eagle calls. */
export const ROUTE_TIMEOUT_MS = 25_000;
/** Eagle health probe timeout. */
export const EAGLE_STATUS_TIMEOUT_MS = 2_500;
/** JSON request-body cap for the Eagle route. */
export const MAX_EAGLE_BODY_BYTES = 64 * 1024;
/** Run one board search against the configured providers (reuses the tool path). */
export async function runBoardSearch(cfg, params) {
    const request = resolveCallRequest({
        query: params.q,
        ...params.provider === undefined ? {} : { provider: params.provider },
        ...params.page === undefined ? {} : { page: params.page },
        ...params.count === undefined ? {} : { count: params.count },
        ...params.orientation === undefined ? {} : { orientation: params.orientation },
    }, cfg);
    const result = await searchProvider(request.provider, keyFor(cfg, request.provider), request.query, request.page, request.count, request.orientation, undefined);
    const outcome = {
        query: request.query,
        provider: request.provider,
        page: request.page,
        perPage: result.images.length,
        total: result.total,
        truncated: result.total > request.page * result.images.length,
        images: result.images,
    };
    if (outcome.images.length === 0) {
        outcome.note = 'No results for this query; try a broader description or a different provider.';
    }
    return outcome;
}
/** Sanitize a display name into a safe download file name (no path separators). */
export function safeFileName(name, fallback) {
    const cleaned = name
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return cleaned.length > 0 ? cleaned : fallback;
}
/** Extension from a URL pathname or a content type; '.img' as the last resort. */
export function extensionFor(url, contentType) {
    const match = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(?:$|[?#])/i.exec(url);
    if (match !== null)
        return `.${match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()}`;
    if (contentType !== null) {
        const subtype = contentType.split(';')[0]?.split('/')[1]?.toLowerCase();
        if (subtype === 'jpeg')
            return '.jpg';
        if (subtype !== undefined && subtype.length > 0 && subtype.length <= 8 && /^[a-z0-9+-]+$/.test(subtype))
            return `.${subtype}`;
    }
    return '.img';
}
/** Write one JSON envelope response. */
function json(res, envelope, status = 200) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(envelope));
}
/** Read a JSON request body up to a byte cap; null when unparseable or oversized. */
async function readJsonBody(req, cap) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        chunks.push(buffer);
        total += buffer.length;
        if (total > cap)
            return null;
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (text === '')
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
/** Eagle API base for the configured port. */
function eagleBase(port) {
    return `http://127.0.0.1:${port}`;
}
/** Token query suffix when the user configured one. */
function eagleTokenQuery(token) {
    const trimmed = (token ?? '').trim();
    return trimmed.length > 0 ? `?token=${encodeURIComponent(trimmed)}` : '';
}
/** GET /refpics/search: direct board search, same path as the tool. */
async function serveSearch(cfg, req, res) {
    const url = new URL(req.url ?? '/', 'http://x');
    const q = url.searchParams.get('q');
    if (q === null || q.trim().length === 0) {
        json(res, { ok: false, error: { code: 'rejected', message: 'query parameter "q" must be a non-empty description' } }, 400);
        return;
    }
    const providerRaw = url.searchParams.get('provider');
    if (providerRaw !== null && !PROVIDER_CHOICES.includes(providerRaw)) {
        json(res, { ok: false, error: { code: 'rejected', message: `provider must be one of ${PROVIDER_CHOICES.join(', ')}` } }, 400);
        return;
    }
    const orientationRaw = url.searchParams.get('orientation');
    if (orientationRaw !== null && !ORIENTATIONS.includes(orientationRaw)) {
        json(res, { ok: false, error: { code: 'rejected', message: `orientation must be one of ${ORIENTATIONS.join(', ')}` } }, 400);
        return;
    }
    const page = url.searchParams.get('page') === null ? undefined : Number(url.searchParams.get('page'));
    const count = url.searchParams.get('count') === null ? undefined : Number(url.searchParams.get('count'));
    try {
        const outcome = await runBoardSearch(cfg, {
            q: q.trim(),
            ...providerRaw === null ? {} : { provider: providerRaw },
            ...page === undefined || !Number.isFinite(page) ? {} : { page },
            ...count === undefined || !Number.isFinite(count) ? {} : { count },
            ...orientationRaw === null ? {} : { orientation: orientationRaw },
        });
        json(res, { ok: true, outcome });
    }
    catch (error) {
        json(res, { ok: false, error: { code: 'internal', message: error.message ?? String(error) } }, 502);
    }
}
/** GET /refpics/download: stream one provider image back as an attachment. */
async function serveDownload(req, res) {
    const url = new URL(req.url ?? '/', 'http://x');
    const target = url.searchParams.get('url');
    const name = url.searchParams.get('name') ?? 'image';
    if (target === null || !/^https?:\/\//i.test(target)) {
        json(res, { ok: false, error: { code: 'rejected', message: 'parameter "url" must be an http(s) image URL' } }, 400);
        return;
    }
    let response;
    try {
        response = await fetch(target, { signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS), redirect: 'follow', headers: { accept: 'image/*' } });
    }
    catch {
        json(res, { ok: false, error: { code: 'internal', message: 'the image host did not answer in time' } }, 502);
        return;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.toLowerCase().startsWith('image/')) {
        json(res, { ok: false, error: { code: 'rejected', message: `the image host answered ${response.status} with a non-image payload` } }, 502);
        return;
    }
    const extension = extensionFor(target, contentType);
    const encoded = encodeURIComponent(safeFileName(name, 'image')).replace(/['()]/g, '');
    const disposition = `attachment; filename*=UTF-8''${encoded}${extension}`;
    const length = response.headers.get('content-length');
    const headers = {
        'content-type': contentType.split(';')[0] ?? 'application/octet-stream',
        'content-disposition': disposition,
        'cache-control': 'private, max-age=3600',
    };
    if (length !== null && /^\d+$/.test(length) && Number(length) <= DOWNLOAD_CAP_BYTES)
        headers['content-length'] = length;
    res.writeHead(200, headers);
    if (response.body === null) {
        res.end();
        return;
    }
    let total = 0;
    try {
        for await (const chunk of response.body) {
            total += chunk.length;
            if (total > DOWNLOAD_CAP_BYTES) {
                res.destroy();
                return;
            }
            res.write(chunk);
        }
        res.end();
    }
    catch {
        res.destroy();
    }
}
/** GET /refpics/eagle/status: whether the local Eagle API answers. */
async function serveEagleStatus(cfg, res) {
    if (cfg.eaglePort === 0) {
        json(res, { ok: false, message: 'Eagle integration is disabled (eaglePort = 0)' });
        return;
    }
    try {
        const response = await fetch(`${eagleBase(cfg.eaglePort)}/api/application/info${eagleTokenQuery(cfg.eagleToken)}`, {
            signal: AbortSignal.timeout(EAGLE_STATUS_TIMEOUT_MS),
        });
        if (response.ok) {
            const body = await response.json().catch(() => null);
            json(res, { ok: true, version: body?.data?.version ?? 'unknown' });
        }
        else {
            json(res, { ok: false, message: `Eagle answered ${response.status}` });
        }
    }
    catch {
        json(res, { ok: false, message: 'Eagle 未运行或端口不对 (请先打开 Eagle，默认端口 41595)' });
    }
}
/** POST /refpics/eagle: add one image URL to Eagle. */
async function serveEagleAdd(cfg, req, res) {
    if (cfg.eaglePort === 0) {
        json(res, { ok: false, message: 'Eagle integration is disabled (eaglePort = 0)' }, 400);
        return;
    }
    const body = await readJsonBody(req, MAX_EAGLE_BODY_BYTES);
    if (typeof body !== 'object' || body === null) {
        json(res, { ok: false, message: 'request body must be a JSON object' }, 400);
        return;
    }
    const record = body;
    const imageUrl = typeof record.url === 'string' ? record.url : '';
    const name = typeof record.name === 'string' ? safeFileName(record.name, 'image') : 'image';
    if (!/^https?:\/\//i.test(imageUrl)) {
        json(res, { ok: false, message: 'url must be an http(s) image URL' }, 400);
        return;
    }
    const item = { url: imageUrl, name };
    if (typeof record.website === 'string' && record.website.length > 0)
        item.website = record.website;
    if (Array.isArray(record.tags)) {
        const tags = record.tags.filter((tag) => typeof tag === 'string' && tag.length > 0).slice(0, 12);
        if (tags.length > 0)
            item.tags = tags;
    }
    try {
        const response = await fetch(`${eagleBase(cfg.eaglePort)}/api/item/addFromURLs${eagleTokenQuery(cfg.eagleToken)}`, {
            method: 'POST',
            signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ items: [item] }),
        });
        const envelope = await response.json().catch(() => null);
        if (response.ok && envelope?.status === 'success') {
            json(res, { ok: true, message: '已保存到 Eagle' });
        }
        else {
            json(res, { ok: false, message: `Eagle 保存失败: ${envelope?.status ?? response.status}` }, 502);
        }
    }
    catch {
        json(res, { ok: false, message: 'Eagle 未运行或端口不对 (请先打开 Eagle)' }, 502);
    }
}
/**
 * Register the /refpics prefix route on the shared webserver. The config
 * spec is read per request so the Settings card's changes (provider keys,
 * Eagle port/token) reach the very next call.
 * @param ctx - registrant context; the route registers only when the webserver is mounted.
 * @param spec - per-call resolved-config reader.
 */
export function registerRefpicsRoutes(ctx, spec) {
    const webserver = ctx.get('webServer');
    if (webserver === undefined)
        return;
    webserver.register({
        kind: 'prefix',
        path: '/refpics',
        handler: async (req, res) => {
            const pathname = new URL(req.url ?? '/', 'http://x').pathname;
            try {
                if (pathname === '/refpics/search') {
                    if (req.method !== 'GET')
                        return json(res, { ok: false, error: { code: 'rejected', message: 'only GET is allowed' } }, 405);
                    await serveSearch(spec(), req, res);
                    return;
                }
                if (pathname === '/refpics/download') {
                    if (req.method !== 'GET')
                        return json(res, { ok: false, error: { code: 'rejected', message: 'only GET is allowed' } }, 405);
                    await serveDownload(req, res);
                    return;
                }
                if (pathname === '/refpics/eagle/status') {
                    if (req.method !== 'GET')
                        return json(res, { ok: false, error: { code: 'rejected', message: 'only GET is allowed' } }, 405);
                    await serveEagleStatus(spec(), res);
                    return;
                }
                if (pathname === '/refpics/eagle') {
                    if (req.method !== 'POST')
                        return json(res, { ok: false, error: { code: 'rejected', message: 'only POST is allowed' } }, 405);
                    await serveEagleAdd(spec(), req, res);
                    return;
                }
                res.writeHead(404);
                res.end();
            }
            catch (error) {
                json(res, { ok: false, error: { code: 'internal', message: error.message ?? String(error) } }, 500);
            }
        },
    });
}
