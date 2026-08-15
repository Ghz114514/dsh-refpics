/**
 * Standalone build config for the dsh-refpics plugin, mirroring the
 * dsh-web-ui family preset (shared/tsdown.client.ts) without depending on
 * the monorepo: the node half (tool registration + provider adapters +
 * settings section) builds to lib/index.js, and the browser half builds
 * from src/client/index.tsx to lib/client.js as a closure-factory artifact
 * (window.__ModuleLoader__.load handoff, externals resolved through the
 * injected require). Runtime @deepseek-ai/* peers stay external on the
 * node side and resolve from the dsh profile tree; schemastery is a
 * declared dependency and rides the host install too.
 *
 * Styles: this package injects its CSS as a JS string (src/client/styles.ts)
 * instead of CSS Modules so the build needs no lightningcss step.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { UserConfig } from 'tsdown'

/** Platform seed modules the shell shares into the frozen module table. */
const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
  // Documented runtime-store exemption of the family preset: the client
  // runtime snapshot-store engine is answered natively by the module table.
  '@deepseek-ai/dsh-client-runtime/client',
]

const libExternal: readonly (string | RegExp)[] = [
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-tools',
  'schemastery',
]

function clientLibraryConfig(id: string, libEntry: readonly string[]): UserConfig {
  return {
    name: id,
    entry: [...libEntry],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // The cordis framework resolves at runtime from the dsh profile tree,
    // never from this repo's install.
    external: ['@deepseek-ai/cordis', ...libExternal],
  }
}

function clientConfig(id: string, entry: string): UserConfig {
  return {
    name: `${id}/client`,
    entry: { client: entry },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    // Anything NOT in the loader module table must inline; a require() the
    // table cannot answer is a guaranteed runtime throw.
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    plugins: [{
      // Bundle purity gate (mirror of the family preset): platform seed
      // entries stay external, and every other @deepseek-ai value import is
      // a build error. Type-only imports are erased and never reach here.
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS) — `
          + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
        )
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}

export default function refpicsConfig(): UserConfig[] {
  const hasClient = existsSync(resolve(process.cwd(), 'src/client/index.tsx'))
  const node = [clientLibraryConfig('dsh-refpics', ['src/index.ts'])]
  return hasClient ? [...node, clientConfig('dsh-refpics', 'src/client/index.tsx')] : node
}
