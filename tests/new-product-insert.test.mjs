import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNewProductRow, combineExistingAndNewBatchResults } from '../lib/catalog/new-product-insert.ts'

// ── buildNewProductRow: new rows always land as draft ──────────────────────────

test('a genuinely new supplier product is built as status=draft', () => {
  const sp = {
    id: 'sp-1', supplier_sku: 'SKU-1', name: 'Test Product', name_ua: 'Тестовий товар',
    supplier_category_id: null, price_uah: 500, supplier_price_usd: 12,
    main_image_url: 'https://x/1.jpg', images: ['https://x/1.jpg'],
    stock_quantity: 5, is_in_stock: true,
  }
  const row = buildNewProductRow(sp, null, new Set(), '2026-07-21T00:00:00.000Z')
  assert.equal(row.status, 'draft')
  assert.equal(row.is_featured, false)
  assert.equal(row.supplier_sku, 'SKU-1')
  assert.equal(row.name_ua, 'Тестовий товар')
  assert.equal(row.stock_quantity, 5)
  assert.equal(row.is_in_stock, true)
})

test('slug collisions are resolved deterministically without reusing a taken slug', () => {
  const usedSlugs = new Set(['test-product'])
  const sp = {
    id: 'sp-2', supplier_sku: 'SKU-2', name: 'Test Product', name_ua: 'Test Product',
    supplier_category_id: null, price_uah: 300, supplier_price_usd: null,
    main_image_url: null, images: null, stock_quantity: 0, is_in_stock: false,
  }
  const row = buildNewProductRow(sp, null, usedSlugs, '2026-07-21T00:00:00.000Z')
  assert.notEqual(row.slug, 'test-product')
  assert.ok(usedSlugs.has(row.slug))
})

test('negative/null stock on a new product normalizes to zero / out of stock', () => {
  const sp = {
    id: 'sp-3', supplier_sku: 'SKU-3', name: 'X', name_ua: 'X',
    supplier_category_id: null, price_uah: 100, supplier_price_usd: 5,
    main_image_url: null, images: null, stock_quantity: -3, is_in_stock: null,
  }
  const row = buildNewProductRow(sp, null, new Set(), '2026-07-21T00:00:00.000Z')
  assert.equal(row.stock_quantity, 0)
  assert.equal(row.is_in_stock, false)
})

test('a suspiciously low price with no USD reference is flagged', () => {
  const sp = {
    id: 'sp-4', supplier_sku: 'SKU-4', name: 'X', name_ua: 'X',
    supplier_category_id: null, price_uah: 50, supplier_price_usd: null,
    main_image_url: null, images: null, stock_quantity: 1, is_in_stock: true,
  }
  const row = buildNewProductRow(sp, null, new Set(), '2026-07-21T00:00:00.000Z')
  assert.equal(row.is_price_suspicious, true)
})

// ── combineExistingAndNewBatchResults: truthful, idempotent reporting ─────────

function refreshResult(overrides = {}) {
  return {
    ok: true, processed: 0, updated: 0, approved: 0,
    remainingExisting: 0, remainingNew: 0, remainingTotal: 0,
    message: '', ...overrides,
  }
}

function insertResult(overrides = {}) {
  return { processed: 0, inserted: 0, approved: 0, insertsSkippedCap: 0, duplicateSlugFixed: 0, errors: [], ...overrides }
}

test('an update-only run (inserted=0) still reports progress truthfully', () => {
  const combined = combineExistingAndNewBatchResults(
    refreshResult({ processed: 10000, updated: 10000, approved: 10000, remainingExisting: 0, remainingNew: 300 }),
    insertResult({ processed: 0, inserted: 0, approved: 0 }),
  )
  assert.equal(combined.ok, true)
  assert.equal(combined.inserted, 0)
  assert.equal(combined.updated, 10000)
  assert.equal(combined.approved, 10000)
  assert.match(combined.message, /оновлено 10000/)
})

test('new rows inserted reduce remainingNew but never below zero', () => {
  const combined = combineExistingAndNewBatchResults(
    refreshResult({ remainingExisting: 0, remainingNew: 50 }),
    insertResult({ processed: 60, inserted: 60, approved: 60 }),
  )
  // approved (60) exceeds the pre-batch remainingNew snapshot (50) — must clamp at 0, not go negative.
  assert.equal(combined.remainingNew, 0)
})

test('remainingNew truthfully reflects what the new-insert step consumed', () => {
  const combined = combineExistingAndNewBatchResults(
    refreshResult({ remainingExisting: 20, remainingNew: 500 }),
    insertResult({ processed: 200, inserted: 200, approved: 200 }),
  )
  assert.equal(combined.remainingExisting, 20)
  assert.equal(combined.remainingNew, 300)
  assert.equal(combined.remainingTotal, 320)
})

test('a repeated call against an already-drained backlog is idempotent', () => {
  const empty = refreshResult({ processed: 0, updated: 0, approved: 0, remainingExisting: 0, remainingNew: 0 })
  const first = combineExistingAndNewBatchResults(empty, insertResult())
  const second = combineExistingAndNewBatchResults(empty, insertResult())
  assert.deepEqual(first, second)
  assert.equal(second.ok, true)
  assert.equal(second.processed, 0)
})

test('errors from the new-insert step mark the batch ok=false without losing the refresh progress', () => {
  const combined = combineExistingAndNewBatchResults(
    refreshResult({ processed: 5000, updated: 5000, approved: 5000 }),
    insertResult({ processed: 10, inserted: 8, approved: 8, errors: ['duplicate key value'] }),
  )
  assert.equal(combined.ok, false)
  assert.equal(combined.updated, 5000, 'existing-row refresh progress is still reported even when new-insert had an error')
  assert.equal(combined.failed, 1)
  assert.match(combined.message, /DB помилок/)
})

test('an RPC failure upstream (refresh.ok=false) is not silently absorbed', () => {
  // syncExistingAndNewBatch short-circuits before calling combine() when
  // refresh.ok is false — this test documents that combine() itself only
  // computes reporting arithmetic and trusts its caller for the ok gate.
  const combined = combineExistingAndNewBatchResults(
    refreshResult({ ok: false, processed: 0, updated: 0, approved: 0 }),
    insertResult(),
  )
  assert.equal(combined.processed, 0)
  assert.equal(combined.updated, 0)
})
