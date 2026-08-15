/**
 * Model-facing reference-image search for the dsh web GUI. The search_refs
 * tool takes a natural-language description and returns normalized images
 * from a design-stock provider: Openverse (keyless, always available) or
 * Pexels / Pixabay / Unsplash (free API keys). The browser half renders
 * each call as a Pinterest-style masonry wall with a lightbox; the
 * model-facing text stays a compact numbered list so the model can cite
 * specific results.
 *
 * Family-style mounting: the aggregate-less package may be installed
 * without configuration (the "auto" provider falls back to Openverse), so
 * per-call facts validate lazily; the "Reference pictures" settings
 * section can fill API keys live from Settings -> Plugins.
 *
 * @module dsh-refpics
 */
import { installSettingsSection } from '@deepseek-ai/dsh-settings';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { Config, REFPICS_SETTINGS_NAMESPACE, keyFor, resolveCallRequest, resolveConfig } from "./config.js";
import { DEFAULT_COUNT, MAX_COUNT, ORIENTATIONS, PROVIDER_CHOICES, narrowOutcome, outcomeSummary, renderOutcomeText, } from "./core/outcome.js";
import { searchProvider, clampCount } from "./providers.js";
import { registerRefpicsRoutes } from "./routes.js";
export const name = 'ref-pics';
export const inject = ['tools'];
export { PROVIDERS, PROVIDER_CHOICES, ORIENTATIONS, DEFAULT_COUNT, MIN_COUNT, MAX_COUNT } from "./core/outcome.js";
export { Config, REFPICS_SETTINGS_NAMESPACE, resolveConfig, resolveProvider, resolveCallRequest, keyFor } from "./config.js";
export { clampCount, searchProvider, SEARCH_TIMEOUT_MS } from "./providers.js";
export { registerRefpicsRoutes, runBoardSearch, safeFileName, extensionFor, DOWNLOAD_CAP_BYTES } from "./routes.js";
const TOOL_HEAD = 'Search stock design platforms for reference images matching a natural-language description and '
    + 'return them as a structured list the chat UI renders as a Pinterest-style masonry wall with a '
    + 'lightbox. Use when the user asks for reference pictures, moodboards, visual inspiration, '
    + '"找参考图 / 给我找一些...图片 / 类似 pinterest 的灵感墙", or wants to see what a described '
    + 'style, object, or scene looks like. ';
/** Pending-state presentation: a generic search card naming the query. */
export function searchRefsCallView(args) {
    return {
        card: 'generic',
        title: '搜参考图',
        kind: 'search',
        rawInput: { query: args.query, provider: args.provider ?? 'auto', count: args.count ?? 12, orientation: args.orientation ?? 'any' },
    };
}
/** Create a bounded, TTL-scoped cache for provider pages. */
export function createSearchCache(maxEntries = 64, ttlMs = 10 * 60_000) {
    const entries = new Map();
    return {
        get(key) {
            const hit = entries.get(key);
            if (hit === undefined)
                return undefined;
            if (hit.expires < Date.now()) {
                entries.delete(key);
                return undefined;
            }
            entries.delete(key);
            entries.set(key, hit);
            return hit.value;
        },
        set(key, value) {
            if (entries.size >= maxEntries) {
                const oldest = entries.keys().next();
                if (!oldest.done)
                    entries.delete(oldest.value);
            }
            entries.set(key, { expires: Date.now() + ttlMs, value });
        },
    };
}
/** Cache key for one provider page. */
export function cacheKey(provider, query, page, count, orientation) {
    return [provider, query.trim().toLowerCase(), page, clampCount(count), orientation].join('|');
}
/** Result the tool registers on `ctx.tools`. */
export function apply(ctx, config = {}) {
    let current = () => config;
    installSettingsSection(ctx, REFPICS_SETTINGS_NAMESPACE, Config, config, {
        setSource: (source) => {
            current = source;
        },
        onChange: () => { },
        validate: (value) => {
            resolveConfig(value);
        },
    });
    const spec = () => resolveConfig(current());
    const cache = createSearchCache();
    // Board/download/Eagle routes ride the webserver when one is mounted; the
    // tool itself stays available in headless profiles without it.
    ctx.inject(['webServer'], (webCtx) => {
        registerRefpicsRoutes(webCtx, spec);
    });
    ctx.tools.register(defineTool({
        name: 'search_refs',
        description: TOOL_HEAD
            + 'Providers: Openverse (keyless, always available), Pexels, Pixabay, Unsplash (need free API '
            + 'keys configured under Settings -> Plugins -> Reference pictures). Provider "auto" picks the '
            + 'first configured provider and falls back to Openverse. '
            + 'Query strategy: stock libraries index English, so ALWAYS translate the description into '
            + 'concise canonical ENGLISH keywords for `query` (e.g. "波普艺术海报" -> "pop art poster"). '
            + 'Keep queries broad (style, subject, mood) and run 2-4 parallel calls with different keyword '
            + 'clusters to cover the idea; DO NOT narrow to a single artist unless the user names one. '
            + 'The result carries a structured image list (id, url, thumbUrl, width, height, title, author, '
            + 'sourceUrl, license); the user sees a masonry wall rendered from it. Ask the user for '
            + 'clarification only when the description is genuinely ambiguous.',
        parameters: {
            query: {
                type: 'string',
                required: true,
                description: 'Concise ENGLISH keywords for the reference images (style, subject, mood, colors, medium), translated from the user\'s description. Broad terms, not single artists.',
            },
            count: {
                type: 'integer',
                default: DEFAULT_COUNT,
                description: `Number of images to return (${1}-${MAX_COUNT}, default ${DEFAULT_COUNT}).`,
            },
            provider: {
                type: 'string',
                enum: [...PROVIDER_CHOICES],
                default: 'auto',
                description: 'Provider to search: "auto" picks the first configured one and falls back to Openverse; openverse needs no key.',
            },
            orientation: {
                type: 'string',
                enum: [...ORIENTATIONS],
                default: 'any',
                description: 'Orientation filter (any / landscape / portrait / square).',
            },
            page: {
                type: 'integer',
                default: 1,
                description: 'Page of results to fetch (1-based) when the user wants more of the same query.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    query: { type: 'string', required: true },
                    provider: { type: 'string', required: true, enum: ['openverse', 'pexels', 'pixabay', 'unsplash'] },
                    page: { type: 'integer', required: true },
                    perPage: { type: 'integer', required: true },
                    total: { type: 'integer', required: true },
                    truncated: { type: 'boolean', required: true },
                    note: { type: 'string' },
                    images: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                id: { type: 'string', required: true },
                                url: { type: 'string', required: true },
                                thumbUrl: { type: 'string', required: true },
                                width: { type: 'integer', required: true },
                                height: { type: 'integer', required: true },
                                title: { type: 'string' },
                                author: { type: 'string' },
                                authorUrl: { type: 'string' },
                                sourceUrl: { type: 'string' },
                                license: { type: 'string' },
                                color: { type: 'string' },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderOutcomeText(value) }],
            presentationMeta: (_args, value) => value,
        },
        timeoutMs: 30_000,
        isConcurrencySafe: () => true,
        presentCall: searchRefsCallView,
        presentResult: (args, result) => {
            const meta = narrowOutcome(result.meta);
            const title = meta === null ? '搜参考图' : outcomeSummary(meta);
            return { card: 'generic', title, content: result.content };
        },
        async execute(args, exec) {
            const active = spec();
            // The parameter schema's `default` annotations are model-visible hints
            // only — the registry never materializes them, so every omitted
            // argument resolves against the active configuration here.
            const request = resolveCallRequest(args, active);
            const { query, provider, count, page, orientation } = request;
            const key = cacheKey(provider, query, page, count, orientation);
            const cached = cache.get(key);
            if (cached !== undefined)
                return cached;
            const apiKey = keyFor(active, provider);
            const result = await searchProvider(provider, apiKey, query, page, count, orientation, exec.signal);
            const outcome = {
                query,
                provider,
                page,
                perPage: result.images.length,
                total: result.total,
                truncated: result.total > page * result.images.length,
                images: result.images,
            };
            if (outcome.images.length === 0) {
                outcome.note = 'No results for this query; try a broader description or a different provider.';
            }
            cache.set(key, outcome);
            return outcome;
        },
    }));
}
