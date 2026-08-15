import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Config, keyFor, providerReady, resolveCallRequest, resolveConfig, resolveProvider } from '../src/config.ts'

describe('config', () => {
  it('resolves defaults', () => {
    const cfg = resolveConfig({})
    assert.equal(cfg.defaultProvider, 'auto')
    assert.equal(cfg.defaultCount, 12)
    assert.equal(cfg.pexelsKey, undefined)
  })

  it('trims keys and rejects bad defaults', () => {
    const cfg = resolveConfig({ pexelsKey: '  k  ', defaultCount: 20 })
    assert.equal(cfg.pexelsKey, 'k')
    assert.equal(cfg.defaultCount, 20)
    assert.throws(() => resolveConfig({ defaultCount: 0 }))
    assert.throws(() => resolveConfig({ defaultCount: 31 }))
    assert.throws(() => resolveConfig({ defaultProvider: 'bing' as never }))
  })

  it('reports provider readiness by key presence', () => {
    const cfg = resolveConfig({ pixabayKey: 'k' })
    assert.equal(providerReady(cfg, 'openverse'), true)
    assert.equal(providerReady(cfg, 'pixabay'), true)
    assert.equal(providerReady(cfg, 'pexels'), false)
    assert.equal(keyFor(cfg, 'pixabay'), 'k')
  })

  it('auto falls back to openverse when nothing is configured', () => {
    const cfg = resolveConfig({})
    assert.equal(resolveProvider('auto', cfg), 'openverse')
  })

  it('auto prefers a configured default provider', () => {
    const cfg = resolveConfig({ unsplashKey: 'u' })
    assert.equal(resolveProvider('auto', cfg), 'unsplash')
  })

  it('auto prefers the first keyed provider in quality order', () => {
    const cfg = resolveConfig({ pexelsKey: 'p', pixabayKey: 'q', unsplashKey: 'u' })
    assert.equal(resolveProvider('auto', cfg), 'pexels')
  })

  it('throws a friendly error for an explicit unconfigured provider', () => {
    const cfg = resolveConfig({})
    assert.throws(() => resolveProvider('pexels', cfg), /not configured/)
    assert.throws(() => resolveProvider('unsplash', cfg), /not configured/)
    assert.equal(resolveProvider('openverse', cfg), 'openverse')
  })

  it('the Config schema carries the settings namespace shape', () => {
    assert.ok(Config)
  })

  it('materializes omitted call arguments against the config', () => {
    const cfg = resolveConfig({})
    const request = resolveCallRequest({ query: '  soviet poster  ' }, cfg)
    assert.equal(request.query, 'soviet poster')
    assert.equal(request.provider, 'openverse')
    assert.equal(request.count, 12)
    assert.equal(request.page, 1)
    assert.equal(request.orientation, 'any')
  })

  it('materializes partial and out-of-band arguments', () => {
    const cfg = resolveConfig({ defaultCount: 20, pixabayKey: 'k' })
    const request = resolveCallRequest({ query: 'x', provider: 'auto', orientation: 'square' }, cfg)
    assert.equal(request.provider, 'pixabay')
    assert.equal(request.count, 20)
    assert.equal(request.orientation, 'square')
    const paged = resolveCallRequest({ query: 'x', count: 999, page: 0 }, cfg)
    assert.equal(paged.count, 30)
    assert.equal(paged.page, 1)
  })

  it('rejects blank queries', () => {
    const cfg = resolveConfig({})
    assert.throws(() => resolveCallRequest({ query: '   ' }, cfg), /non-empty/)
    assert.throws(() => resolveCallRequest({ query: undefined as never }, cfg), /non-empty/)
  })
})
