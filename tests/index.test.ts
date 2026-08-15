import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply, createSearchCache, cacheKey, searchRefsCallView } from '../src/index.ts'
import { renderOutcomeText, type RefPicsOutcome } from '../src/core/outcome.ts'

const sampleOutcome: RefPicsOutcome = {
  query: 'minimalist interior',
  provider: 'openverse',
  page: 1,
  perPage: 1,
  total: 42,
  truncated: true,
  images: [{
    id: 'openverse:1',
    url: 'https://example.org/full.jpg',
    thumbUrl: 'https://example.org/thumb.jpg',
    width: 1200,
    height: 800,
    title: 'Minimal room',
  }],
}

interface RegisteredTool {
  name: string
  description: string
  parameters: {
    type?: string
    properties?: Record<string, { type?: string; enum?: readonly string[]; default?: unknown }>
  }
  output: { schema: object; render: (args: unknown, value: RefPicsOutcome) => unknown; presentationMeta: (args: unknown, value: RefPicsOutcome) => unknown }
  presentCall: (args: unknown) => unknown
  presentResult: (args: unknown, result: { content: unknown; isError: boolean; meta?: unknown }) => unknown
}

/** Minimal host context: no settings service mounted, tool registry recorded. */
function fakeContext() {
  const registered: RegisteredTool[] = []
  const ctx = {
    inject: () => {},
    effect: () => () => {},
    tools: {
      register: (definition: RegisteredTool) => {
        registered.push(definition)
        return () => {}
      },
    },
  }
  return { ctx, registered }
}

describe('host tool registration', () => {
  it('registers the search_refs tool and presents call and result', () => {
    const { ctx, registered } = fakeContext()
    apply(ctx as never, {})
    assert.equal(registered.length, 1)
    const tool = registered[0] as RegisteredTool
    assert.equal(tool.name, 'search_refs')
    assert.ok(tool.description.length > 60)
    const params = tool.parameters.properties ?? {}
    assert.equal(params.query?.type, 'string')
    assert.ok(params.provider?.enum?.includes('auto'))
    assert.ok(params.provider?.enum?.includes('openverse'))
    assert.equal(params.count?.default, 12)

    const view = searchRefsCallView({ query: 'q', count: 12, provider: 'auto', orientation: 'any', page: 1 })
    assert.equal(view.card, 'generic')
    assert.equal(view.kind, 'search')

    const rendered = tool.output.render({}, sampleOutcome)
    assert.deepEqual(rendered, [{ type: 'text', text: renderOutcomeText(sampleOutcome) }])
    assert.deepEqual(tool.output.presentationMeta({}, sampleOutcome), sampleOutcome)

    const result = tool.presentResult(
      { query: 'q', count: 12, provider: 'auto', orientation: 'any', page: 1 },
      { content: [{ type: 'text', text: 'x' }], isError: false, meta: sampleOutcome },
    )
    assert.deepEqual(result, { card: 'generic', title: 'openverse · 42 images · 1 shown', content: [{ type: 'text', text: 'x' }] })

    const degraded = tool.presentResult(
      { query: 'q', count: 12, provider: 'auto', orientation: 'any', page: 1 },
      { content: [], isError: false, meta: 'garbage' },
    )
    assert.deepEqual(degraded, { card: 'generic', title: '搜参考图', content: [] })
  })

  it('search cache stores, expires, and evicts least-recently-used entries', () => {
    const cache = createSearchCache(2, 1000)
    assert.equal(cache.get('a'), undefined)
    cache.set('a', sampleOutcome)
    cache.set('b', { ...sampleOutcome, page: 2 })
    assert.equal(cache.get('a')?.page, 1)
    // Reading 'a' refreshes it: the third entry evicts 'b', not 'a'.
    cache.set('c', { ...sampleOutcome, page: 3 })
    assert.equal(cache.get('a')?.page, 1)
    assert.equal(cache.get('b'), undefined)
    assert.notEqual(cache.get('c'), undefined)
  })

  it('cache keys normalize query and clamp count', () => {
    assert.equal(cacheKey('openverse', '  Dark Mode  ', 1, 12, 'any'), cacheKey('openverse', 'dark mode', 1, 12, 'any'))
    assert.equal(cacheKey('openverse', 'q', 1, 999, 'any'), cacheKey('openverse', 'q', 1, 30, 'any'))
    assert.notEqual(cacheKey('openverse', 'q', 1, 12, 'any'), cacheKey('pexels', 'q', 1, 12, 'any'))
  })
})
