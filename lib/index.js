import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "schemastery";
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
const DEFAULT_COUNT = 12;
const MIN_COUNT = 1;
const MAX_COUNT = 30;
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
/** One compact display line for a single image (model-facing text). */
function imageLine(index, image) {
	const attribution = image.author !== void 0 ? ` — ${image.author}` : "";
	const size = `${Math.round(image.width)}x${Math.round(image.height)}`;
	return `${index}. ${image.title ?? "Untitled"}${attribution} (${size}) ${image.url}`;
}
/**
* One-line header describing a completed search, used by the model-facing
* text, the generic result title, and the masonry wall header.
*/
function outcomeSummary(outcome) {
	const plural = outcome.total === 1 ? "" : "s";
	return `${outcome.provider} · ${outcome.total} image${plural} · ${outcome.images.length} shown`;
}
/**
* Compact model-facing render of the whole outcome: a header line plus one
* numbered line per image so the model can cite specific results by index.
*/
function renderOutcomeText(outcome) {
	const header = `Found ${outcome.total} reference image${outcome.total === 1 ? "" : "s"} for "${outcome.query}" on ${outcome.provider} (showing ${outcome.images.length}).`;
	if (outcome.images.length === 0) return header;
	return [header, ...outcome.images.map((image, index) => imageLine(index + 1, image))].join("\n");
}
//#endregion
//#region src/providers.ts
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
/** Per-request timeout budget in milliseconds. */
const SEARCH_TIMEOUT_MS = 2e4;
/** A human-readable hint telling the user where to get a key. */
function keyHint(provider) {
	switch (provider) {
		case "pexels": return "Get a free key at https://www.pexels.com/api/ and fill it under Settings -> Plugins -> Reference pictures";
		case "pixabay": return "Get a free key at https://pixabay.com/api/docs/ and fill it under Settings -> Plugins -> Reference pictures";
		case "unsplash": return "Get a free access key at https://unsplash.com/developers and fill it under Settings -> Plugins -> Reference pictures";
		case "openverse": return "";
	}
}
/** Clamp a requested count into the supported band. */
function clampCount(count) {
	if (!Number.isFinite(count)) return 1;
	return Math.min(30, Math.max(1, Math.floor(count)));
}
/** Orientation mapping per provider; undefined means the provider has no filter. */
function orientationParam(provider, orientation) {
	switch (provider) {
		case "openverse":
		case "pexels":
		case "pixabay": return orientation === "any" ? void 0 : orientation;
		case "unsplash": return orientation === "any" ? void 0 : orientation === "square" ? "squarish" : orientation;
	}
}
/** Run one provider search through the injectable transport. */
async function searchProvider(provider, apiKey, query, page, count, orientation, signal, fetchFn = fetch) {
	const perPage = clampCount(count);
	const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
	const combined = signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
	switch (provider) {
		case "openverse": return searchOpenverse(query, page, perPage, orientation, combined, fetchFn);
		case "pexels": return searchPexels(apiKey, query, page, perPage, orientation, combined, fetchFn);
		case "pixabay": return searchPixabay(apiKey, query, page, perPage, orientation, combined, fetchFn);
		case "unsplash": return searchUnsplash(apiKey, query, page, perPage, orientation, combined, fetchFn);
	}
}
/** Throw a friendly failure with the provider's HTTP status when a call fails. */
function badStatus(provider, status, body) {
	const trimmed = body.slice(0, 200);
	throw new Error(`search_refs: ${provider} responded ${status}${trimmed.length > 0 ? `: ${trimmed}` : ""}`);
}
/** Require a non-empty API key for keyed providers. */
function requireKey(provider, apiKey) {
	const key = (apiKey ?? "").trim();
	if (key.length === 0) throw new Error(`search_refs: provider "${provider}" needs an API key. ${keyHint(provider)}`);
	return key;
}
async function searchOpenverse(query, page, perPage, orientation, signal, fetchFn) {
	const url = new URL("https://api.openverse.org/v1/images/");
	url.searchParams.set("q", query);
	url.searchParams.set("page", String(page));
	url.searchParams.set("page_size", String(perPage));
	url.searchParams.set("license_type", "all");
	const orientationValue = orientationParam("openverse", orientation);
	if (orientationValue !== void 0) url.searchParams.set("orientation", orientationValue);
	const response = await fetchFn(url, {
		signal,
		headers: { accept: "application/json" }
	});
	if (!response.ok) badStatus("openverse", response.status, await response.text());
	const payload = await response.json();
	const images = (payload.results ?? []).map(normalizeOpenverse).filter((image) => image !== null);
	return {
		total: payload.result_count ?? images.length,
		page,
		images
	};
}
function normalizeOpenverse(item) {
	if (typeof item.id !== "string" || item.id.length === 0) return null;
	const url = typeof item.url === "string" ? item.url : "";
	const thumbUrl = typeof item.thumbnail === "string" ? item.thumbnail : url;
	if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl)) return null;
	const width = typeof item.width === "number" ? item.width : 0;
	const height = typeof item.height === "number" ? item.height : 0;
	const image = {
		id: `openverse:${item.id}`,
		url: /^https?:\/\//i.test(url) ? url : thumbUrl,
		thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
		width: width > 0 ? width : 800,
		height: height > 0 ? height : 600
	};
	if (typeof item.title === "string" && item.title.length > 0) image.title = item.title;
	if (typeof item.creator === "string" && item.creator.length > 0) image.author = item.creator;
	if (typeof item.creator_url === "string" && item.creator_url.length > 0) image.authorUrl = item.creator_url;
	if (typeof item.foreign_landing_url === "string" && item.foreign_landing_url.length > 0) image.sourceUrl = item.foreign_landing_url;
	if (typeof item.license === "string" && item.license.length > 0) image.license = item.license;
	return image;
}
async function searchPexels(apiKey, query, page, perPage, orientation, signal, fetchFn) {
	const key = requireKey("pexels", apiKey);
	const url = new URL("https://api.pexels.com/v1/search");
	url.searchParams.set("query", query);
	url.searchParams.set("page", String(page));
	url.searchParams.set("per_page", String(perPage));
	const orientationValue = orientationParam("pexels", orientation);
	if (orientationValue !== void 0) url.searchParams.set("orientation", orientationValue);
	const response = await fetchFn(url, {
		signal,
		headers: {
			authorization: key,
			accept: "application/json"
		}
	});
	if (!response.ok) badStatus("pexels", response.status, await response.text());
	const payload = await response.json();
	const images = (payload.photos ?? []).map(normalizePexels).filter((image) => image !== null);
	return {
		total: payload.total_results ?? images.length,
		page,
		images
	};
}
function normalizePexels(photo) {
	if (typeof photo.id !== "number" && typeof photo.id !== "string") return null;
	const src = photo.src ?? {};
	const url = typeof src.large2x === "string" ? src.large2x : typeof src.large === "string" ? src.large : "";
	const thumbUrl = typeof src.medium === "string" ? src.medium : url;
	if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl)) return null;
	const width = typeof photo.width === "number" ? photo.width : 0;
	const height = typeof photo.height === "number" ? photo.height : 0;
	const image = {
		id: `pexels:${String(photo.id)}`,
		url: /^https?:\/\//i.test(url) ? url : thumbUrl,
		thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
		width: width > 0 ? width : 800,
		height: height > 0 ? height : 600
	};
	if (typeof photo.alt === "string" && photo.alt.length > 0) image.title = photo.alt;
	if (typeof photo.photographer === "string" && photo.photographer.length > 0) image.author = photo.photographer;
	if (typeof photo.photographer_url === "string" && photo.photographer_url.length > 0) image.authorUrl = photo.photographer_url;
	if (typeof photo.url === "string" && photo.url.length > 0) image.sourceUrl = photo.url;
	if (typeof photo.avg_color === "string" && photo.avg_color.length > 0) image.color = photo.avg_color;
	return image;
}
async function searchPixabay(apiKey, query, page, perPage, orientation, signal, fetchFn) {
	const key = requireKey("pixabay", apiKey);
	const url = new URL("https://pixabay.com/api/");
	url.searchParams.set("key", key);
	url.searchParams.set("q", query);
	url.searchParams.set("page", String(page));
	url.searchParams.set("per_page", String(perPage));
	url.searchParams.set("image_type", "photo");
	url.searchParams.set("safesearch", "true");
	const orientationValue = orientationParam("pixabay", orientation);
	if (orientationValue !== void 0) url.searchParams.set("orientation", orientationValue);
	const response = await fetchFn(url, {
		signal,
		headers: { accept: "application/json" }
	});
	if (!response.ok) badStatus("pixabay", response.status, await response.text());
	const payload = await response.json();
	const images = (payload.hits ?? []).map(normalizePixabay).filter((image) => image !== null);
	return {
		total: payload.total ?? images.length,
		page,
		images
	};
}
function normalizePixabay(hit) {
	if (typeof hit.id !== "number" && typeof hit.id !== "string") return null;
	const url = typeof hit.largeImageURL === "string" ? hit.largeImageURL : "";
	const thumbUrl = typeof hit.webformatURL === "string" ? hit.webformatURL : url;
	if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl)) return null;
	const width = typeof hit.imageWidth === "number" ? hit.imageWidth : typeof hit.webformatWidth === "number" ? hit.webformatWidth : 0;
	const height = typeof hit.imageHeight === "number" ? hit.imageHeight : typeof hit.webformatHeight === "number" ? hit.webformatHeight : 0;
	const image = {
		id: `pixabay:${String(hit.id)}`,
		url: /^https?:\/\//i.test(url) ? url : thumbUrl,
		thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
		width: width > 0 ? width : 800,
		height: height > 0 ? height : 600
	};
	if (typeof hit.tags === "string" && hit.tags.length > 0) image.title = hit.tags;
	if (typeof hit.user === "string" && hit.user.length > 0) image.author = hit.user;
	if (typeof hit.pageURL === "string" && hit.pageURL.length > 0) image.sourceUrl = hit.pageURL;
	return image;
}
async function searchUnsplash(apiKey, query, page, perPage, orientation, signal, fetchFn) {
	const key = requireKey("unsplash", apiKey);
	const url = new URL("https://api.unsplash.com/search/photos");
	url.searchParams.set("query", query);
	url.searchParams.set("page", String(page));
	url.searchParams.set("per_page", String(perPage));
	const orientationValue = orientationParam("unsplash", orientation);
	if (orientationValue !== void 0) url.searchParams.set("orientation", orientationValue);
	const response = await fetchFn(url, {
		signal,
		headers: {
			authorization: `Client-ID ${key}`,
			accept: "application/json"
		}
	});
	if (!response.ok) badStatus("unsplash", response.status, await response.text());
	const payload = await response.json();
	const images = (payload.results ?? []).map(normalizeUnsplash).filter((image) => image !== null);
	return {
		total: payload.total ?? images.length,
		page,
		images
	};
}
function normalizeUnsplash(photo) {
	if (typeof photo.id !== "string" || photo.id.length === 0) return null;
	const urls = photo.urls ?? {};
	const url = typeof urls.regular === "string" ? urls.regular : typeof urls.full === "string" ? urls.full ?? "" : "";
	const thumbUrl = typeof urls.small === "string" ? urls.small : url;
	if (!/^https?:\/\//i.test(url) && !/^https?:\/\//i.test(thumbUrl)) return null;
	const width = typeof photo.width === "number" ? photo.width : 0;
	const height = typeof photo.height === "number" ? photo.height : 0;
	const image = {
		id: `unsplash:${photo.id}`,
		url: /^https?:\/\//i.test(url) ? url : thumbUrl,
		thumbUrl: /^https?:\/\//i.test(thumbUrl) ? thumbUrl : url,
		width: width > 0 ? width : 800,
		height: height > 0 ? height : 600
	};
	const title = typeof photo.alt_description === "string" && photo.alt_description.length > 0 ? photo.alt_description : typeof photo.description === "string" && photo.description.length > 0 ? photo.description : void 0;
	if (title !== void 0) image.title = title;
	const author = typeof photo.user?.name === "string" ? photo.user.name : void 0;
	if (author !== void 0 && author.length > 0) image.author = author;
	const authorUrl = typeof photo.user?.links?.html === "string" ? photo.user.links.html : void 0;
	if (authorUrl !== void 0 && authorUrl.length > 0) image.authorUrl = authorUrl;
	const sourceUrl = typeof photo.links?.html === "string" ? photo.links.html : void 0;
	if (sourceUrl !== void 0 && sourceUrl.length > 0) image.sourceUrl = sourceUrl;
	if (typeof photo.color === "string" && photo.color.length > 0) image.color = photo.color;
	return image;
}
//#endregion
//#region src/config.ts
/**
* Config and provider-selection facts for the search_refs tool. Holds the
* schemastery section that doubles as the plugin's settings card schema
* (Settings -> Plugins -> Reference pictures), plus the per-call provider
* resolution: "auto" walks a fixed preference order and falls back to the
* keyless Openverse API.
*
* @module dsh-refpics/config
*/
/** Settings namespace the Plugins card edits. */
const REFPICS_SETTINGS_NAMESPACE = settingsNamespace("ref-pics");
/** Schemastery configuration; doubles as the `ref-pics` settings-section schema. */
const Config = z.object({
	pexelsKey: z.string().role("secret").description("Pexels API key (free at pexels.com/api). Leave empty to disable."),
	pixabayKey: z.string().role("secret").description("Pixabay API key (free at pixabay.com/api/docs). Leave empty to disable."),
	unsplashKey: z.string().role("secret").description("Unsplash access key (free at unsplash.com/developers). Leave empty to disable."),
	defaultProvider: z.union(PROVIDER_CHOICES).default("auto").description("Provider used when a call passes \"auto\"."),
	defaultCount: z.number().step(1).min(1).max(30).default(12).description("Image count used when a call omits count."),
	eaglePort: z.number().step(1).min(0).max(65535).default(41595).description("Eagle local API port (0 disables save-to-Eagle)."),
	eagleToken: z.string().role("secret").description("Optional Eagle API token; leave empty when Eagle needs none.")
});
/** Resolve raw config into validated facts with defaults and bounds. */
function resolveConfig(config) {
	const defaultCount = config.defaultCount ?? 12;
	if (!Number.isFinite(defaultCount) || defaultCount < 1 || defaultCount > 30) throw new Error("dsh-refpics: defaultCount must be an integer between 1 and 30");
	const defaultProvider = config.defaultProvider ?? "auto";
	if (!PROVIDER_CHOICES.includes(defaultProvider)) throw new Error(`dsh-refpics: defaultProvider must be one of ${PROVIDER_CHOICES.join(", ")}`);
	const eaglePort = config.eaglePort ?? 41595;
	if (!Number.isInteger(eaglePort) || eaglePort < 0 || eaglePort > 65535) throw new Error("dsh-refpics: eaglePort must be an integer between 0 and 65535");
	return {
		pexelsKey: nonEmpty(config.pexelsKey),
		pixabayKey: nonEmpty(config.pixabayKey),
		unsplashKey: nonEmpty(config.unsplashKey),
		defaultProvider,
		defaultCount,
		eaglePort,
		eagleToken: nonEmpty(config.eagleToken)
	};
}
/** The API key for one provider under the resolved config. */
function keyFor(cfg, provider) {
	switch (provider) {
		case "pexels": return cfg.pexelsKey;
		case "pixabay": return cfg.pixabayKey;
		case "unsplash": return cfg.unsplashKey;
		case "openverse": return;
	}
}
/** Whether a provider is usable under the resolved config. */
function providerReady(cfg, provider) {
	return provider === "openverse" || (keyFor(cfg, provider) ?? "").trim().length > 0;
}
/**
* Resolve a preferred provider choice to a concrete, usable provider.
* "auto" prefers the configured default (when it is a concrete provider),
* then the keyed providers in quality order, and finally falls back to the
* keyless Openverse API; an explicit choice that is not configured throws
* a friendly error naming the fix.
*/
function resolveProvider(preferred, cfg) {
	if (preferred !== "auto") {
		if (providerReady(cfg, preferred)) return preferred;
		throw new Error(`search_refs: provider "${preferred}" is not configured. Fill its API key under Settings -> Plugins -> Reference pictures, or pass provider "auto" (Openverse works without a key).`);
	}
	const order = [];
	if (cfg.defaultProvider !== "auto" && PROVIDERS.includes(cfg.defaultProvider)) order.push(cfg.defaultProvider);
	for (const provider of [
		"pexels",
		"pixabay",
		"unsplash"
	]) if (!order.includes(provider)) order.push(provider);
	order.push("openverse");
	for (const provider of order) if (providerReady(cfg, provider)) return provider;
	return "openverse";
}
/** Trimmed non-empty string, or undefined. */
function nonEmpty(value) {
	const trimmed = (value ?? "").trim();
	return trimmed.length > 0 ? trimmed : void 0;
}
/**
* Materialize one call's arguments against the resolved configuration. The
* parameter schema's `default` annotations are model-visible hints only —
* the registry never fills them in — so every omitted field resolves here:
* provider falls back to the configured default provider (then the quality
* order), count to the configured default count, orientation to "any", and
* page to 1. A blank query throws.
*/
function resolveCallRequest(args, cfg) {
	const query = (args.query ?? "").trim();
	if (query.length === 0) throw new Error("search_refs: query must be a non-empty description");
	return {
		query,
		provider: resolveProvider(args.provider ?? cfg.defaultProvider, cfg),
		count: clampCount(args.count ?? cfg.defaultCount),
		page: Math.max(1, Math.floor(args.page ?? 1)),
		orientation: args.orientation ?? "any"
	};
}
//#endregion
//#region src/routes.ts
/** Byte cap for proxied downloads. */
const DOWNLOAD_CAP_BYTES = 30 * 1024 * 1024;
/** Timeout for proxied downloads and Eagle calls. */
const ROUTE_TIMEOUT_MS = 25e3;
/** Eagle health probe timeout. */
const EAGLE_STATUS_TIMEOUT_MS = 2500;
/** JSON request-body cap for the Eagle route. */
const MAX_EAGLE_BODY_BYTES = 64 * 1024;
/** Run one board search against the configured providers (reuses the tool path). */
async function runBoardSearch(cfg, params) {
	const request = resolveCallRequest({
		query: params.q,
		...params.provider === void 0 ? {} : { provider: params.provider },
		...params.page === void 0 ? {} : { page: params.page },
		...params.count === void 0 ? {} : { count: params.count },
		...params.orientation === void 0 ? {} : { orientation: params.orientation }
	}, cfg);
	const result = await searchProvider(request.provider, keyFor(cfg, request.provider), request.query, request.page, request.count, request.orientation, void 0);
	const outcome = {
		query: request.query,
		provider: request.provider,
		page: request.page,
		perPage: result.images.length,
		total: result.total,
		truncated: result.total > request.page * result.images.length,
		images: result.images
	};
	if (outcome.images.length === 0) outcome.note = "No results for this query; try a broader description or a different provider.";
	return outcome;
}
/** Sanitize a display name into a safe download file name (no path separators). */
function safeFileName(name, fallback) {
	const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
	return cleaned.length > 0 ? cleaned : fallback;
}
/** Extension from a URL pathname or a content type; '.img' as the last resort. */
function extensionFor(url, contentType) {
	const match = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(?:$|[?#])/i.exec(url);
	if (match !== null) return `.${match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase()}`;
	if (contentType !== null) {
		const subtype = contentType.split(";")[0]?.split("/")[1]?.toLowerCase();
		if (subtype === "jpeg") return ".jpg";
		if (subtype !== void 0 && subtype.length > 0 && subtype.length <= 8 && /^[a-z0-9+-]+$/.test(subtype)) return `.${subtype}`;
	}
	return ".img";
}
/** Write one JSON envelope response. */
function json(res, envelope, status = 200) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
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
		if (total > cap) return null;
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text === "") return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
/** Eagle API base for the configured port. */
function eagleBase(port) {
	return `http://127.0.0.1:${port}`;
}
/** Token query suffix when the user configured one. */
function eagleTokenQuery(token) {
	const trimmed = (token ?? "").trim();
	return trimmed.length > 0 ? `?token=${encodeURIComponent(trimmed)}` : "";
}
/** GET /refpics/search: direct board search, same path as the tool. */
async function serveSearch(cfg, req, res) {
	const url = new URL(req.url ?? "/", "http://x");
	const q = url.searchParams.get("q");
	if (q === null || q.trim().length === 0) {
		json(res, {
			ok: false,
			error: {
				code: "rejected",
				message: "query parameter \"q\" must be a non-empty description"
			}
		}, 400);
		return;
	}
	const providerRaw = url.searchParams.get("provider");
	if (providerRaw !== null && !PROVIDER_CHOICES.includes(providerRaw)) {
		json(res, {
			ok: false,
			error: {
				code: "rejected",
				message: `provider must be one of ${PROVIDER_CHOICES.join(", ")}`
			}
		}, 400);
		return;
	}
	const orientationRaw = url.searchParams.get("orientation");
	if (orientationRaw !== null && !ORIENTATIONS.includes(orientationRaw)) {
		json(res, {
			ok: false,
			error: {
				code: "rejected",
				message: `orientation must be one of ${ORIENTATIONS.join(", ")}`
			}
		}, 400);
		return;
	}
	const page = url.searchParams.get("page") === null ? void 0 : Number(url.searchParams.get("page"));
	const count = url.searchParams.get("count") === null ? void 0 : Number(url.searchParams.get("count"));
	try {
		json(res, {
			ok: true,
			outcome: await runBoardSearch(cfg, {
				q: q.trim(),
				...providerRaw === null ? {} : { provider: providerRaw },
				...page === void 0 || !Number.isFinite(page) ? {} : { page },
				...count === void 0 || !Number.isFinite(count) ? {} : { count },
				...orientationRaw === null ? {} : { orientation: orientationRaw }
			})
		});
	} catch (error) {
		json(res, {
			ok: false,
			error: {
				code: "internal",
				message: error.message ?? String(error)
			}
		}, 502);
	}
}
/** GET /refpics/download: stream one provider image back as an attachment. */
async function serveDownload(req, res) {
	const url = new URL(req.url ?? "/", "http://x");
	const target = url.searchParams.get("url");
	const name = url.searchParams.get("name") ?? "image";
	if (target === null || !/^https?:\/\//i.test(target)) {
		json(res, {
			ok: false,
			error: {
				code: "rejected",
				message: "parameter \"url\" must be an http(s) image URL"
			}
		}, 400);
		return;
	}
	let response;
	try {
		response = await fetch(target, {
			signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
			redirect: "follow",
			headers: { accept: "image/*" }
		});
	} catch {
		json(res, {
			ok: false,
			error: {
				code: "internal",
				message: "the image host did not answer in time"
			}
		}, 502);
		return;
	}
	const contentType = response.headers.get("content-type") ?? "";
	if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
		json(res, {
			ok: false,
			error: {
				code: "rejected",
				message: `the image host answered ${response.status} with a non-image payload`
			}
		}, 502);
		return;
	}
	const extension = extensionFor(target, contentType);
	const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(name, "image")).replace(/['()]/g, "")}${extension}`;
	const length = response.headers.get("content-length");
	const headers = {
		"content-type": contentType.split(";")[0] ?? "application/octet-stream",
		"content-disposition": disposition,
		"cache-control": "private, max-age=3600"
	};
	if (length !== null && /^\d+$/.test(length) && Number(length) <= 31457280) headers["content-length"] = length;
	res.writeHead(200, headers);
	if (response.body === null) {
		res.end();
		return;
	}
	let total = 0;
	try {
		for await (const chunk of response.body) {
			total += chunk.length;
			if (total > 31457280) {
				res.destroy();
				return;
			}
			res.write(chunk);
		}
		res.end();
	} catch {
		res.destroy();
	}
}
/** GET /refpics/eagle/status: whether the local Eagle API answers. */
async function serveEagleStatus(cfg, res) {
	if (cfg.eaglePort === 0) {
		json(res, {
			ok: false,
			message: "Eagle integration is disabled (eaglePort = 0)"
		});
		return;
	}
	try {
		const response = await fetch(`${eagleBase(cfg.eaglePort)}/api/application/info${eagleTokenQuery(cfg.eagleToken)}`, { signal: AbortSignal.timeout(EAGLE_STATUS_TIMEOUT_MS) });
		if (response.ok) json(res, {
			ok: true,
			version: (await response.json().catch(() => null))?.data?.version ?? "unknown"
		});
		else json(res, {
			ok: false,
			message: `Eagle answered ${response.status}`
		});
	} catch {
		json(res, {
			ok: false,
			message: "Eagle 未运行或端口不对 (请先打开 Eagle，默认端口 41595)"
		});
	}
}
/** POST /refpics/eagle: add one image URL to Eagle. */
async function serveEagleAdd(cfg, req, res) {
	if (cfg.eaglePort === 0) {
		json(res, {
			ok: false,
			message: "Eagle integration is disabled (eaglePort = 0)"
		}, 400);
		return;
	}
	const body = await readJsonBody(req, MAX_EAGLE_BODY_BYTES);
	if (typeof body !== "object" || body === null) {
		json(res, {
			ok: false,
			message: "request body must be a JSON object"
		}, 400);
		return;
	}
	const record = body;
	const imageUrl = typeof record.url === "string" ? record.url : "";
	const name = typeof record.name === "string" ? safeFileName(record.name, "image") : "image";
	if (!/^https?:\/\//i.test(imageUrl)) {
		json(res, {
			ok: false,
			message: "url must be an http(s) image URL"
		}, 400);
		return;
	}
	const item = {
		url: imageUrl,
		name
	};
	if (typeof record.website === "string" && record.website.length > 0) item.website = record.website;
	if (Array.isArray(record.tags)) {
		const tags = record.tags.filter((tag) => typeof tag === "string" && tag.length > 0).slice(0, 12);
		if (tags.length > 0) item.tags = tags;
	}
	try {
		const response = await fetch(`${eagleBase(cfg.eaglePort)}/api/item/addFromURLs${eagleTokenQuery(cfg.eagleToken)}`, {
			method: "POST",
			signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ items: [item] })
		});
		const envelope = await response.json().catch(() => null);
		if (response.ok && envelope?.status === "success") json(res, {
			ok: true,
			message: "已保存到 Eagle"
		});
		else json(res, {
			ok: false,
			message: `Eagle 保存失败: ${envelope?.status ?? response.status}`
		}, 502);
	} catch {
		json(res, {
			ok: false,
			message: "Eagle 未运行或端口不对 (请先打开 Eagle)"
		}, 502);
	}
}
/**
* Register the /refpics prefix route on the shared webserver. The config
* spec is read per request so the Settings card's changes (provider keys,
* Eagle port/token) reach the very next call.
* @param ctx - registrant context; the route registers only when the webserver is mounted.
* @param spec - per-call resolved-config reader.
*/
function registerRefpicsRoutes(ctx, spec) {
	const webserver = ctx.get("webServer");
	if (webserver === void 0) return;
	webserver.register({
		kind: "prefix",
		path: "/refpics",
		handler: async (req, res) => {
			const pathname = new URL(req.url ?? "/", "http://x").pathname;
			try {
				if (pathname === "/refpics/search") {
					if (req.method !== "GET") return json(res, {
						ok: false,
						error: {
							code: "rejected",
							message: "only GET is allowed"
						}
					}, 405);
					await serveSearch(spec(), req, res);
					return;
				}
				if (pathname === "/refpics/download") {
					if (req.method !== "GET") return json(res, {
						ok: false,
						error: {
							code: "rejected",
							message: "only GET is allowed"
						}
					}, 405);
					await serveDownload(req, res);
					return;
				}
				if (pathname === "/refpics/eagle/status") {
					if (req.method !== "GET") return json(res, {
						ok: false,
						error: {
							code: "rejected",
							message: "only GET is allowed"
						}
					}, 405);
					await serveEagleStatus(spec(), res);
					return;
				}
				if (pathname === "/refpics/eagle") {
					if (req.method !== "POST") return json(res, {
						ok: false,
						error: {
							code: "rejected",
							message: "only POST is allowed"
						}
					}, 405);
					await serveEagleAdd(spec(), req, res);
					return;
				}
				res.writeHead(404);
				res.end();
			} catch (error) {
				json(res, {
					ok: false,
					error: {
						code: "internal",
						message: error.message ?? String(error)
					}
				}, 500);
			}
		}
	});
}
//#endregion
//#region src/index.ts
const name = "ref-pics";
const inject = ["tools"];
/** Pending-state presentation: a generic search card naming the query. */
function searchRefsCallView(args) {
	return {
		card: "generic",
		title: "搜参考图",
		kind: "search",
		rawInput: {
			query: args.query,
			provider: args.provider ?? "auto",
			count: args.count ?? 12,
			orientation: args.orientation ?? "any"
		}
	};
}
/** Create a bounded, TTL-scoped cache for provider pages. */
function createSearchCache(maxEntries = 64, ttlMs = 10 * 6e4) {
	const entries = /* @__PURE__ */ new Map();
	return {
		get(key) {
			const hit = entries.get(key);
			if (hit === void 0) return void 0;
			if (hit.expires < Date.now()) {
				entries.delete(key);
				return;
			}
			entries.delete(key);
			entries.set(key, hit);
			return hit.value;
		},
		set(key, value) {
			if (entries.size >= maxEntries) {
				const oldest = entries.keys().next();
				if (!oldest.done) entries.delete(oldest.value);
			}
			entries.set(key, {
				expires: Date.now() + ttlMs,
				value
			});
		}
	};
}
/** Cache key for one provider page. */
function cacheKey(provider, query, page, count, orientation) {
	return [
		provider,
		query.trim().toLowerCase(),
		page,
		clampCount(count),
		orientation
	].join("|");
}
/** Result the tool registers on `ctx.tools`. */
function apply(ctx, config = {}) {
	let current = () => config;
	installSettingsSection(ctx, REFPICS_SETTINGS_NAMESPACE, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {},
		validate: (value) => {
			resolveConfig(value);
		}
	});
	const spec = () => resolveConfig(current());
	const cache = createSearchCache();
	ctx.inject(["webServer"], (webCtx) => {
		registerRefpicsRoutes(webCtx, spec);
	});
	ctx.tools.register(defineTool({
		name: "search_refs",
		description: "Search stock design platforms for reference images matching a natural-language description and return them as a structured list the chat UI renders as a Pinterest-style masonry wall with a lightbox. Use when the user asks for reference pictures, moodboards, visual inspiration, \"找参考图 / 给我找一些...图片 / 类似 pinterest 的灵感墙\", or wants to see what a described style, object, or scene looks like. Providers: Openverse (keyless, always available), Pexels, Pixabay, Unsplash (need free API keys configured under Settings -> Plugins -> Reference pictures). Provider \"auto\" picks the first configured provider and falls back to Openverse. Query strategy: stock libraries index English, so ALWAYS translate the description into concise canonical ENGLISH keywords for `query` (e.g. \"波普艺术海报\" -> \"pop art poster\"). Keep queries broad (style, subject, mood) and run 2-4 parallel calls with different keyword clusters to cover the idea; DO NOT narrow to a single artist unless the user names one. The result carries a structured image list (id, url, thumbUrl, width, height, title, author, sourceUrl, license); the user sees a masonry wall rendered from it. Ask the user for clarification only when the description is genuinely ambiguous.",
		parameters: {
			query: {
				type: "string",
				required: true,
				description: "Concise ENGLISH keywords for the reference images (style, subject, mood, colors, medium), translated from the user's description. Broad terms, not single artists."
			},
			count: {
				type: "integer",
				default: 12,
				description: `Number of images to return (1-30, default 12).`
			},
			provider: {
				type: "string",
				enum: [...PROVIDER_CHOICES],
				default: "auto",
				description: "Provider to search: \"auto\" picks the first configured one and falls back to Openverse; openverse needs no key."
			},
			orientation: {
				type: "string",
				enum: [...ORIENTATIONS],
				default: "any",
				description: "Orientation filter (any / landscape / portrait / square)."
			},
			page: {
				type: "integer",
				default: 1,
				description: "Page of results to fetch (1-based) when the user wants more of the same query."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					query: {
						type: "string",
						required: true
					},
					provider: {
						type: "string",
						required: true,
						enum: [
							"openverse",
							"pexels",
							"pixabay",
							"unsplash"
						]
					},
					page: {
						type: "integer",
						required: true
					},
					perPage: {
						type: "integer",
						required: true
					},
					total: {
						type: "integer",
						required: true
					},
					truncated: {
						type: "boolean",
						required: true
					},
					note: { type: "string" },
					images: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								url: {
									type: "string",
									required: true
								},
								thumbUrl: {
									type: "string",
									required: true
								},
								width: {
									type: "integer",
									required: true
								},
								height: {
									type: "integer",
									required: true
								},
								title: { type: "string" },
								author: { type: "string" },
								authorUrl: { type: "string" },
								sourceUrl: { type: "string" },
								license: { type: "string" },
								color: { type: "string" }
							}
						}
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: renderOutcomeText(value)
			}],
			presentationMeta: (_args, value) => value
		},
		timeoutMs: 3e4,
		isConcurrencySafe: () => true,
		presentCall: searchRefsCallView,
		presentResult: (args, result) => {
			const meta = narrowOutcome(result.meta);
			return {
				card: "generic",
				title: meta === null ? "搜参考图" : outcomeSummary(meta),
				content: result.content
			};
		},
		async execute(args, exec) {
			const active = spec();
			const { query, provider, count, page, orientation } = resolveCallRequest(args, active);
			const key = cacheKey(provider, query, page, count, orientation);
			const cached = cache.get(key);
			if (cached !== void 0) return cached;
			const result = await searchProvider(provider, keyFor(active, provider), query, page, count, orientation, exec.signal);
			const outcome = {
				query,
				provider,
				page,
				perPage: result.images.length,
				total: result.total,
				truncated: result.total > page * result.images.length,
				images: result.images
			};
			if (outcome.images.length === 0) outcome.note = "No results for this query; try a broader description or a different provider.";
			cache.set(key, outcome);
			return outcome;
		}
	}));
}
//#endregion
export { Config, DEFAULT_COUNT, DOWNLOAD_CAP_BYTES, MAX_COUNT, MIN_COUNT, ORIENTATIONS, PROVIDERS, PROVIDER_CHOICES, REFPICS_SETTINGS_NAMESPACE, SEARCH_TIMEOUT_MS, apply, cacheKey, clampCount, createSearchCache, extensionFor, inject, keyFor, name, registerRefpicsRoutes, resolveCallRequest, resolveConfig, resolveProvider, runBoardSearch, safeFileName, searchProvider, searchRefsCallView };
