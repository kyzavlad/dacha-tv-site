import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseImageMetadata, buildImageMetadata, resolveImageEntries, primaryImageAlt,
} from '../lib/catalog/image-metadata.ts'

test('parseImageMetadata: JSON string, array, garbage', () => {
  assert.deepEqual(parseImageMetadata(''), [])
  assert.deepEqual(parseImageMetadata(null), [])
  assert.deepEqual(parseImageMetadata('not json'), [])
  assert.deepEqual(parseImageMetadata('{}'), []) // object, not array
  const meta = parseImageMetadata(JSON.stringify([
    { url: 'b.jpg', alt: 'B', position: 1, isPrimary: false },
    { url: 'a.jpg', alt: 'A', position: 0, isPrimary: true },
  ]))
  assert.equal(meta.length, 2)
  assert.equal(meta[0].url, 'a.jpg') // sorted by position
  assert.equal(meta[0].isPrimary, true)
})

test('parseImageMetadata dedupes by url and re-numbers positions', () => {
  const meta = parseImageMetadata([
    { url: 'a.jpg', alt: 'A', position: 0, isPrimary: true },
    { url: 'a.jpg', alt: 'dupe', position: 1, isPrimary: false },
    { url: 'b.jpg', alt: 'B', position: 2, isPrimary: false },
  ])
  assert.equal(meta.length, 2)
  assert.deepEqual(meta.map((m) => m.position), [0, 1])
})

test('parseImageMetadata drops entries without a url and forces one primary', () => {
  const meta = parseImageMetadata([
    { alt: 'no url' },
    { url: 'a.jpg', alt: 'A' },
    { url: 'b.jpg', alt: 'B' },
  ])
  assert.equal(meta.length, 2)
  assert.equal(meta.filter((m) => m.isPrimary).length, 1)
  assert.equal(meta[0].isPrimary, true) // first when none flagged
})

test('buildImageMetadata: primary first, alt fallback, dedupe', () => {
  const meta = buildImageMetadata(['a.jpg', 'b.jpg', 'a.jpg'], { 'a.jpg': 'Alt A' }, 'Product')
  assert.equal(meta.length, 2)
  assert.deepEqual(meta[0], { url: 'a.jpg', alt: 'Alt A', position: 0, isPrimary: true })
  assert.deepEqual(meta[1], { url: 'b.jpg', alt: 'Product', position: 1, isPrimary: false })
})

test('resolveImageEntries prefers image_metadata, fills empty alt from fallback', () => {
  const entries = resolveImageEntries({
    imageMetadata: [{ url: 'a.jpg', alt: '', position: 0, isPrimary: true }],
    urls: ['a.jpg'],
    mainImageAlt: 'Main alt',
    fallbackAlt: 'Name',
  })
  assert.equal(entries[0].alt, 'Main alt') // empty own alt → main_image_alt
})

test('resolveImageEntries derives from urls when no metadata (legacy rows)', () => {
  const entries = resolveImageEntries({
    imageMetadata: null,
    urls: ['a.jpg', 'b.jpg'],
    mainImageAlt: null,
    fallbackAlt: 'Мед',
  })
  assert.equal(entries.length, 2)
  assert.equal(entries[0].alt, 'Мед') // falls back to localized name
  assert.equal(entries[0].isPrimary, true)
})

test('primaryImageAlt: own → main_image_alt → name fallback', () => {
  assert.equal(primaryImageAlt({ imageMetadata: [{ url: 'a.jpg', alt: 'Own', isPrimary: true }], fallbackAlt: 'N' }), 'Own')
  assert.equal(primaryImageAlt({ imageMetadata: null, mainImageAlt: 'Main', fallbackAlt: 'N' }), 'Main')
  assert.equal(primaryImageAlt({ imageMetadata: null, mainImageAlt: null, fallbackAlt: 'N' }), 'N')
})
