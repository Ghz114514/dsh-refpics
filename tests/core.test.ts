import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  imageLine,
  narrowOutcome,
  narrowRefImage,
  outcomeSummary,
  renderOutcomeText,
  type RefImage,
  type RefPicsOutcome,
} from '../src/core/outcome.ts'

const sampleImage: RefImage = {
  id: 'openverse:1',
  url: 'https://example.org/full.jpg',
  thumbUrl: 'https://example.org/thumb.jpg',
  width: 1200,
  height: 800,
  title: 'Minimal room',
  author: 'Jane Doe',
  sourceUrl: 'https://example.org/page',
  license: 'by',
}

const sampleOutcome: RefPicsOutcome = {
  query: 'minimalist interior',
  provider: 'openverse',
  page: 1,
  perPage: 1,
  total: 42,
  truncated: true,
  images: [sampleImage],
}

describe('core outcome', () => {
  it('narrows a valid image', () => {
    const image = narrowRefImage({ ...sampleImage })
    assert.notEqual(image, null)
    assert.equal(image?.id, 'openverse:1')
    assert.equal(image?.author, 'Jane Doe')
  })

  it('rejects images with missing or malformed urls', () => {
    assert.equal(narrowRefImage({ id: 'x', url: 'not-a-url', thumbUrl: 'https://a/b.jpg', width: 1, height: 1 }), null)
    assert.equal(narrowRefImage({ id: '', url: 'https://a/b.jpg', thumbUrl: 'https://a/b.jpg', width: 1, height: 1 }), null)
    assert.equal(narrowRefImage(null), null)
  })

  it('narrows a valid outcome and drops malformed images', () => {
    const outcome = narrowOutcome({
      ...sampleOutcome,
      images: [sampleImage, { id: 'bad', url: 'x', thumbUrl: 'y', width: 0, height: 0 }],
    })
    assert.notEqual(outcome, null)
    assert.equal(outcome?.images.length, 1)
    assert.equal(outcome?.truncated, true)
  })

  it('rejects malformed outcomes', () => {
    assert.equal(narrowOutcome(null), null)
    assert.equal(narrowOutcome({ query: 'q' }), null)
    assert.equal(narrowOutcome({ ...sampleOutcome, provider: 'bing' }), null)
    assert.equal(narrowOutcome({ ...sampleOutcome, images: 'nope' }), null)
  })

  it('summarizes an outcome', () => {
    assert.equal(outcomeSummary(sampleOutcome), 'openverse · 42 images · 1 shown')
    assert.equal(outcomeSummary({ ...sampleOutcome, total: 1, images: [] }), 'openverse · 1 image · 0 shown')
  })

  it('renders model-facing lines with index, attribution, size, and url', () => {
    const line = imageLine(3, sampleImage)
    assert.ok(line.includes('3.'))
    assert.ok(line.includes('Minimal room'))
    assert.ok(line.includes('Jane Doe'))
    assert.ok(line.includes('1200x800'))
    assert.ok(line.includes('https://example.org/full.jpg'))
  })

  it('renders the full outcome text with a header', () => {
    const text = renderOutcomeText(sampleOutcome)
    assert.ok(text.startsWith('Found 42 reference images for "minimalist interior" on openverse'))
    assert.ok(text.includes('1. Minimal room'))
  })
})
