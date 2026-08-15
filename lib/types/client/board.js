import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The sidebar board tab (dsh-better-sidebar integration): a Pinterest-style
 * reference board living in the right sidebar, registered as a
 * single-instance tab (`refpics:board`) through the `betterSidebar`
 * service. It mirrors the latest chat search for the session and can run
 * its own searches directly through the host /refpics/search route — 换一批
 * and 翻页 work without an agent round trip here. All state is per-session
 * in the shared store.
 *
 * @module dsh-refpics/client/board
 */
import { useCallback, useState, useSyncExternalStore } from 'react';
import { ORIENTATIONS, PROVIDER_CHOICES } from "../core/outcome.js";
import { searchRemote } from "./actions.js";
import { getSnapshot, setBoardError, setBoardLoading, setBoardOutcome, subscribe } from "./store.js";
import { RefPicsWall, RunningWall, copy } from "./wall.js";
/** Small masonry-grid glyph for the tab strip (text-only, theme-colored). */
export function RefpicsBoardIcon({ size = 14 }) {
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true, children: [_jsx("rect", { x: "1", y: "1", width: "6", height: "8", rx: "1", fill: "currentColor", opacity: "0.9" }), _jsx("rect", { x: "9", y: "1", width: "6", height: "5", rx: "1", fill: "currentColor", opacity: "0.6" }), _jsx("rect", { x: "1", y: "11", width: "6", height: "4", rx: "1", fill: "currentColor", opacity: "0.6" }), _jsx("rect", { x: "9", y: "8", width: "6", height: "7", rx: "1", fill: "currentColor", opacity: "0.9" })] }));
}
/** The sidebar tab component: search box, batch controls, and the wall. */
export function RefpicsBoardTab(props) {
    const { scope } = props;
    const sessionId = scope.sessionId;
    const t = copy();
    const snapshot = useSyncExternalStore(subscribe, getSnapshot);
    const board = snapshot.boards.get(sessionId);
    const chatOutcome = snapshot.chat.get(sessionId);
    const [query, setQuery] = useState('');
    const [provider, setProvider] = useState('auto');
    const [orientation, setOrientation] = useState('any');
    const outcome = board?.outcome ?? chatOutcome ?? null;
    const run = useCallback(async (options) => {
        // The input box wins when typed into; otherwise the current wall's query
        // carries 换一批/翻页 so those buttons work on mirrored chat results too.
        const fallback = outcome?.query ?? '';
        const q = (options?.queryOverride ?? query).trim() || fallback.trim();
        if (q.length === 0) {
            setBoardError(sessionId, '先输入一句描述再搜索');
            return;
        }
        let page = options?.page;
        if (options?.shuffle === true)
            page = 1 + Math.floor(Math.random() * 6);
        setBoardLoading(sessionId);
        const result = await searchRemote({
            q,
            provider,
            orientation,
            ...page === undefined ? {} : { page },
        });
        if (result.ok)
            setBoardOutcome(sessionId, result.outcome);
        else
            setBoardError(sessionId, result.message);
    }, [query, provider, orientation, sessionId, outcome?.query]);
    const showWall = outcome !== null || board?.loading === true;
    const emptyHint = board?.error === null && outcome === null;
    return (_jsxs("div", { className: "rfp-board", children: [_jsxs("div", { className: "rfp-board-search", children: [_jsx("input", { className: "rfp-input", type: "text", value: query, placeholder: t.searchPlaceholder, onChange: (event) => setQuery(event.target.value), onKeyDown: (event) => {
                            if (event.key === 'Enter')
                                void run();
                        } }), _jsx("select", { className: "rfp-select", value: provider, onChange: (event) => setProvider(event.target.value), children: PROVIDER_CHOICES.map((choice) => (_jsx("option", { value: choice, children: choice }, choice))) }), _jsx("select", { className: "rfp-select", value: orientation, onChange: (event) => setOrientation(event.target.value), children: ORIENTATIONS.map((choice) => (_jsx("option", { value: choice, children: choice }, choice))) }), _jsx("button", { type: "button", className: "rfp-btn rfp-btn-primary", onClick: () => void run(), children: t.search })] }), board?.error !== null && board?.error !== undefined && (_jsx("div", { className: "rfp-error", style: { marginBottom: 10 }, children: board.error })), board?.loading === true && _jsx(RunningWall, {}), showWall && outcome !== null && !board?.loading && (_jsx(RefPicsWall, { outcome: outcome, actions: {
                    onRefresh: () => void run({ shuffle: true }),
                    onNextPage: () => void run({ page: outcome.page + 1 }),
                } })), !showWall && emptyHint && (_jsx("div", { className: "rfp-board-empty", children: sessionId === undefined || sessionId.length === 0
                    ? '当前没有选中的会话。'
                    : '还没有参考图：在上方输入描述直接搜索，或在对话里让模型用 search_refs 搜索，最新结果会同步到这里。' }))] }));
}
export default RefpicsBoardTab;
