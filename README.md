# dsh-refpics — Reference Image Search Plugin

English | [中文](README.zh.md)

Model-facing `search_refs` tool for the dsh web GUI: turns a natural-language description
("minimalist living room", "brutalist poster layout", "cyberpunk neon street at night"...) into a
board of matching reference images from stock design platforms, rendered **inside the conversation
as a Pinterest-style masonry wall** with hover credits and a keyboard-friendly lightbox.

One package, both halves. The node half (host process) registers the `search_refs` tool plus the
"Reference pictures" settings section; the browser half (Web GUI) registers a keyed
`tool.call.toolview` entry that owns how every `search_refs` call renders, so the wall appears
inline in the chat — no separate panel or page.

## Capabilities

| Capability | Description |
| --- | --- |
| Natural-language search | One call takes the user's raw description as `query` — no manual keyword translation needed |
| Four providers | Openverse (keyless, always available), Pexels, Pixabay, Unsplash (free API keys); `provider: auto` prefers the first configured keyed provider and falls back to Openverse |
| Pinterest-style wall | Responsive multi-column masonry inside the chat turn; lazy thumbnails, hover overlay with title and author |
| Lightbox | Click any card for the full image with title, author, source links, prev/next and Esc/arrow keyboard control |
| 换一批 / 翻页 | Header buttons on every wall: 换一批 queues a prompt asking the agent for a fresh batch, 翻页 queues the same query's next page — the new result renders as a normal chat wall |
| Sidebar board (dsh-better-sidebar) | Registers a single-instance "参考图" tab in the right sidebar: mirrors the latest chat search for the session and can run its own searches directly (instant 换一批/翻页, no agent round trip); "在侧边栏打开" on the wall jumps there |
| Download | One click downloads the image through a host proxy route (bounded, image-type gated, sanitized file name) |
| Save to Eagle | One click sends the image URL to the local Eagle app (`/api/item/addFromURLs`), with website/tags metadata; Eagle port and optional token are configurable |
| Attribution preserved | Every result carries author, author URL, source page and license; the wall and the model-facing text both surface them |
| Orientation and paging | `orientation: any/landscape/portrait/square` filters; `page` fetches more of the same query |
| Bounded results | Count clamped to 1-30 per call; per-request 20 s timeout; short-lived in-memory cache (TTL 10 min) dedupes repeat queries |
| Safe degradation | Running calls show a shimmer skeleton; failed calls show the error; a malformed payload falls back to a plain text card — a bad result can never break the chat row |
| No scraping | The tool talks only to official, documented APIs. It deliberately does not scrape Pinterest (no public API, ToS-hostile); Openverse/Pexels/Pixabay/Unsplash are the legal substitutes |

## Installation

```sh
# From GitHub — the repo ships prebuilt bundles, so no build step is needed
dsh plugin --profile web add github:Ghz114514/dsh-refpics
```

Restart the dsh web host (or the GUI) once so the profile picks up the new bundle; afterwards a
page refresh is enough for client-side updates. The tool mounts without configuration: `auto`
falls back to Openverse immediately, and the first keyed-provider call fails with a clear message
until its key is filled in.

Local development (this repo):

```sh
pnpm install          # node >= 22.19
pnpm build            # lib/index.js (host) + lib/client.js (browser)
dsh plugin --profile web add file:<repo>     # install the local build
# After any rebuild, refresh the installed copy the same way
```

## Configuration

Settings → Plugins → **Reference pictures** (the `ref-pics` settings section; effective immediately):

| Key | Default | Meaning |
| --- | --- | --- |
| `pexelsKey` | empty | Pexels API key (free at pexels.com/api); empty disables the provider |
| `pixabayKey` | empty | Pixabay API key (free at pixabay.com/api/docs); empty disables the provider |
| `unsplashKey` | empty | Unsplash access key (free at unsplash.com/developers); empty disables the provider |
| `defaultProvider` | `auto` | Provider preferred when a call passes `auto` |
| `defaultCount` | `12` | Image count used when a call omits `count` (1-30) |
| `eaglePort` | `41595` | Eagle local API port; `0` disables the save-to-Eagle routes |
| `eagleToken` | empty | Optional Eagle API token (only when Eagle requires one) |

Keys and the Eagle token are marked `secret` in the settings schema (masked in the card) and are
never included in logs, tool output, or model-facing text.

The browser half exposes four same-origin host routes: `GET /refpics/search` (direct board search),
`GET /refpics/download` (proxied attachment download, 30 MiB cap, image content types only),
`POST /refpics/eagle` (add one image to the local Eagle app), and `GET /refpics/eagle/status`
(Eagle health). The Eagle routes only ever talk to `127.0.0.1:<eaglePort>`.

## Tool usage

The model calls `search_refs` when the user asks for reference pictures, moodboards, or visual
inspiration. Arguments:

| Argument | Type | Default | Meaning |
| --- | --- | --- | --- |
| `query` | string | required | Natural-language description (style, subject, mood, colors, medium) |
| `count` | integer | 12 | Images per page (1-30) |
| `provider` | enum | `auto` | `auto` \| `openverse` \| `pexels` \| `pixabay` \| `unsplash` |
| `orientation` | enum | `any` | `any` \| `landscape` \| `portrait` \| `square` |
| `page` | integer | 1 | Page of the same query (more results) |

Example prompts that trigger it: "帮我找几张极简客厅的参考图", "show me reference images of
brutalist poster layouts", "做一个赛博朋克风格的 moodboard".

## Security model

- Only official, documented provider APIs are called over HTTPS; no scraping, no cookies, no login.
- API keys live in the settings section (`role: secret`), resolve per call, and are never logged or
  returned to the model; HTTP failure excerpts are truncated to 200 characters.
- Requests are bounded: 20 s per provider call (plus a 30 s tool-level cooperative timeout) and the
  abort signal is forwarded on cancellation.
- Results are provider-hosted image URLs with attribution metadata; the plugin stores nothing.

## Development

```sh
pnpm install          # dependencies (node >= 22.19)
pnpm build            # tsc -b && tsdown -> lib/index.js (host) + lib/client.js (browser)
pnpm typecheck        # host + client programs + tests
pnpm test             # node --test tests/ (31 tests, in-process)
node scripts/smoke-host.mjs    # live end-to-end: registers the tool and runs one real Openverse search
node scripts/smoke-client.mjs  # simulated-browser smoke of the client bundle and its wiring
```

Layout follows the dsh-web-ui family conventions (adapted to a standalone package): `src/index.ts`
host half, `src/client/` browser half, `src/core/` shared pure logic, `cordis.patch.yml` profile
patch, `dsh.client` declaration for the browser bundle. The browser half uses the keyed
`tool.call.toolview` slot (`key: search_refs`) with a generic-card fallback for UIs that do not
know the plugin.

## Credits

- **DeepSeek Harness (dsh)** — the platform this plugin runs on:
  [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- **dsh-web-ui plugin family** — the bundle-patch profile mechanism, the host/browser split, the
  settings-section pattern, and the keyed `tool.call.toolview` slot pattern are adapted from
  [zhu1090093659/dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) (in particular
  `packages/dsh-tool-describe-image`)
- **dsh-better-sidebar** — the sidebar board tab integrates through its tab-registry service:
  [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (see the
  [dsh-better-sidebar topic](https://github.com/topics/dsh-better-sidebar) for related projects
  and integrations)
- **Image providers** — [Openverse](https://openverse.org), [Pexels](https://www.pexels.com),
  [Pixabay](https://pixabay.com), [Unsplash](https://unsplash.com); the save-to-Eagle seam uses the
  official [Eagle local API](https://api.eagle.cool)
