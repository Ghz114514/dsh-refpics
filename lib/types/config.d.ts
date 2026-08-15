/**
 * Config and provider-selection facts for the search_refs tool. Holds the
 * schemastery section that doubles as the plugin's settings card schema
 * (Settings -> Plugins -> Reference pictures), plus the per-call provider
 * resolution: "auto" walks a fixed preference order and falls back to the
 * keyless Openverse API.
 *
 * @module dsh-refpics/config
 */
import z from 'schemastery';
import { type Orientation, type ProviderChoice, type ProviderId } from './core/outcome.ts';
/** Settings namespace the Plugins card edits. */
export declare const REFPICS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Default port of the Eagle local API server. */
export declare const DEFAULT_EAGLE_PORT = 41595;
/** Deployment configuration for dsh-refpics; every field optional so an unconfigured mount loads silently. */
export interface Config {
    /** Pexels API key (free tier: https://www.pexels.com/api/). */
    pexelsKey?: string;
    /** Pixabay API key (free: https://pixabay.com/api/docs/). */
    pixabayKey?: string;
    /** Unsplash access key (free: https://unsplash.com/developers). */
    unsplashKey?: string;
    /** Provider preferred when a call passes "auto". */
    defaultProvider?: ProviderChoice;
    /** Count preferred when a call omits its count. */
    defaultCount?: number;
    /** Port of the Eagle local API server (0 disables the save-to-Eagle routes). */
    eaglePort?: number;
    /** Optional Eagle API token (only needed when Eagle requires one). */
    eagleToken?: string;
}
/** Schemastery configuration; doubles as the `ref-pics` settings-section schema. */
export declare const Config: z<Config>;
/** One resolved configuration snapshot with defaults applied. */
export interface ResolvedConfig {
    pexelsKey: string | undefined;
    pixabayKey: string | undefined;
    unsplashKey: string | undefined;
    defaultProvider: ProviderChoice;
    defaultCount: number;
    eaglePort: number;
    eagleToken: string | undefined;
}
/** Resolve raw config into validated facts with defaults and bounds. */
export declare function resolveConfig(config: Config): ResolvedConfig;
/** The API key for one provider under the resolved config. */
export declare function keyFor(cfg: ResolvedConfig, provider: ProviderId): string | undefined;
/** Whether a provider is usable under the resolved config. */
export declare function providerReady(cfg: ResolvedConfig, provider: ProviderId): boolean;
/**
 * Resolve a preferred provider choice to a concrete, usable provider.
 * "auto" prefers the configured default (when it is a concrete provider),
 * then the keyed providers in quality order, and finally falls back to the
 * keyless Openverse API; an explicit choice that is not configured throws
 * a friendly error naming the fix.
 */
export declare function resolveProvider(preferred: ProviderChoice, cfg: ResolvedConfig): ProviderId;
/** One fully materialized call request: every optional argument resolved. */
export interface ResolvedCallRequest {
    query: string;
    provider: ProviderId;
    count: number;
    page: number;
    orientation: Orientation;
}
/** Raw call arguments as the registry delivers them (only `query` required). */
export interface CallArgs {
    query: string;
    count?: number;
    provider?: ProviderChoice;
    orientation?: Orientation;
    page?: number;
}
/**
 * Materialize one call's arguments against the resolved configuration. The
 * parameter schema's `default` annotations are model-visible hints only —
 * the registry never fills them in — so every omitted field resolves here:
 * provider falls back to the configured default provider (then the quality
 * order), count to the configured default count, orientation to "any", and
 * page to 1. A blank query throws.
 */
export declare function resolveCallRequest(args: CallArgs, cfg: ResolvedConfig): ResolvedCallRequest;
//# sourceMappingURL=config.d.ts.map