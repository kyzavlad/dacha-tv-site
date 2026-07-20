import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSupplierUpdatePayload, planGuardedWrites, wouldGuardedWriteApply } from '../lib/catalog/field-ownership.ts'

const facts = { price_uah: 250, main_image_url: 'https://x/img.jpg', images: ['https://x/1.jpg'] }

test('manual rows are never touched by the supplier import', () => {
  assert.equal(buildSupplierUpdatePayload(facts, { source: 'manual' }), null)
})

test('unlocked supplier row refreshes price and images', () => {
  const p = buildSupplierUpdatePayload(facts, { source: 'supplier' })
  assert.deepEqual(p, { price_uah: 250, main_image_url: 'https://x/img.jpg', images: ['https://x/1.jpg'] })
})

test('price_manual_lock preserves the manual price but still refreshes images', () => {
  const p = buildSupplierUpdatePayload(facts, { source: 'supplier', price_manual_lock: true })
  assert.equal(p.price_uah, undefined)
  assert.equal(p.main_image_url, 'https://x/img.jpg')
})

test('image_manual_lock preserves manual imagery but still refreshes price', () => {
  const p = buildSupplierUpdatePayload(facts, { source: 'supplier', image_manual_lock: true })
  assert.equal(p.price_uah, 250)
  assert.equal(p.main_image_url, undefined)
  assert.equal(p.images, undefined)
})

test('both locks → nothing to write → null (no round-trip)', () => {
  const p = buildSupplierUpdatePayload(facts, { source: 'supplier', price_manual_lock: true, image_manual_lock: true })
  assert.equal(p, null)
})

test('zero/negative supplier price is not written', () => {
  const p = buildSupplierUpdatePayload({ price_uah: 0, main_image_url: 'https://x/i.jpg', images: null }, { source: 'supplier' })
  assert.equal(p.price_uah, undefined)
  assert.equal(p.main_image_url, 'https://x/i.jpg')
})

// ── planGuardedWrites: price and image are independently guarded writes ───────

test('planGuardedWrites splits price and image into separate guarded writes', () => {
  const writes = planGuardedWrites({ price_uah: 100, main_image_url: 'https://x/a.jpg', images: ['https://x/a.jpg'] })
  assert.equal(writes.length, 2)
  assert.deepEqual(writes.find((w) => w.guardColumn === 'price_manual_lock').columns, { price_uah: 100 })
  assert.deepEqual(writes.find((w) => w.guardColumn === 'image_manual_lock').columns, { main_image_url: 'https://x/a.jpg', images: ['https://x/a.jpg'] })
})

test('planGuardedWrites omits a write with nothing to set', () => {
  assert.deepEqual(planGuardedWrites({ price_uah: 100 }), [{ columns: { price_uah: 100 }, guardColumn: 'price_manual_lock' }])
  assert.deepEqual(planGuardedWrites({}), [])
})

// ── Concurrency: a lock (or source) flipped AFTER candidate selection but ─────
// BEFORE the write must still be honored. wouldGuardedWriteApply simulates the
// production UPDATE's WHERE clause against the row's state AT WRITE TIME.

test('concurrency: price lock enabled after selection blocks the price write', () => {
  const payload = buildSupplierUpdatePayload(facts, { source: 'supplier', price_manual_lock: false }) // selected unlocked
  const [priceWrite] = planGuardedWrites(payload)
  // ...but by write time an admin locked the price.
  assert.equal(wouldGuardedWriteApply(priceWrite, { source: 'supplier', price_manual_lock: true }), false)
})

test('concurrency: image lock enabled after selection blocks only the image write', () => {
  const payload = buildSupplierUpdatePayload(facts, { source: 'supplier' })
  const writes = planGuardedWrites(payload)
  const priceWrite = writes.find((w) => w.guardColumn === 'price_manual_lock')
  const imageWrite = writes.find((w) => w.guardColumn === 'image_manual_lock')
  const rowAtWriteTime = { source: 'supplier', price_manual_lock: false, image_manual_lock: true }
  assert.equal(wouldGuardedWriteApply(priceWrite, rowAtWriteTime), true)
  assert.equal(wouldGuardedWriteApply(imageWrite, rowAtWriteTime), false)
})

test('concurrency: row converted to source=manual after selection blocks every write', () => {
  const payload = buildSupplierUpdatePayload(facts, { source: 'supplier' })
  const writes = planGuardedWrites(payload)
  for (const w of writes) {
    assert.equal(wouldGuardedWriteApply(w, { source: 'manual', price_manual_lock: false, image_manual_lock: false }), false)
  }
})

test('concurrency: unchanged unlocked row still applies both writes', () => {
  const payload = buildSupplierUpdatePayload(facts, { source: 'supplier' })
  const writes = planGuardedWrites(payload)
  for (const w of writes) {
    assert.equal(wouldGuardedWriteApply(w, { source: 'supplier', price_manual_lock: false, image_manual_lock: false }), true)
  }
})
