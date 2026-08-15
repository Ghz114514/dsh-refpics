window.__ModuleLoader__.load({
	id: "dsh-refpics",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/core/outcome.ts
		/** Provider ids the tool can address. */
		const PROVIDERS = [
			"openverse",
			"pexels",
			"pixabay",
			"unsplash"
		];
		/** Provider choice accepted in tool arguments: an explicit id or auto-resolve. */
		const PROVIDER_CHOICES = ["auto", ...PROVIDERS];
		/** Orientation filter accepted in tool arguments. */
		const ORIENTATIONS = [
			"any",
			"landscape",
			"portrait",
			"square"
		];
		/** Soft-narrow an unknown value to a RefImage; null for anything unusable. */
		function narrowRefImage(value) {
			if (typeof value !== "object" || value === null) return null;
			const record = value;
			if (typeof record.id !== "string" || record.id.length === 0) return null;
			if (typeof record.url !== "string" || !/^https?:\/\//i.test(record.url)) return null;
			if (typeof record.thumbUrl !== "string" || !/^https?:\/\//i.test(record.thumbUrl)) return null;
			if (typeof record.width !== "number" || typeof record.height !== "number") return null;
			const image = {
				id: record.id,
				url: record.url,
				thumbUrl: record.thumbUrl,
				width: record.width,
				height: record.height
			};
			for (const field of [
				"title",
				"author",
				"authorUrl",
				"sourceUrl",
				"license",
				"color"
			]) {
				const raw = record[field];
				if (typeof raw === "string" && raw.length > 0) image[field] = raw;
			}
			return image;
		}
		/**
		* Soft-parse an unknown value (presentation metadata or a JSON text block)
		* into a RefPicsOutcome. Returns null for anything malformed so renderers
		* degrade to the generic card instead of throwing.
		*/
		function narrowOutcome(value) {
			if (typeof value !== "object" || value === null) return null;
			const record = value;
			if (typeof record.query !== "string") return null;
			if (typeof record.provider !== "string" || !PROVIDERS.includes(record.provider)) return null;
			if (typeof record.page !== "number" || typeof record.perPage !== "number" || typeof record.total !== "number") return null;
			if (record.truncated !== void 0 && typeof record.truncated !== "boolean") return null;
			if (!Array.isArray(record.images)) return null;
			const images = record.images.map(narrowRefImage).filter((image) => image !== null);
			const outcome = {
				query: record.query,
				provider: record.provider,
				page: record.page,
				perPage: record.perPage,
				total: record.total,
				truncated: record.truncated === true,
				images
			};
			if (typeof record.note === "string" && record.note.length > 0) outcome.note = record.note;
			return outcome;
		}
		/**
		* One-line header describing a completed search, used by the model-facing
		* text, the generic result title, and the masonry wall header.
		*/
		function outcomeSummary(outcome) {
			const plural = outcome.total === 1 ? "" : "s";
			return `${outcome.provider} · ${outcome.total} image${plural} · ${outcome.images.length} shown`;
		}
		//#endregion
		//#region src/client/actions.ts
		/**
		* Host-route action helpers for the wall and the board: proxied download,
		* save-to-Eagle, and the direct board search. All calls stay same-origin
		* with the web shell; every response is soft-parsed so a version drift or a
		* stopped Eagle app surfaces as a message instead of a thrown render.
		*
		* @module dsh-refpics/client/actions
		*/
		/** Display/download name for one image (provider id plus a trimmed title). */
		function fileNameFor(image) {
			const title = (image.title ?? "").replace(/\s+/g, " ").trim().slice(0, 64);
			return title.length > 0 ? title : `refpics-${image.id.replace(/[^a-z0-9-]/gi, "").slice(0, 16)}`;
		}
		/** Start the proxied attachment download for one image. */
		function openDownload(image) {
			const url = new URL("/refpics/download", window.location.origin);
			url.searchParams.set("url", image.url);
			url.searchParams.set("name", fileNameFor(image));
			const anchor = document.createElement("a");
			anchor.href = url.href;
			anchor.download = fileNameFor(image);
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
		}
		/** Ask the host to add one image to the local Eagle app. */
		async function saveToEagle(image) {
			try {
				const response = await fetch("/refpics/eagle", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						url: image.url,
						name: fileNameFor(image),
						website: image.sourceUrl ?? "",
						tags: ["refpics"]
					})
				});
				const body = await response.json().catch(() => null);
				if (body?.ok === true) return {
					ok: true,
					message: body.message ?? "已保存到 Eagle"
				};
				return {
					ok: false,
					message: body?.message ?? `保存失败 (HTTP ${response.status})`
				};
			} catch {
				return {
					ok: false,
					message: "无法连接插件服务，请稍后再试"
				};
			}
		}
		/** Run a direct search through the host route (the sidebar board's path). */
		async function searchRemote(params) {
			const url = new URL("/refpics/search", window.location.origin);
			url.searchParams.set("q", params.q);
			if (params.provider !== void 0) url.searchParams.set("provider", params.provider);
			if (params.page !== void 0) url.searchParams.set("page", String(params.page));
			if (params.count !== void 0) url.searchParams.set("count", String(params.count));
			if (params.orientation !== void 0) url.searchParams.set("orientation", params.orientation);
			try {
				const response = await fetch(url.href);
				const body = await response.json().catch(() => null);
				if (body?.ok === true) {
					const outcome = narrowOutcome(body.outcome);
					if (outcome !== null) return {
						ok: true,
						outcome
					};
					return {
						ok: false,
						message: "服务返回了无法解析的结果"
					};
				}
				return {
					ok: false,
					message: body?.error?.message ?? `搜索失败 (HTTP ${response.status})`
				};
			} catch {
				return {
					ok: false,
					message: "无法连接插件服务，请稍后再试"
				};
			}
		}
		//#endregion
		//#region src/client/store.ts
		const EMPTY_BOARD = {
			outcome: null,
			loading: false,
			error: null
		};
		let snapshot = {
			chat: /* @__PURE__ */ new Map(),
			boards: /* @__PURE__ */ new Map(),
			chatSeq: /* @__PURE__ */ new Map(),
			version: 0
		};
		const listeners = /* @__PURE__ */ new Set();
		function publish(next) {
			snapshot = next;
			for (const listener of listeners) listener();
		}
		/** Subscribe to store changes (useSyncExternalStore contract). */
		function subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
		/** Current snapshot (useSyncExternalStore contract; stable between changes). */
		function getSnapshot() {
			return snapshot;
		}
		/** Record one chat-rendered outcome; a lower-seq outcome never regresses the board source. */
		function recordChatOutcome(sessionId, seq, outcome) {
			if (seq < (snapshot.chatSeq.get(sessionId) ?? -1)) return;
			const chat = new Map(snapshot.chat);
			chat.set(sessionId, outcome);
			const chatSeq = new Map(snapshot.chatSeq);
			chatSeq.set(sessionId, seq);
			publish({
				...snapshot,
				chat,
				chatSeq,
				version: snapshot.version + 1
			});
		}
		/** Mark one session's board as searching. */
		function setBoardLoading(sessionId) {
			const boards = new Map(snapshot.boards);
			const current = boards.get(sessionId) ?? EMPTY_BOARD;
			boards.set(sessionId, {
				...current,
				loading: true,
				error: null
			});
			publish({
				...snapshot,
				boards,
				version: snapshot.version + 1
			});
		}
		/** Settle one session's board with a search outcome. */
		function setBoardOutcome(sessionId, outcome) {
			const boards = new Map(snapshot.boards);
			boards.get(sessionId);
			boards.set(sessionId, {
				outcome,
				loading: false,
				error: null
			});
			publish({
				...snapshot,
				boards,
				version: snapshot.version + 1
			});
		}
		/** Settle one session's board with a failure message. */
		function setBoardError(sessionId, message) {
			const boards = new Map(snapshot.boards);
			const current = boards.get(sessionId) ?? EMPTY_BOARD;
			boards.set(sessionId, {
				...current,
				loading: false,
				error: message
			});
			publish({
				...snapshot,
				boards,
				version: snapshot.version + 1
			});
		}
		//#endregion
		//#region src/client/styles.ts
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
`;
		const STYLE_TAG_ID = "dsh-refpics/styles";
		/** Inject the stylesheet once per page load; idempotent under re-evaluation. */
		function ensureStyle() {
			if (typeof document === "undefined") return;
			if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-refpics";
			tag.dataset.pluginCss = STYLE_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/wall.tsx
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
		ensureStyle();
		const COPY = {
			zh: {
				searching: "正在搜索参考图…",
				clickHint: "点击图片查看大图",
				empty: "没有找到匹配的图片，换一个更宽泛的描述再试试。",
				openSource: "原站",
				openFull: "原图",
				download: "下载",
				saveEagle: "存 Eagle",
				savedEagle: "已保存到 Eagle",
				savingEagle: "正在保存…",
				refresh: "换一批",
				nextPage: "下一页",
				openBoard: "在侧边栏打开",
				search: "搜索",
				searchPlaceholder: "描述你想找的参考图…",
				sent: "已发送，稍等新结果…",
				images: "张",
				close: "关闭",
				previous: "上一张",
				next: "下一张",
				of: "/",
				eagleUnavailable: "Eagle 未运行 (请先打开 Eagle)"
			},
			en: {
				searching: "Searching for reference images…",
				clickHint: "Click any image to enlarge",
				empty: "No matches found; try a broader description.",
				openSource: "Source",
				openFull: "Full size",
				download: "Download",
				saveEagle: "Save to Eagle",
				savedEagle: "Saved to Eagle",
				savingEagle: "Saving…",
				refresh: "Shuffle",
				nextPage: "Next page",
				openBoard: "Open in sidebar",
				search: "Search",
				searchPlaceholder: "Describe the references you want…",
				sent: "Sent; the next batch is on its way…",
				images: "images",
				close: "Close",
				previous: "Previous",
				next: "Next",
				of: "/",
				eagleUnavailable: "Eagle is not running"
			}
		};
		/** Active copy dictionary, following the shell's document language. */
		function copy() {
			const lang = document.documentElement.lang ?? "";
			return lang === "zh" || lang.startsWith("zh-") ? COPY.zh : COPY.en;
		}
		/** Skeleton masonry shown while a search runs. */
		const RunningWall = (0, react.memo)(function RunningWall() {
			const t = copy();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "rfp-root",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "rfp-wall",
					"aria-hidden": true,
					children: [
						1.3,
						.8,
						1.1,
						.7,
						1.25,
						.95,
						1.4,
						.75
					].map((ratio, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "rfp-skel",
						style: { aspectRatio: String(ratio) }
					}, index))
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "rfp-hint",
					children: t.searching
				})]
			});
		});
		/** Quick actions shared by the card overlay and the lightbox caption. */
		function EagleSaveButton({ image }) {
			const t = copy();
			const [phase, setPhase] = (0, react.useState)("idle");
			const [message, setMessage] = (0, react.useState)("");
			const onClick = (0, react.useCallback)((event) => {
				event.stopPropagation();
				if (phase === "busy") return;
				setPhase("busy");
				setMessage("");
				saveToEagle(image).then((result) => {
					setPhase(result.ok ? "ok" : "error");
					setMessage(result.message);
				});
			}, [image, phase]);
			const label = phase === "busy" ? t.savingEagle : phase === "ok" ? t.savedEagle : t.saveEagle;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "rfp-mini-btn",
				title: message.length > 0 ? message : void 0,
				disabled: phase === "busy" || phase === "ok",
				onClick,
				children: label
			});
		}
		/** One image card in the wall. */
		const Card = (0, react.memo)(function Card({ image, onOpen }) {
			const t = copy();
			const open = (0, react.useCallback)(() => onOpen(image), [image, onOpen]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("figure", {
				className: "rfp-card",
				tabIndex: 0,
				onClick: open,
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						open();
					}
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src: image.thumbUrl,
						alt: image.title ?? image.author ?? "",
						loading: "lazy",
						decoding: "async",
						style: { aspectRatio: `${image.width} / ${image.height}` }
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "rfp-card-actions",
						onClick: (event) => event.stopPropagation(),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "rfp-mini-btn",
							onClick: () => openDownload(image),
							children: t.download
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EagleSaveButton, { image })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("figcaption", {
						className: "rfp-overlay",
						children: [image.title !== void 0 && image.title.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "rfp-title",
							children: image.title
						}), image.author !== void 0 && image.author.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "rfp-author",
							children: image.author
						})]
					})
				]
			});
		});
		/** Lightbox overlay with keyboard navigation and save/download actions. */
		function Lightbox({ images, index, onClose, onNav }) {
			const t = copy();
			const image = images[index];
			const [degraded, setDegraded] = (0, react.useState)(false);
			const [eagle, setEagle] = (0, react.useState)({
				phase: "idle",
				message: ""
			});
			(0, react.useEffect)(() => {
				setDegraded(false);
				setEagle({
					phase: "idle",
					message: ""
				});
			}, [index]);
			(0, react.useEffect)(() => {
				const previous = document.body.style.overflow;
				document.body.style.overflow = "hidden";
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
					else if (event.key === "ArrowLeft") onNav((index - 1 + images.length) % images.length);
					else if (event.key === "ArrowRight") onNav((index + 1) % images.length);
				};
				window.addEventListener("keydown", onKey);
				return () => {
					document.body.style.overflow = previous;
					window.removeEventListener("keydown", onKey);
				};
			}, [
				images.length,
				index,
				onClose,
				onNav
			]);
			if (image === void 0) return null;
			const src = degraded ? image.thumbUrl : image.url;
			const save = () => {
				if (eagle.phase === "busy") return;
				setEagle({
					phase: "busy",
					message: ""
				});
				saveToEagle(image).then((result) => {
					setEagle({
						phase: result.ok ? "ok" : "error",
						message: result.message
					});
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "rfp-lb",
				role: "dialog",
				"aria-modal": "true",
				onClick: onClose,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src,
						alt: image.title ?? image.author ?? "",
						onClick: (event) => event.stopPropagation(),
						onError: () => {
							if (!degraded) setDegraded(true);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "rfp-lb-btn rfp-lb-close",
						"aria-label": t.close,
						onClick: onClose,
						children: "×"
					}),
					images.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "rfp-lb-btn rfp-lb-prev",
						"aria-label": t.previous,
						onClick: (event) => {
							event.stopPropagation();
							onNav((index - 1 + images.length) % images.length);
						},
						children: "‹"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "rfp-lb-btn rfp-lb-next",
						"aria-label": t.next,
						onClick: (event) => {
							event.stopPropagation();
							onNav((index + 1) % images.length);
						},
						children: "›"
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "rfp-lb-caption",
						onClick: (event) => event.stopPropagation(),
						children: [
							image.title !== void 0 && image.title.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "rfp-lb-title",
								children: image.title
							}),
							image.author !== void 0 && image.author.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "rfp-lb-meta",
								children: image.author
							}),
							images.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "rfp-lb-count",
								children: [
									index + 1,
									" ",
									t.of,
									" ",
									images.length
								]
							}),
							image.sourceUrl !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								className: "rfp-lb-link",
								href: image.sourceUrl,
								target: "_blank",
								rel: "noreferrer noopener",
								children: t.openSource
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								className: "rfp-lb-link",
								href: image.url,
								target: "_blank",
								rel: "noreferrer noopener",
								children: t.openFull
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "rfp-mini-btn",
								onClick: () => openDownload(image),
								children: t.download
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "rfp-mini-btn",
								disabled: eagle.phase === "busy" || eagle.phase === "ok",
								onClick: save,
								children: eagle.phase === "busy" ? t.savingEagle : eagle.phase === "ok" ? t.savedEagle : t.saveEagle
							}),
							eagle.phase !== "idle" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `rfp-lb-eagle ${eagle.phase === "ok" ? "rfp-lb-eagle-ok" : "rfp-lb-eagle-err"}`,
								children: eagle.message
							})
						]
					})
				]
			});
		}
		/** The full wall: header with actions, masonry grid, and the lightbox. */
		function RefPicsWall({ outcome, actions }) {
			const t = copy();
			const [active, setActive] = (0, react.useState)(null);
			const [sent, setSent] = (0, react.useState)(false);
			const onNav = (0, react.useCallback)((next) => {
				setActive(next);
			}, []);
			const onClose = (0, react.useCallback)(() => {
				setActive(null);
			}, []);
			(0, react.useEffect)(() => {
				setSent(false);
			}, [outcome, actions?.busy]);
			const fire = (handler) => {
				if (handler === void 0 || actions?.busy === true) return;
				setSent(true);
				handler();
			};
			if (outcome.images.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "rfp-root",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "rfp-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "rfp-head-query",
						children: outcome.query
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "rfp-head-meta",
						children: outcomeSummary(outcome)
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "rfp-empty",
					children: t.empty
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "rfp-root",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "rfp-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "rfp-head-query",
								children: outcome.query
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "rfp-head-meta",
								children: outcomeSummary(outcome)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "rfp-chip",
								children: outcome.provider
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "rfp-hint",
								children: t.clickHint
							})
						]
					}),
					(actions?.onRefresh !== void 0 || actions?.onNextPage !== void 0 || actions?.onOpenBoard !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "rfp-actions",
						children: [
							actions.onRefresh !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "rfp-btn rfp-btn-primary",
								disabled: actions.busy === true,
								onClick: () => fire(actions.onRefresh),
								children: t.refresh
							}),
							actions.onNextPage !== void 0 && outcome.truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "rfp-btn",
								disabled: actions.busy === true,
								onClick: () => fire(actions.onNextPage),
								children: [
									t.nextPage,
									" (",
									outcome.page + 1,
									")"
								]
							}),
							actions.onOpenBoard !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "rfp-btn",
								onClick: actions.onOpenBoard,
								children: t.openBoard
							}),
							actions.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "rfp-send-err",
								children: actions.error
							}),
							actions.error === void 0 && sent && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "rfp-hint",
								children: actions.sentNote ?? t.sent
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "rfp-wall",
						children: outcome.images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							image,
							onOpen: () => setActive(index)
						}, image.id))
					}),
					active !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Lightbox, {
						images: outcome.images,
						index: active,
						onClose,
						onNav
					})
				]
			});
		}
		//#endregion
		//#region src/client/board.tsx
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
		/** Small masonry-grid glyph for the tab strip (text-only, theme-colored). */
		function RefpicsBoardIcon({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				"aria-hidden": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "1",
						y: "1",
						width: "6",
						height: "8",
						rx: "1",
						fill: "currentColor",
						opacity: "0.9"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "9",
						y: "1",
						width: "6",
						height: "5",
						rx: "1",
						fill: "currentColor",
						opacity: "0.6"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "1",
						y: "11",
						width: "6",
						height: "4",
						rx: "1",
						fill: "currentColor",
						opacity: "0.6"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "9",
						y: "8",
						width: "6",
						height: "7",
						rx: "1",
						fill: "currentColor",
						opacity: "0.9"
					})
				]
			});
		}
		/** The sidebar tab component: search box, batch controls, and the wall. */
		function RefpicsBoardTab(props) {
			const { scope } = props;
			const sessionId = scope.sessionId;
			const t = copy();
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot);
			const board = snapshot.boards.get(sessionId);
			const chatOutcome = snapshot.chat.get(sessionId);
			const [query, setQuery] = (0, react.useState)("");
			const [provider, setProvider] = (0, react.useState)("auto");
			const [orientation, setOrientation] = (0, react.useState)("any");
			const outcome = board?.outcome ?? chatOutcome ?? null;
			const run = (0, react.useCallback)(async (options) => {
				const fallback = outcome?.query ?? "";
				const q = (options?.queryOverride ?? query).trim() || fallback.trim();
				if (q.length === 0) {
					setBoardError(sessionId, "先输入一句描述再搜索");
					return;
				}
				let page = options?.page;
				if (options?.shuffle === true) page = 1 + Math.floor(Math.random() * 6);
				setBoardLoading(sessionId);
				const result = await searchRemote({
					q,
					provider,
					orientation,
					...page === void 0 ? {} : { page }
				});
				if (result.ok) setBoardOutcome(sessionId, result.outcome);
				else setBoardError(sessionId, result.message);
			}, [
				query,
				provider,
				orientation,
				sessionId,
				outcome?.query
			]);
			const showWall = outcome !== null || board?.loading === true;
			const emptyHint = board?.error === null && outcome === null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "rfp-board",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "rfp-board-search",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "rfp-input",
								type: "text",
								value: query,
								placeholder: t.searchPlaceholder,
								onChange: (event) => setQuery(event.target.value),
								onKeyDown: (event) => {
									if (event.key === "Enter") run();
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								className: "rfp-select",
								value: provider,
								onChange: (event) => setProvider(event.target.value),
								children: PROVIDER_CHOICES.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: choice,
									children: choice
								}, choice))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								className: "rfp-select",
								value: orientation,
								onChange: (event) => setOrientation(event.target.value),
								children: ORIENTATIONS.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: choice,
									children: choice
								}, choice))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "rfp-btn rfp-btn-primary",
								onClick: () => void run(),
								children: t.search
							})
						]
					}),
					board?.error !== null && board?.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "rfp-error",
						style: { marginBottom: 10 },
						children: board.error
					}),
					board?.loading === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunningWall, {}),
					showWall && outcome !== null && !board?.loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefPicsWall, {
						outcome,
						actions: {
							onRefresh: () => void run({ shuffle: true }),
							onNextPage: () => void run({ page: outcome.page + 1 })
						}
					}),
					!showWall && emptyHint && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "rfp-board-empty",
						children: sessionId === void 0 || sessionId.length === 0 ? "当前没有选中的会话。" : "还没有参考图：在上方输入描述直接搜索，或在对话里让模型用 search_refs 搜索，最新结果会同步到这里。"
					})
				]
			});
		}
		//#endregion
		//#region src/client/bridge.ts
		let sessionsService;
		let betterSidebarService;
		/** Capture the sessions service (set once per client apply). */
		function setSessionsService(service) {
			sessionsService = service;
			console.info("[refpics] sessions service captured");
		}
		/** Capture the better-sidebar service; undefined when that plugin is absent. */
		function setBetterSidebarService(service) {
			betterSidebarService = service;
			console.info(`[refpics] betterSidebar service ${service === void 0 ? "UNAVAILABLE" : "captured"}`);
		}
		/**
		* Queue one prompt into a session (the "换一批/翻页" channel): the agent
		* receives it as an ordinary user message and re-runs the tool, so the new
		* result renders as a normal chat wall. The prompt goes through the session
		* FACE directly (`ISession.prompt`) — resolved via sessions.sessionOf /
		* sessions.binding — because service-property access on a scoped context
		* throws cordis's "cannot get property without inject" for sibling-fiber
		* services. Every failure mode comes back as a message the wall displays.
		*/
		async function sendToAgent(sessionId, text) {
			if (sessionId === void 0 || sessionId.length === 0) {
				console.warn("[refpics] sendToAgent: no session id on the toolview props");
				return {
					ok: false,
					message: "缺少会话上下文 (sessionId)"
				};
			}
			if (sessionsService === void 0) {
				console.warn("[refpics] sendToAgent: sessions service was never captured");
				return {
					ok: false,
					message: "会话服务不可用 (sessions service missing)"
				};
			}
			try {
				const scoped = sessionsService.scope(sessionId);
				const session = (scoped !== void 0 ? sessionsService.sessionOf(scoped) : void 0) ?? sessionsService.binding(sessionId)?.session;
				if (session === void 0) {
					console.warn(`[refpics] sendToAgent: session "${sessionId}" resolved no session face`);
					return {
						ok: false,
						message: "找不到会话 (no session face)"
					};
				}
				const result = await session.prompt([{
					type: "text",
					text
				}], "queue");
				if (!result.ok) {
					const error = result.error;
					return {
						ok: false,
						message: `发送被拒绝: ${error?.message !== void 0 && error.message.length > 0 ? `${error.code ?? "error"}: ${error.message}` : error?.code ?? "unknown rejection"}`
					};
				}
				return {
					ok: true,
					message: ""
				};
			} catch (error) {
				console.error("[refpics] sendToAgent failed:", error);
				return {
					ok: false,
					message: `发送失败: ${error instanceof Error ? error.message : String(error)}`
				};
			}
		}
		/**
		* Open (or focus) the single-instance refpics board tab in the sidebar.
		* The seed carries a `path` marker so better-sidebar treats it as a CONTENT
		* open and auto-expands the hosting panel (type-only opens never expand —
		* the sidebar stays collapsed and the click looks like a no-op).
		*/
		function openRefpicsBoard(sessionId) {
			if (betterSidebarService === void 0) {
				console.warn("[refpics] openRefpicsBoard: betterSidebar service unavailable");
				return {
					ok: false,
					message: "侧边栏插件不可用 (dsh-better-sidebar missing)"
				};
			}
			const scope = sessionId === void 0 ? void 0 : { sessionId };
			betterSidebarService.openTab({
				type: "refpics:board",
				path: "refpics:board"
			}, scope);
			return {
				ok: true,
				message: ""
			};
		}
		/** Whether the sidebar board is available (better-sidebar installed). */
		function boardAvailable() {
			return betterSidebarService !== void 0;
		}
		//#endregion
		//#region src/client/RefPicsToolView.tsx
		/**
		* Keyed tool.call.toolview entry for the search_refs tool. Slim wrapper
		* now: it parses the settled block, records the outcome into the shared
		* client store (so the sidebar board can mirror the latest chat search),
		* and renders the shared RefPicsWall with agent round-trip actions — 换一批
		* and 翻页 queue a prompt through the session-scoped conversation service
		* so the new batch renders as a normal chat wall, and "在侧边栏打开" opens
		* the single-instance board tab in dsh-better-sidebar. Every failure path
		* degrades to plain text; the row never breaks.
		*
		* @module dsh-refpics/client/RefPicsToolView
		*/
		/** Flatten a settled result's text blocks (soft, never throws). */
		function textOf(block) {
			if (!("kind" in block)) return "";
			const parts = [];
			for (const item of block.content) if (item.type === "text" && typeof item.text === "string") parts.push(item.text);
			return parts.join("\n");
		}
		/** Extract the structured outcome from a settled block (meta first, text JSON fallback). */
		function outcomeOf(block) {
			if (!("kind" in block)) return null;
			const fromMeta = narrowOutcome(block.meta);
			if (fromMeta !== null) return fromMeta;
			const text = textOf(block);
			if (text.trim().length === 0) return null;
			try {
				return narrowOutcome(JSON.parse(text));
			} catch {
				return null;
			}
		}
		/** The queued prompt asking the agent for a fresh batch of the same idea. */
		function refreshPrompt(outcome) {
			return `请帮我换一批参考图：用 search_refs 工具搜索，query: "${outcome.query}", provider: "${outcome.provider}", count: ${outcome.perPage}, 换一批不同的结果（可以换 page 或调整关键词角度），继续以参考图墙的形式展示。`;
		}
		/** The queued prompt asking the agent for the next page of the same query. */
		function nextPagePrompt(outcome) {
			return `请把刚才的参考图搜索翻到下一页：用 search_refs 工具，query: "${outcome.query}", provider: "${outcome.provider}", count: ${outcome.perPage}, page: ${outcome.page + 1}。`;
		}
		/** The slot component: dispatch by block lifecycle, degrade safely. */
		function RefPicsToolView(props) {
			const { block, sessionId } = props;
			const [busy, setBusy] = (0, react.useState)(false);
			const [actionError, setActionError] = (0, react.useState)(null);
			const outcome = "kind" in block ? outcomeOf(block) : null;
			const seq = "kind" in block ? block.seq : 0;
			(0, react.useEffect)(() => {
				if (outcome !== null && sessionId !== void 0) recordChatOutcome(sessionId, seq, outcome);
			}, [
				outcome,
				seq,
				sessionId
			]);
			if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RunningWall, {});
			if (block.isError) {
				const text = textOf(block);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "rfp-error",
					children: text.length > 0 ? text : `${block.error?.name ?? "Error"}: ${block.error?.code ?? "unknown"}`
				});
			}
			if (outcome === null) {
				const text = textOf(block);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "rfp-plain",
					children: text.length > 0 ? text : JSON.stringify(block.content, null, 2)
				});
			}
			const fire = (handler) => {
				if (busy) return;
				setBusy(true);
				setActionError(null);
				handler().then((result) => {
					if (!result.ok) setActionError(result.message);
				}).finally(() => {
					window.setTimeout(() => setBusy(false), 3e3);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefPicsWall, {
				outcome,
				actions: {
					busy,
					sentNote: copy().sent,
					error: actionError ?? void 0,
					onRefresh: () => fire(async () => sendToAgent(sessionId, refreshPrompt(outcome))),
					onNextPage: () => fire(async () => sendToAgent(sessionId, nextPagePrompt(outcome))),
					onOpenBoard: boardAvailable() ? () => {
						if (sessionId !== void 0) setBoardOutcome(sessionId, outcome);
						const result = openRefpicsBoard(sessionId);
						if (!result.ok) setActionError(result.message);
					} : void 0
				}
			});
		}
		//#endregion
		//#region src/client/index.tsx
		/** Locale namespace of the browser half (reserved for future dictionary use). */
		const NS = "ref-pics";
		/** Required services: slots (toolview), sessions (agent round trips). The betterSidebar service is optional and wired opportunistically. */
		const inject = ["slots", "sessions"];
		/** Apply the browser half. */
		function apply(ctx) {
			ctx.inject(["sessions"], (scope) => {
				setSessionsService(scope.sessions);
			});
			ctx.inject(["betterSidebar"], (scope) => {
				const sidebar = scope.betterSidebar;
				if (sidebar === void 0) return;
				setBetterSidebarService(sidebar);
				const dispose = sidebar.registerTab({
					id: "refpics:board",
					title: () => "参考图",
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefpicsBoardIcon, { size }),
					order: 130,
					single: true,
					component: (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefpicsBoardTab, { ...props })
				});
				ctx.effect(() => dispose, "refpics: sidebar board tab");
			});
			ctx.inject(["slots"], (scope) => {
				scope.slots.inject("tool.call.toolview", () => scope.slots.register({
					name: "tool.call.toolview",
					key: "search_refs",
					priority: 0,
					registrant: "dsh-refpics"
				}, RefPicsToolView));
			});
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map