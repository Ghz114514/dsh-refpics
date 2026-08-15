import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Shared Pinterest-style wall components for dsh-refpics, rendered by both
 * the chat toolview (keyed tool.call.toolview entry) and the sidebar board
 * tab. Fully presentational: data arrives as props, side effects (agent
 * round trips, downloads, Eagle saves) arrive as callbacks, so the same
 * tree renders in both hosts. The lightbox owns keyboard navigation and
 * its download / save-to-Eagle action state.
 *
 * @module dsh-refpics/client/wall
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { openDownload, saveToEagle } from "./actions.js";
import { outcomeSummary } from "../core/outcome.js";
import { ensureStyle } from "./styles.js";
ensureStyle();
const COPY = {
    zh: {
        searching: '正在搜索参考图…',
        clickHint: '点击图片查看大图',
        empty: '没有找到匹配的图片，换一个更宽泛的描述再试试。',
        openSource: '原站',
        openFull: '原图',
        download: '下载',
        saveEagle: '存 Eagle',
        savedEagle: '已保存到 Eagle',
        savingEagle: '正在保存…',
        refresh: '换一批',
        nextPage: '下一页',
        openBoard: '在侧边栏打开',
        search: '搜索',
        searchPlaceholder: '描述你想找的参考图…',
        sent: '已发送，稍等新结果…',
        images: '张',
        close: '关闭',
        previous: '上一张',
        next: '下一张',
        of: '/',
        eagleUnavailable: 'Eagle 未运行 (请先打开 Eagle)',
    },
    en: {
        searching: 'Searching for reference images…',
        clickHint: 'Click any image to enlarge',
        empty: 'No matches found; try a broader description.',
        openSource: 'Source',
        openFull: 'Full size',
        download: 'Download',
        saveEagle: 'Save to Eagle',
        savedEagle: 'Saved to Eagle',
        savingEagle: 'Saving…',
        refresh: 'Shuffle',
        nextPage: 'Next page',
        openBoard: 'Open in sidebar',
        search: 'Search',
        searchPlaceholder: 'Describe the references you want…',
        sent: 'Sent; the next batch is on its way…',
        images: 'images',
        close: 'Close',
        previous: 'Previous',
        next: 'Next',
        of: '/',
        eagleUnavailable: 'Eagle is not running',
    },
};
/** Active copy dictionary, following the shell's document language. */
export function copy() {
    const lang = document.documentElement.lang ?? '';
    return lang === 'zh' || lang.startsWith('zh-') ? COPY.zh : COPY.en;
}
/** Skeleton masonry shown while a search runs. */
export const RunningWall = memo(function RunningWall() {
    const t = copy();
    const ratios = [1.3, 0.8, 1.1, 0.7, 1.25, 0.95, 1.4, 0.75];
    return (_jsxs("div", { className: "rfp-root", children: [_jsx("div", { className: "rfp-wall", "aria-hidden": true, children: ratios.map((ratio, index) => (_jsx("div", { className: "rfp-skel", style: { aspectRatio: String(ratio) } }, index))) }), _jsx("div", { className: "rfp-hint", children: t.searching })] }));
});
/** Quick actions shared by the card overlay and the lightbox caption. */
function EagleSaveButton({ image }) {
    const t = copy();
    const [phase, setPhase] = useState('idle');
    const [message, setMessage] = useState('');
    const onClick = useCallback((event) => {
        event.stopPropagation();
        if (phase === 'busy')
            return;
        setPhase('busy');
        setMessage('');
        void saveToEagle(image).then((result) => {
            setPhase(result.ok ? 'ok' : 'error');
            setMessage(result.message);
        });
    }, [image, phase]);
    const label = phase === 'busy' ? t.savingEagle : phase === 'ok' ? t.savedEagle : t.saveEagle;
    return (_jsx("button", { type: "button", className: "rfp-mini-btn", title: message.length > 0 ? message : undefined, disabled: phase === 'busy' || phase === 'ok', onClick: onClick, children: label }));
}
/** One image card in the wall. */
const Card = memo(function Card({ image, onOpen }) {
    const t = copy();
    const open = useCallback(() => onOpen(image), [image, onOpen]);
    return (_jsxs("figure", { className: "rfp-card", tabIndex: 0, onClick: open, onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        }, children: [_jsx("img", { src: image.thumbUrl, alt: image.title ?? image.author ?? '', loading: "lazy", decoding: "async", style: { aspectRatio: `${image.width} / ${image.height}` } }), _jsxs("div", { className: "rfp-card-actions", onClick: (event) => event.stopPropagation(), children: [_jsx("button", { type: "button", className: "rfp-mini-btn", onClick: () => openDownload(image), children: t.download }), _jsx(EagleSaveButton, { image: image })] }), _jsxs("figcaption", { className: "rfp-overlay", children: [image.title !== undefined && image.title.length > 0 && (_jsx("div", { className: "rfp-title", children: image.title })), image.author !== undefined && image.author.length > 0 && (_jsx("div", { className: "rfp-author", children: image.author }))] })] }));
});
/** Lightbox overlay with keyboard navigation and save/download actions. */
function Lightbox({ images, index, onClose, onNav }) {
    const t = copy();
    const image = images[index];
    const [degraded, setDegraded] = useState(false);
    const [eagle, setEagle] = useState({ phase: 'idle', message: '' });
    useEffect(() => {
        setDegraded(false);
        setEagle({ phase: 'idle', message: '' });
    }, [index]);
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (event) => {
            if (event.key === 'Escape')
                onClose();
            else if (event.key === 'ArrowLeft')
                onNav((index - 1 + images.length) % images.length);
            else if (event.key === 'ArrowRight')
                onNav((index + 1) % images.length);
        };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener('keydown', onKey);
        };
    }, [images.length, index, onClose, onNav]);
    if (image === undefined)
        return null;
    const src = degraded ? image.thumbUrl : image.url;
    const save = () => {
        if (eagle.phase === 'busy')
            return;
        setEagle({ phase: 'busy', message: '' });
        void saveToEagle(image).then((result) => {
            setEagle({ phase: result.ok ? 'ok' : 'error', message: result.message });
        });
    };
    return (_jsxs("div", { className: "rfp-lb", role: "dialog", "aria-modal": "true", onClick: onClose, children: [_jsx("img", { src: src, alt: image.title ?? image.author ?? '', onClick: (event) => event.stopPropagation(), onError: () => {
                    if (!degraded)
                        setDegraded(true);
                } }), _jsx("button", { type: "button", className: "rfp-lb-btn rfp-lb-close", "aria-label": t.close, onClick: onClose, children: "\u00D7" }), images.length > 1 && (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "rfp-lb-btn rfp-lb-prev", "aria-label": t.previous, onClick: (event) => {
                            event.stopPropagation();
                            onNav((index - 1 + images.length) % images.length);
                        }, children: "\u2039" }), _jsx("button", { type: "button", className: "rfp-lb-btn rfp-lb-next", "aria-label": t.next, onClick: (event) => {
                            event.stopPropagation();
                            onNav((index + 1) % images.length);
                        }, children: "\u203A" })] })), _jsxs("div", { className: "rfp-lb-caption", onClick: (event) => event.stopPropagation(), children: [image.title !== undefined && image.title.length > 0 && (_jsx("div", { className: "rfp-lb-title", children: image.title })), image.author !== undefined && image.author.length > 0 && (_jsx("span", { className: "rfp-lb-meta", children: image.author })), images.length > 1 && (_jsxs("span", { className: "rfp-lb-count", children: [index + 1, " ", t.of, " ", images.length] })), image.sourceUrl !== undefined && (_jsx("a", { className: "rfp-lb-link", href: image.sourceUrl, target: "_blank", rel: "noreferrer noopener", children: t.openSource })), _jsx("a", { className: "rfp-lb-link", href: image.url, target: "_blank", rel: "noreferrer noopener", children: t.openFull }), _jsx("button", { type: "button", className: "rfp-mini-btn", onClick: () => openDownload(image), children: t.download }), _jsx("button", { type: "button", className: "rfp-mini-btn", disabled: eagle.phase === 'busy' || eagle.phase === 'ok', onClick: save, children: eagle.phase === 'busy' ? t.savingEagle : eagle.phase === 'ok' ? t.savedEagle : t.saveEagle }), eagle.phase !== 'idle' && (_jsx("span", { className: `rfp-lb-eagle ${eagle.phase === 'ok' ? 'rfp-lb-eagle-ok' : 'rfp-lb-eagle-err'}`, children: eagle.message }))] })] }));
}
/** The full wall: header with actions, masonry grid, and the lightbox. */
export function RefPicsWall({ outcome, actions }) {
    const t = copy();
    const [active, setActive] = useState(null);
    const [sent, setSent] = useState(false);
    const onNav = useCallback((next) => {
        setActive(next);
    }, []);
    const onClose = useCallback(() => {
        setActive(null);
    }, []);
    useEffect(() => {
        setSent(false);
    }, [outcome, actions?.busy]);
    const fire = (handler) => {
        if (handler === undefined || actions?.busy === true)
            return;
        setSent(true);
        handler();
    };
    if (outcome.images.length === 0) {
        return (_jsxs("div", { className: "rfp-root", children: [_jsxs("div", { className: "rfp-head", children: [_jsx("span", { className: "rfp-head-query", children: outcome.query }), _jsx("span", { className: "rfp-head-meta", children: outcomeSummary(outcome) })] }), _jsx("div", { className: "rfp-empty", children: t.empty })] }));
    }
    return (_jsxs("div", { className: "rfp-root", children: [_jsxs("div", { className: "rfp-head", children: [_jsx("span", { className: "rfp-head-query", children: outcome.query }), _jsx("span", { className: "rfp-head-meta", children: outcomeSummary(outcome) }), _jsx("span", { className: "rfp-chip", children: outcome.provider }), _jsx("span", { className: "rfp-hint", children: t.clickHint })] }), (actions?.onRefresh !== undefined || actions?.onNextPage !== undefined || actions?.onOpenBoard !== undefined) && (_jsxs("div", { className: "rfp-actions", children: [actions.onRefresh !== undefined && (_jsx("button", { type: "button", className: "rfp-btn rfp-btn-primary", disabled: actions.busy === true, onClick: () => fire(actions.onRefresh), children: t.refresh })), actions.onNextPage !== undefined && outcome.truncated && (_jsxs("button", { type: "button", className: "rfp-btn", disabled: actions.busy === true, onClick: () => fire(actions.onNextPage), children: [t.nextPage, " (", outcome.page + 1, ")"] })), actions.onOpenBoard !== undefined && (_jsx("button", { type: "button", className: "rfp-btn", onClick: actions.onOpenBoard, children: t.openBoard })), actions.error !== undefined && _jsx("span", { className: "rfp-send-err", children: actions.error }), actions.error === undefined && sent && _jsx("span", { className: "rfp-hint", children: actions.sentNote ?? t.sent })] })), _jsx("div", { className: "rfp-wall", children: outcome.images.map((image, index) => (_jsx(Card, { image: image, onOpen: () => setActive(index) }, image.id))) }), active !== null && (_jsx(Lightbox, { images: outcome.images, index: active, onClose: onClose, onNav: onNav }))] }));
}
