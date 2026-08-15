import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extensionFor, safeFileName } from '../src/routes.ts'

describe('route helpers', () => {
  it('sanitizes file names', () => {
    assert.equal(safeFileName('  A/B:C*D?"E  ', 'fallback'), 'A B C D E')
    assert.equal(safeFileName('', 'fallback'), 'fallback')
    assert.equal(safeFileName('   ', 'fallback'), 'fallback')
    const long = safeFileName('x'.repeat(200), 'f')
    assert.equal(long.length, 80)
  })

  it('derives extensions from urls and content types', () => {
    assert.equal(extensionFor('https://a.b/c/photo.jpg?w=1', 'image/jpeg'), '.jpg')
    assert.equal(extensionFor('https://a.b/c/image.JPEG', null), '.jpg')
    assert.equal(extensionFor('https://a.b/c/shot.png', null), '.png')
    assert.equal(extensionFor('https://a.b/c/noext', 'image/webp'), '.webp')
    assert.equal(extensionFor('https://a.b/c/noext', 'image/jpeg'), '.jpg')
    assert.equal(extensionFor('https://a.b/c/noext', null), '.img')
  })
})
