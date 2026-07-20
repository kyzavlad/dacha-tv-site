import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchRows, planFills, dedupeMedia, streamCompare, keysOf, chunk,
  LEGACY_PAGE_SIZE, CURRENT_KEY_CHUNK,
} from '../scripts/legacy/lib.ts'

test('matchRows matches by stable id first, then slug', () => {
  const legacy = [
    { id: 'A', slug: 'honey-1', description: 'L1' },
    { id: 'X', slug: 'honey-2', description: 'L2' }, // id absent in current → matches by slug
    { id: 'Z', slug: 'gone', description: 'L3' },    // no match
  ]
  const current = [
    { id: 'A', slug: 'honey-1-renamed', description: '' },
    { id: 'B', slug: 'honey-2', description: '' },
  ]
  const r = matchRows(legacy, current, ['id', 'slug'])
  assert.equal(r.matched.length, 2)
  assert.equal(r.matched.find((m) => m.legacy.id === 'A').key, 'id')
  assert.equal(r.matched.find((m) => m.legacy.id === 'X').key, 'slug')
  assert.equal(r.legacyOnly.length, 1)
  assert.equal(r.legacyOnly[0].id, 'Z')
})

test('matchRows flags ambiguous when a key maps to >1 current row', () => {
  const legacy = [{ id: 'A', slug: 'dup' }]
  const current = [{ id: 'B', slug: 'dup' }, { id: 'C', slug: 'dup' }]
  const r = matchRows(legacy, current, ['id', 'slug'])
  assert.equal(r.ambiguous.length, 1)
  assert.equal(r.matched.length, 0)
})

test('planFills fills only fields empty in current, deduping media arrays', () => {
  const cfg = {
    table: 't', label: 't', matchKeys: ['id'],
    fillFields: ['description', 'image_url', 'gallery_images'],
    mediaFields: ['image_url'], arrayMediaFields: ['gallery_images'],
    restoreMissing: false, note: '',
  }
  const legacy = { description: 'legacy desc', image_url: 'https://x/a.jpg', gallery_images: ['https://x/1.jpg', 'https://x/1.jpg', 'https://x/2.jpg'] }
  const current = { description: 'KEEP ME', image_url: '', gallery_images: [] }
  const present = new Set(['description', 'image_url', 'gallery_images'])
  const { fills, values } = planFills(cfg, legacy, current, present)
  const fields = fills.map((f) => f.field).sort()
  assert.deepEqual(fields, ['gallery_images', 'image_url']) // description kept (non-empty)
  assert.deepEqual(values.gallery_images, ['https://x/1.jpg', 'https://x/2.jpg']) // deduped
})

test('dedupeMedia removes duplicate and empty urls', () => {
  assert.deepEqual(dedupeMedia(['a', 'a', '', 'b', '  ']), ['a', 'b'])
  assert.deepEqual(dedupeMedia('single'), ['single'])
  assert.deepEqual(dedupeMedia(null), [])
})

test('planFills lets legacy content replace a generated-fallback description', () => {
  const cfg = {
    table: 'catalog_categories', label: 'c', matchKeys: ['id'],
    fillFields: ['description'], mediaFields: [], arrayMediaFields: [], restoreMissing: false, note: '',
  }
  const legacy = { description: 'Real legacy intro text.' }
  const current = { description: 'Товари категорії «X» у наявності.', description_auto_generated: true }
  const present = new Set(['description'])
  const { fills } = planFills(cfg, legacy, current, present)
  assert.equal(fills.length, 1)
  assert.equal(fills[0].field, 'description')
})

test('planFills does NOT replace a hand-written (non-generated) non-empty description', () => {
  const cfg = {
    table: 'catalog_categories', label: 'c', matchKeys: ['id'],
    fillFields: ['description'], mediaFields: [], arrayMediaFields: [], restoreMissing: false, note: '',
  }
  const legacy = { description: 'Real legacy intro text.' }
  const current = { description: 'Hand-written by admin.', description_auto_generated: false }
  const present = new Set(['description'])
  const { fills } = planFills(cfg, legacy, current, present)
  assert.equal(fills.length, 0)
})

// ── Egress safety: bounded pages, keyed current lookups, no full-table load ───

const CFG = {
  table: 'catalog_products', label: 'c', matchKeys: ['id', 'slug'],
  fillFields: ['description'], mediaFields: [], arrayMediaFields: [], restoreMissing: false, note: '',
}

// Simulates a 105k-row legacy table WITHOUT ever materializing it — rows are
// synthesized on demand per requested page, exactly like a real bounded query.
function fakeLegacyTable(totalRows) {
  return async (from, size) => {
    if (from >= totalRows) return []
    const end = Math.min(from + size, totalRows)
    const rows = []
    for (let i = from; i < end; i++) rows.push({ id: `id-${i}`, slug: `slug-${i}`, description: `legacy ${i}` })
    return rows
  }
}

test('streamCompare never requests a page larger than 500 rows', async () => {
  const pageLegacy = fakeLegacyTable(1200)
  const seenSizes = []
  await streamCompare(CFG, {
    pageLegacy: async (from, size) => { seenSizes.push(size); return pageLegacy(from, size) },
    fetchCurrentByKeys: async () => [],
  }, { onMatched() {}, onLegacyOnly() {}, onAmbiguous() {} }, 300)
  assert.ok(seenSizes.every((s) => s <= 500), `saw a page size > 500: ${Math.max(...seenSizes)}`)
  assert.ok(seenSizes.every((s) => s === 300), 'every page request used the configured bounded size')
})

test('streamCompare rejects a page size outside the 1..500 bound', async () => {
  await assert.rejects(
    () => streamCompare(CFG, { pageLegacy: async () => [], fetchCurrentByKeys: async () => [] }, { onMatched() {}, onLegacyOnly() {}, onAmbiguous() {} }, 501),
    /out of bounds/,
  )
  await assert.rejects(
    () => streamCompare(CFG, { pageLegacy: async () => [], fetchCurrentByKeys: async () => [] }, { onMatched() {}, onLegacyOnly() {}, onAmbiguous() {} }, 0),
    /out of bounds/,
  )
})

test('streamCompare over a simulated 105k-row table: current is queried ONLY by that page\'s keys, never the whole table', async () => {
  const TOTAL = 105_000
  const pageLegacy = fakeLegacyTable(TOTAL)
  let maxKeysPerCall = 0
  let totalCurrentCalls = 0
  let legacyRowsSeenAtOnce = 0 // the largest single page array handed to us at once
  await streamCompare(CFG, {
    pageLegacy: async (from, size) => {
      const page = await pageLegacy(from, size)
      legacyRowsSeenAtOnce = Math.max(legacyRowsSeenAtOnce, page.length)
      return page
    },
    fetchCurrentByKeys: async (keys) => {
      totalCurrentCalls++
      const n = keys.ids.length + keys.slugs.length
      maxKeysPerCall = Math.max(maxKeysPerCall, n)
      // A real implementation would further chunk this by CURRENT_KEY_CHUNK; the
      // point proven here is the ORCHESTRATOR never asks for more than one
      // legacy page's worth of keys — never all 105k rows' keys in one shot.
      return []
    },
  }, { onMatched() {}, onLegacyOnly() {}, onAmbiguous() {} }, LEGACY_PAGE_SIZE)

  assert.equal(legacyRowsSeenAtOnce <= LEGACY_PAGE_SIZE, true, 'a legacy page never exceeded the bounded page size')
  assert.equal(maxKeysPerCall <= LEGACY_PAGE_SIZE * 2, true, 'current was never queried with more keys than one bounded page can produce')
  assert.equal(totalCurrentCalls, Math.ceil(TOTAL / LEGACY_PAGE_SIZE), 'current was queried once per bounded page, not once for the whole table')
  // The strongest guarantee: no single call transferred anywhere close to the
  // full 105k rows — proving no unbounded readAll of catalog_products occurred.
  assert.ok(legacyRowsSeenAtOnce < TOTAL / 100)
})

test('keysOf bounds the key set to exactly one page\'s rows', () => {
  const rows = Array.from({ length: 300 }, (_, i) => ({ id: `id-${i}`, slug: `slug-${i}` }))
  const keys = keysOf(rows, ['id', 'slug'])
  assert.equal(keys.ids.length, 300)
  assert.equal(keys.slugs.length, 300)
})

test('chunk() splits a key list into CURRENT_KEY_CHUNK-sized (or smaller) groups', () => {
  const values = Array.from({ length: 950 }, (_, i) => `v${i}`)
  const parts = chunk(values, CURRENT_KEY_CHUNK)
  assert.equal(parts.length, Math.ceil(950 / CURRENT_KEY_CHUNK))
  assert.ok(parts.every((p) => p.length <= CURRENT_KEY_CHUNK))
  assert.equal(parts.flat().length, 950)
})
