import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeStock, stockStatus, stockLabel, isPurchasableForStock } from '../lib/catalog/stock.ts'
import {
  buildSupplierUpdatePayload, planGuardedWrites, wouldGuardedWriteApply,
} from '../lib/catalog/field-ownership.ts'

test('normalizeStock never returns negative or NaN', () => {
  assert.deepEqual(normalizeStock(-5), { stock_quantity: 0, is_in_stock: false })
  assert.deepEqual(normalizeStock('abc'), { stock_quantity: 0, is_in_stock: false })
  assert.deepEqual(normalizeStock(null), { stock_quantity: 0, is_in_stock: false })
  assert.deepEqual(normalizeStock(undefined), { stock_quantity: 0, is_in_stock: false })
  assert.deepEqual(normalizeStock(3.7), { stock_quantity: 4, is_in_stock: true })
})

test('normalizeStock: supplier flag can keep a 0-qty row in stock', () => {
  assert.deepEqual(normalizeStock(0, true), { stock_quantity: 0, is_in_stock: true })
  assert.deepEqual(normalizeStock(0, false), { stock_quantity: 0, is_in_stock: false })
  // Positive quantity always wins regardless of a falsey flag.
  assert.deepEqual(normalizeStock(5, false), { stock_quantity: 5, is_in_stock: true })
})

test('stockStatus: manual/metal rows are always unknown', () => {
  assert.equal(stockStatus({ source: 'manual', lead_type: 'metal', is_in_stock: false, stock_synced_at: '2026-07-20' }), 'unknown')
  assert.equal(stockStatus({ source: 'manual', lead_type: 'natural_products', is_in_stock: true }), 'unknown')
})

test('stockStatus: unsynced supplier row is unknown', () => {
  assert.equal(stockStatus({ source: 'supplier', is_in_stock: null, stock_synced_at: null }), 'unknown')
})

test('stockStatus: synced supplier row reflects is_in_stock', () => {
  assert.equal(stockStatus({ source: 'supplier', is_in_stock: true, stock_synced_at: '2026-07-20' }), 'in_stock')
  assert.equal(stockStatus({ source: 'supplier', is_in_stock: false, stock_synced_at: '2026-07-20' }), 'out_of_stock')
})

test('stockLabel is localized', () => {
  assert.equal(stockLabel('in_stock', 'uk'), 'В наявності')
  assert.equal(stockLabel('in_stock', 'ru'), 'В наличии')
  assert.equal(stockLabel('in_stock', 'en'), 'In stock')
  assert.equal(stockLabel('out_of_stock', 'uk'), 'Немає в наявності')
  assert.equal(stockLabel('unknown', 'en'), 'Check availability')
})

test('isPurchasableForStock blocks only synced out-of-stock supplier rows', () => {
  assert.equal(isPurchasableForStock({ source: 'supplier', is_in_stock: false, stock_synced_at: '2026-07-20' }), false)
  assert.equal(isPurchasableForStock({ source: 'supplier', is_in_stock: true, stock_synced_at: '2026-07-20' }), true)
  // Unknown (manual/metal or unsynced) is never blocked here.
  assert.equal(isPurchasableForStock({ source: 'manual', lead_type: 'metal' }), true)
  assert.equal(isPurchasableForStock({ source: 'supplier', is_in_stock: null, stock_synced_at: null }), true)
})

test('buildSupplierUpdatePayload propagates supplier stock for supplier rows', () => {
  const payload = buildSupplierUpdatePayload(
    { price_uah: 100, main_image_url: 'x.jpg', images: [], stock_quantity: 7, is_in_stock: true },
    { source: 'supplier', price_manual_lock: false, image_manual_lock: false },
  )
  assert.ok(payload)
  assert.equal(payload.stock_quantity, 7)
  assert.equal(payload.is_in_stock, true)
})

test('buildSupplierUpdatePayload never touches a manual row (incl. stock)', () => {
  const payload = buildSupplierUpdatePayload(
    { price_uah: 100, stock_quantity: 7, is_in_stock: true },
    { source: 'manual' },
  )
  assert.equal(payload, null)
})

test('buildSupplierUpdatePayload normalizes bad supplier stock to 0/out', () => {
  const payload = buildSupplierUpdatePayload(
    { stock_quantity: -3, is_in_stock: false },
    { source: 'supplier' },
  )
  assert.equal(payload.stock_quantity, 0)
  assert.equal(payload.is_in_stock, false)
})

test('planGuardedWrites emits an unguarded (null-guard) stock write', () => {
  const writes = planGuardedWrites({ price_uah: 50, stock_quantity: 4, is_in_stock: true })
  const stockWrite = writes.find((w) => w.guardColumn === null)
  assert.ok(stockWrite)
  assert.equal(stockWrite.columns.stock_quantity, 4)
  assert.equal(stockWrite.columns.is_in_stock, true)
})

test('wouldGuardedWriteApply: stock write applies to any non-manual row', () => {
  const [stockWrite] = planGuardedWrites({ stock_quantity: 1, is_in_stock: true })
  assert.equal(wouldGuardedWriteApply(stockWrite, { source: 'supplier' }), true)
  assert.equal(wouldGuardedWriteApply(stockWrite, { source: null }), true)
  // A row that flipped to manual after selection is still protected.
  assert.equal(wouldGuardedWriteApply(stockWrite, { source: 'manual' }), false)
})
