/**
 * Host-route action helpers for the wall and the board: proxied download,
 * save-to-Eagle, and the direct board search. All calls stay same-origin
 * with the web shell; every response is soft-parsed so a version drift or a
 * stopped Eagle app surfaces as a message instead of a thrown render.
 *
 * @module dsh-refpics/client/actions
 */
import { narrowOutcome } from "../core/outcome.js";
/** Display/download name for one image (provider id plus a trimmed title). */
export function fileNameFor(image) {
    const title = (image.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 64);
    return title.length > 0 ? title : `refpics-${image.id.replace(/[^a-z0-9-]/gi, '').slice(0, 16)}`;
}
/** Start the proxied attachment download for one image. */
export function openDownload(image) {
    const url = new URL('/refpics/download', window.location.origin);
    url.searchParams.set('url', image.url);
    url.searchParams.set('name', fileNameFor(image));
    const anchor = document.createElement('a');
    anchor.href = url.href;
    anchor.download = fileNameFor(image);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}
/** Ask the host to add one image to the local Eagle app. */
export async function saveToEagle(image) {
    try {
        const response = await fetch('/refpics/eagle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                url: image.url,
                name: fileNameFor(image),
                website: image.sourceUrl ?? '',
                tags: ['refpics'],
            }),
        });
        const body = await response.json().catch(() => null);
        if (body?.ok === true)
            return { ok: true, message: body.message ?? '已保存到 Eagle' };
        return { ok: false, message: body?.message ?? `保存失败 (HTTP ${response.status})` };
    }
    catch {
        return { ok: false, message: '无法连接插件服务，请稍后再试' };
    }
}
/** Run a direct search through the host route (the sidebar board's path). */
export async function searchRemote(params) {
    const url = new URL('/refpics/search', window.location.origin);
    url.searchParams.set('q', params.q);
    if (params.provider !== undefined)
        url.searchParams.set('provider', params.provider);
    if (params.page !== undefined)
        url.searchParams.set('page', String(params.page));
    if (params.count !== undefined)
        url.searchParams.set('count', String(params.count));
    if (params.orientation !== undefined)
        url.searchParams.set('orientation', params.orientation);
    try {
        const response = await fetch(url.href);
        const body = await response.json().catch(() => null);
        if (body?.ok === true) {
            const outcome = narrowOutcome(body.outcome);
            if (outcome !== null)
                return { ok: true, outcome };
            return { ok: false, message: '服务返回了无法解析的结果' };
        }
        return { ok: false, message: body?.error?.message ?? `搜索失败 (HTTP ${response.status})` };
    }
    catch {
        return { ok: false, message: '无法连接插件服务，请稍后再试' };
    }
}
