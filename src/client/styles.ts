/**
 * Injected styles for the search_refs toolview: a Pinterest-style masonry
 * wall plus the lightbox. The CSS string is injected once into a
 * <style data-plugin-css> tag at module materialization (same lifecycle
 * contract as the family preset's CSS-modules step, minus the build
 * machinery). The palette reads the shell's alias tokens where available
 * and falls back to neutral dark values, so the wall stays readable under
 * both GUI themes.
 *
 * @module dsh-refpics/client/styles
 */

const CSS = `
.rfp-root { font-family: inherit; }
.rfp-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 2px 0 10px; }
.rfp-head-query { font-size: 13px; font-weight: 600; color: var(--dsw-alias-text-l1, #e8eaed); }
.rfp-head-meta { font-size: 12px; color: var(--dsw-alias-text-l2, #9aa0a6); }
.rfp-chip { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; line-height: 16px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.14)); color: var(--dsw-alias-text-l2, #9aa0a6); background: var(--dsw-alias-bg-l2, rgba(127,127,127,.08)); }
.rfp-hint { font-size: 11px; color: var(--dsw-alias-text-l3, #6f7479); }
.rfp-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
.rfp-btn { display: inline-flex; align-items: center; gap: 4px; padding: 3px 12px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.16)); background: var(--dsw-alias-bg-l2, rgba(127,127,127,.08)); color: var(--dsw-alias-text-l1, #e8eaed); font-size: 12px; line-height: 18px; cursor: pointer; user-select: none; }
.rfp-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l1, rgba(255,255,255,.3)); background: var(--dsw-alias-bg-l3, rgba(127,127,127,.16)); }
.rfp-btn:disabled { opacity: .45; cursor: default; }
.rfp-btn-primary { background: rgba(94,140,255,.16); border-color: rgba(94,140,255,.4); color: #b9ccff; }
.rfp-btn-primary:hover:not(:disabled) { background: rgba(94,140,255,.26); }
.rfp-card-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; opacity: 0; transition: opacity .16s ease; pointer-events: none; }
.rfp-card:hover .rfp-card-actions, .rfp-card:focus-visible .rfp-card-actions { opacity: 1; pointer-events: auto; }
.rfp-mini-btn { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(8,10,14,.62); color: #fff; font-size: 11px; line-height: 16px; cursor: pointer; backdrop-filter: blur(4px); }
.rfp-mini-btn:hover { background: rgba(24,28,38,.85); }
.rfp-mini-btn:disabled { opacity: .55; cursor: default; }
.rfp-lb-eagle { display: inline-flex; align-items: center; gap: 6px; color: rgba(255,255,255,.78); font-size: 12px; }
.rfp-lb-eagle-ok { color: #8fd69b; }
.rfp-lb-eagle-err { color: #e8a29b; }
.rfp-board { display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding: 12px; box-sizing: border-box; }
.rfp-board-search { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.rfp-input { flex: 1 1 140px; min-width: 0; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.16)); background: var(--dsw-alias-bg-l2, rgba(127,127,127,.07)); color: var(--dsw-alias-text-l1, #e8eaed); font-size: 12px; line-height: 20px; outline: none; }
.rfp-input:focus { border-color: rgba(94,140,255,.6); }
.rfp-select { padding: 4px 6px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.16)); background: var(--dsw-alias-bg-l2, rgba(127,127,127,.07)); color: var(--dsw-alias-text-l1, #e8eaed); font-size: 12px; line-height: 20px; outline: none; }
.rfp-board-empty { padding: 18px 14px; border-radius: 12px; border: 1px dashed var(--dsw-alias-border-l2, rgba(255,255,255,.16)); color: var(--dsw-alias-text-l2, #9aa0a6); font-size: 12.5px; line-height: 1.6; }
.rfp-board-loading { padding: 10px 2px; color: var(--dsw-alias-text-l2, #9aa0a6); font-size: 12px; }
.rfp-send-err { color: #e8a29b; font-size: 12px; line-height: 1.4; }
.rfp-wall { column-width: 232px; column-gap: 12px; }
.rfp-card { break-inside: avoid; margin: 0 0 12px; border-radius: 12px; overflow: hidden; position: relative; cursor: zoom-in; background: var(--dsw-alias-bg-l2, rgba(127,127,127,.07)); border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.08)); transition: transform .16s ease; }
.rfp-card:hover { transform: translateY(-2px); }
.rfp-card img { display: block; width: 100%; height: auto; }
.rfp-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; padding: 34px 10px 9px; background: linear-gradient(to top, rgba(6,8,12,.78), rgba(6,8,12,.14) 46%, transparent); opacity: 0; transition: opacity .16s ease; pointer-events: none; }
.rfp-card:hover .rfp-overlay, .rfp-card:focus-visible .rfp-overlay { opacity: 1; }
.rfp-title { font-size: 12px; line-height: 1.4; color: #fff; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rfp-author { font-size: 11px; color: rgba(255,255,255,.78); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rfp-skel { break-inside: avoid; margin: 0 0 12px; border-radius: 12px; background: linear-gradient(100deg, var(--dsw-alias-bg-l2, rgba(127,127,127,.07)) 40%, rgba(160,170,190,.16) 50%, var(--dsw-alias-bg-l2, rgba(127,127,127,.07)) 60%); background-size: 200% 100%; animation: rfp-shimmer 1.4s ease-in-out infinite; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.05)); }
@keyframes rfp-shimmer { from { background-position: 120% 0; } to { background-position: -80% 0; } }
.rfp-empty { padding: 22px 16px; border-radius: 12px; border: 1px dashed var(--dsw-alias-border-l2, rgba(255,255,255,.16)); color: var(--dsw-alias-text-l2, #9aa0a6); font-size: 13px; }
.rfp-error { padding: 14px 16px; border-radius: 10px; border: 1px solid rgba(214,90,76,.4); background: rgba(214,90,76,.1); color: #e8a29b; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.rfp-plain { padding: 12px 14px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.1)); font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-text-l1, #e8eaed); white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow: auto; }
.rfp-lb { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; background: rgba(5,7,10,.88); backdrop-filter: blur(8px); animation: rfp-fade .14s ease; }
@keyframes rfp-fade { from { opacity: 0; } to { opacity: 1; } }
.rfp-lb img { max-width: min(92vw, 1500px); max-height: 84vh; border-radius: 10px; box-shadow: 0 24px 80px rgba(0,0,0,.5); }
.rfp-lb-btn { position: absolute; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,.18); background: rgba(12,14,18,.6); color: #fff; font-size: 18px; line-height: 1; cursor: pointer; user-select: none; }
.rfp-lb-btn:hover { background: rgba(30,34,42,.85); }
.rfp-lb-close { top: 18px; right: 18px; }
.rfp-lb-prev { left: 16px; top: 50%; transform: translateY(-50%); }
.rfp-lb-next { right: 16px; top: 50%; transform: translateY(-50%); }
.rfp-lb-caption { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); max-width: min(92vw, 1100px); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; padding: 10px 16px; border-radius: 12px; background: rgba(10,12,16,.72); border: 1px solid rgba(255,255,255,.1); }
.rfp-lb-title { color: #fff; font-size: 13px; max-width: 520px; }
.rfp-lb-meta { color: rgba(255,255,255,.72); font-size: 12px; }
.rfp-lb-link { color: #9ec5ff; font-size: 12px; text-decoration: none; }
.rfp-lb-link:hover { text-decoration: underline; }
.rfp-lb-count { color: rgba(255,255,255,.6); font-size: 12px; }
@media (max-width: 640px) {
  .rfp-wall { column-width: 160px; }
  .rfp-lb-btn { width: 34px; height: 34px; }
}
`

const STYLE_TAG_ID = 'dsh-refpics/styles'

/** Inject the stylesheet once per page load; idempotent under re-evaluation. */
export function ensureStyle(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-refpics'
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

export { CSS }
