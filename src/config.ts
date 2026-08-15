/**
 * Config and provider-selection facts for the search_refs tool. Holds the
 * schemastery section that doubles as the plugin's settings card schema
 * (Settings -> Plugins -> Reference pictures), plus the per-call provider
 * resolution: "auto" walks a fixed preference order and falls back to the
 * keyless Openverse API.
 *
 * @module dsh-refpics/config
 */

import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import {
  DEFAULT_COUNT,
  PROVIDER_CHOICES,
  PROVIDERS,
  type Orientation,
  type ProviderChoice,
  type ProviderId,
} from './core/outcome.ts'
import { clampCount } from './providers.ts'

/** Settings namespace the Plugins card edits. */
export const REFPICS_SETTINGS_NAMESPACE = settingsNamespace('ref-pics')

/** Default port of the Eagle local API server. */
export const DEFAULT_EAGLE_PORT = 41595

/** Deployment configuration for dsh-refpics; every field optional so an unconfigured mount loads silently. */
export interface Config {
  /** Pexels API key (free tier: https://www.pexels.com/api/). */
  pexelsKey?: string
  /** Pixabay API key (free: https://pixabay.com/api/docs/). */
  pixabayKey?: string
  /** Unsplash access key (free: https://unsplash.com/developers). */
  unsplashKey?: string
  /** Provider preferred when a call passes "auto". */
  defaultProvider?: ProviderChoice
  /** Count preferred when a call omits its count. */
  defaultCount?: number
  /** Port of the Eagle local API server (0 disables the save-to-Eagle routes). */
  eaglePort?: number
  /** Optional Eagle API token (only needed when Eagle requires one). */
  eagleToken?: string
}

/** Schemastery configuration; doubles as the `ref-pics` settings-section schema. */
export const Config: z<Config> = z.object({
  pexelsKey: z.string().role('secret').description('Pexels API key (free at pexels.com/api). Leave empty to disable.'),
  pixabayKey: z.string().role('secret').description('Pixabay API key (free at pixabay.com/api/docs). Leave empty to disable.'),
  unsplashKey: z.string().role('secret').description('Unsplash access key (free at unsplash.com/developers). Leave empty to disable.'),
  defaultProvider: z.union(PROVIDER_CHOICES).default('auto').description('Provider used when a call passes "auto".'),
  defaultCount: z.number().step(1).min(1).max(30).default(DEFAULT_COUNT).description('Image count used when a call omits count.'),
  eaglePort: z.number().step(1).min(0).max(65535).default(DEFAULT_EAGLE_PORT).description('Eagle local API port (0 disables save-to-Eagle).'),
  eagleToken: z.string().role('secret').description('Optional Eagle API token; leave empty when Eagle needs none.'),
})

/** One resolved configuration snapshot with defaults applied. */
export interface ResolvedConfig {
  pexelsKey: string | undefined
  pixabayKey: string | undefined
  unsplashKey: string | undefined
  defaultProvider: ProviderChoice
  defaultCount: number
  eaglePort: number
  eagleToken: string | undefined
}

/** Resolve raw config into validated facts with defaults and bounds. */
export function resolveConfig(config: Config): ResolvedConfig {
  const defaultCount = config.defaultCount ?? DEFAULT_COUNT
  if (!Number.isFinite(defaultCount) || defaultCount < 1 || defaultCount > 30) {
    throw new Error('dsh-refpics: defaultCount must be an integer between 1 and 30')
  }
  const defaultProvider = config.defaultProvider ?? 'auto'
  if (!PROVIDER_CHOICES.includes(defaultProvider)) {
    throw new Error(`dsh-refpics: defaultProvider must be one of ${PROVIDER_CHOICES.join(', ')}`)
  }
  const eaglePort = config.eaglePort ?? DEFAULT_EAGLE_PORT
  if (!Number.isInteger(eaglePort) || eaglePort < 0 || eaglePort > 65535) {
    throw new Error('dsh-refpics: eaglePort must be an integer between 0 and 65535')
  }
  return {
    pexelsKey: nonEmpty(config.pexelsKey),
    pixabayKey: nonEmpty(config.pixabayKey),
    unsplashKey: nonEmpty(config.unsplashKey),
    defaultProvider,
    defaultCount,
    eaglePort,
    eagleToken: nonEmpty(config.eagleToken),
  }
}

/** The API key for one provider under the resolved config. */
export function keyFor(cfg: ResolvedConfig, provider: ProviderId): string | undefined {
  switch (provider) {
    case 'pexels': return cfg.pexelsKey
    case 'pixabay': return cfg.pixabayKey
    case 'unsplash': return cfg.unsplashKey
    case 'openverse': return undefined
  }
}

/** Whether a provider is usable under the resolved config. */
export function providerReady(cfg: ResolvedConfig, provider: ProviderId): boolean {
  return provider === 'openverse' || (keyFor(cfg, provider) ?? '').trim().length > 0
}

/**
 * Resolve a preferred provider choice to a concrete, usable provider.
 * "auto" prefers the configured default (when it is a concrete provider),
 * then the keyed providers in quality order, and finally falls back to the
 * keyless Openverse API; an explicit choice that is not configured throws
 * a friendly error naming the fix.
 */
export function resolveProvider(preferred: ProviderChoice, cfg: ResolvedConfig): ProviderId {
  if (preferred !== 'auto') {
    if (providerReady(cfg, preferred)) return preferred
    throw new Error(
      `search_refs: provider "${preferred}" is not configured. `
      + `Fill its API key under Settings -> Plugins -> Reference pictures, or pass provider "auto" (Openverse works without a key).`,
    )
  }
  const order: ProviderId[] = []
  if (cfg.defaultProvider !== 'auto' && PROVIDERS.includes(cfg.defaultProvider)) {
    order.push(cfg.defaultProvider)
  }
  for (const provider of ['pexels', 'pixabay', 'unsplash'] as const) {
    if (!order.includes(provider)) order.push(provider)
  }
  order.push('openverse')
  for (const provider of order) if (providerReady(cfg, provider)) return provider
  return 'openverse'
}

/** Trimmed non-empty string, or undefined. */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** One fully materialized call request: every optional argument resolved. */
export interface ResolvedCallRequest {
  query: string
  provider: ProviderId
  count: number
  page: number
  orientation: Orientation
}

/** Raw call arguments as the registry delivers them (only `query` required). */
export interface CallArgs {
  query: string
  count?: number
  provider?: ProviderChoice
  orientation?: Orientation
  page?: number
}

/**
 * Materialize one call's arguments against the resolved configuration. The
 * parameter schema's `default` annotations are model-visible hints only —
 * the registry never fills them in — so every omitted field resolves here:
 * provider falls back to the configured default provider (then the quality
 * order), count to the configured default count, orientation to "any", and
 * page to 1. A blank query throws.
 */
export function resolveCallRequest(args: CallArgs, cfg: ResolvedConfig): ResolvedCallRequest {
  const query = (args.query ?? '').trim()
  if (query.length === 0) throw new Error('search_refs: query must be a non-empty description')
  return {
    query,
    provider: resolveProvider(args.provider ?? cfg.defaultProvider, cfg),
    count: clampCount(args.count ?? cfg.defaultCount),
    page: Math.max(1, Math.floor(args.page ?? 1)),
    orientation: args.orientation ?? 'any',
  }
}
