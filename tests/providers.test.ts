import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clampCount, keyFieldOf, searchProvider, type SearchFetch } from '../src/providers.ts'

interface CapturedCall {
  url: URL
  init?: RequestInit
}

function fakeFetch(handler: (call: CapturedCall) => object): SearchFetch & { calls: CapturedCall[] } {
  const calls: CapturedCall[] = []
  const fn = (async (input: string | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(input)
    calls.push({ url, init })
    const body = JSON.stringify(handler({ url, init }))
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
  }) as SearchFetch & { calls: CapturedCall[] }
  fn.calls = calls
  return fn
}

describe('provider plumbing', () => {
  it('maps providers to their key fields', () => {
    assert.equal(keyFieldOf('pexels'), 'pexelsKey')
    assert.equal(keyFieldOf('pixabay'), 'pixabayKey')
    assert.equal(keyFieldOf('unsplash'), 'unsplashKey')
    assert.equal(keyFieldOf('openverse'), undefined)
  })

  it('clamps counts into the supported band', () => {
    assert.equal(clampCount(0), 1)
    assert.equal(clampCount(-5), 1)
    assert.equal(clampCount(12), 12)
    assert.equal(clampCount(999), 30)
    assert.equal(clampCount(Number.NaN), 1)
  })

  it('normalizes an openverse page', async () => {
    const fetchFn = fakeFetch(({ url }) => {
      assert.equal(url.hostname, 'api.openverse.org')
      assert.equal(url.searchParams.get('q'), 'japanese garden')
      assert.equal(url.searchParams.get('page_size'), '12')
      assert.equal(url.searchParams.get('page'), '2')
      return {
        result_count: 120,
        results: [{
          id: 'abc-123',
          url: 'https://live.example.org/full.jpg',
          thumbnail: 'https://api.openverse.org/v1/images/abc-123/thumb/',
          width: 1000,
          height: 640,
          title: 'A garden',
          creator: 'Gardener',
          creator_url: 'https://flickr.example/u/gardener',
          foreign_landing_url: 'https://flickr.example/photo/1',
          license: 'by-sa',
        }],
      }
    })
    const page = await searchProvider('openverse', undefined, 'japanese garden', 2, 12, 'landscape', undefined, fetchFn)
    assert.equal(page.total, 120)
    assert.equal(page.page, 2)
    assert.equal(page.images.length, 1)
    assert.equal(page.images[0]?.id, 'openverse:abc-123')
    assert.equal(page.images[0]?.author, 'Gardener')
    assert.equal(page.images[0]?.license, 'by-sa')
    assert.equal(page.images[0]?.sourceUrl, 'https://flickr.example/photo/1')
  })

  it('normalizes a pexels page with the key in the header', async () => {
    const fetchFn = fakeFetch(({ url, init }) => {
      assert.equal(url.hostname, 'api.pexels.com')
      assert.deepEqual(init?.headers, { authorization: 'k123', accept: 'application/json' })
      return {
        total_results: 7,
        photos: [{
          id: 99,
          width: 2000,
          height: 3000,
          url: 'https://www.pexels.com/photo/99/',
          photographer: 'Ana',
          photographer_url: 'https://www.pexels.com/@ana',
          alt: 'Red wall',
          avg_color: '#A12B2B',
          src: { large2x: 'https://images.pexels.com/photos/99/large2x.jpg', large: 'https://images.pexels.com/photos/99/large.jpg', medium: 'https://images.pexels.com/photos/99/medium.jpg' },
        }],
      }
    })
    const page = await searchProvider('pexels', 'k123', 'red wall', 1, 5, 'portrait', undefined, fetchFn)
    assert.equal(page.images[0]?.id, 'pexels:99')
    assert.equal(page.images[0]?.url, 'https://images.pexels.com/photos/99/large2x.jpg')
    assert.equal(page.images[0]?.thumbUrl, 'https://images.pexels.com/photos/99/medium.jpg')
    assert.equal(page.images[0]?.color, '#A12B2B')
  })

  it('normalizes a pixabay page', async () => {
    const fetchFn = fakeFetch(({ url }) => {
      assert.equal(url.hostname, 'pixabay.com')
      assert.equal(url.searchParams.get('key'), 'pk')
      return {
        total: 3,
        hits: [{
          id: 7,
          pageURL: 'https://pixabay.com/photos/7/',
          webformatURL: 'https://pixabay/get/7_640.jpg',
          webformatWidth: 640,
          webformatHeight: 427,
          largeImageURL: 'https://pixabay/get/7_large.jpg',
          imageWidth: 4000,
          imageHeight: 2667,
          tags: 'forest, fog, trees',
          user: 'woods',
        }],
      }
    })
    const page = await searchProvider('pixabay', 'pk', 'forest', 1, 3, 'any', undefined, fetchFn)
    assert.equal(page.images[0]?.id, 'pixabay:7')
    assert.equal(page.images[0]?.title, 'forest, fog, trees')
    assert.equal(page.images[0]?.width, 4000)
  })

  it('normalizes an unsplash page and maps square to squarish', async () => {
    const fetchFn = fakeFetch(({ url, init }) => {
      assert.equal(url.hostname, 'api.unsplash.com')
      assert.equal(url.searchParams.get('orientation'), 'squarish')
      assert.deepEqual(init?.headers, { authorization: 'Client-ID ukey', accept: 'application/json' })
      return {
        total: 9,
        results: [{
          id: 'Xy9',
          width: 3000,
          height: 2000,
          color: '#0f0f0f',
          alt_description: 'A dark desk',
          urls: { regular: 'https://images.unsplash.com/photo-1?w=1080', small: 'https://images.unsplash.com/photo-1?w=400', full: 'https://images.unsplash.com/photo-1?w=3000' },
          links: { html: 'https://unsplash.com/photos/Xy9' },
          user: { name: 'Desk Fan', links: { html: 'https://unsplash.com/@deskfan' } },
        }],
      }
    })
    const page = await searchProvider('unsplash', 'ukey', 'dark desk', 1, 4, 'square', undefined, fetchFn)
    assert.equal(page.images[0]?.id, 'unsplash:Xy9')
    assert.equal(page.images[0]?.author, 'Desk Fan')
    assert.equal(page.images[0]?.sourceUrl, 'https://unsplash.com/photos/Xy9')
  })

  it('rejects keyed providers without a key', async () => {
    let called = 0
    const fetchFn = (async () => {
      called += 1
      return new Response('{}')
    }) as SearchFetch
    await assert.rejects(searchProvider('pexels', '', 'x', 1, 3, 'any', undefined, fetchFn), /needs an API key/)
    await assert.rejects(searchProvider('pixabay', undefined, 'x', 1, 3, 'any', undefined, fetchFn), /needs an API key/)
    assert.equal(called, 0)
  })

  it('surfaces provider HTTP failures with status', async () => {
    const fetchFn = (async () => new Response('rate limited', { status: 429 })) as SearchFetch
    await assert.rejects(searchProvider('openverse', undefined, 'x', 1, 3, 'any', undefined, fetchFn), /openverse responded 429/)
  })
})
