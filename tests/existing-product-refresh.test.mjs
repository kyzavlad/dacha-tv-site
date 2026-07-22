import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampRefreshLimit,
  refreshExistingCatalogFromSupplier,
  simulateExistingRowRefresh,
  MIN_REFRESH_LIMIT,
  MAX_REFRESH_LIMIT,
} from '../lib/catalog/existing-product-refresh.ts'

// ── clampRefreshLimit ──────────────────────────────────────────────────────────

test('clampRefreshLimit caps p_limit to the safe 1..10000 range', () => {
  assert.equal(clampRefreshLimit(0), MIN_REFRESH_LIMIT)
  assert.equal(clampRefreshLimit(-50), MIN_REFRESH_LIMIT)
  assert.equal(clampRefreshLimit(1), 1)
  assert.equal(clampRefreshLimit(10000), MAX_REFRESH_LIMIT)
  assert.equal(clampRefreshLimit(50000), MAX_REFRESH_LIMIT)
  assert.equal(clampRefreshLimit(NaN), MIN_REFRESH_LIMIT)
})

// ── refreshExistingCatalogFromSupplier: one RPC call, never per-SKU updates ───

function mockClient(rpcImpl) {
  return {
    rpc: rpcImpl,
    // If the refresh path ever calls `.from(...)` directly, that would mean it
    // regressed to per-row UPDATEs instead of the set-based RPC — fail loudly.
    from() {
      throw new Error('refreshExistingCatalogFromSupplier must never call .from() directly — it should only call .rpc()')
    },
  }
}

test('a 10,000-row existing-product refresh calls the RPC exactly once, not per-SKU', async () => {
  let calls = 0
  let capturedArgs = null
  const client = mockClient((fn, args) => {
    calls++
    capturedArgs = args
    return Promise.resolve({
      data: [{ processed: 10000, updated: 10000, approved: 10000, remaining_existing: 0, remaining_new: 300, remaining_total: 300 }],
      error: null,
    })
  })

  const result = await refreshExistingCatalogFromSupplier(client, 10000)

  assert.equal(calls, 1, 'the RPC must be called exactly once regardless of batch size')
  assert.deepEqual(capturedArgs, { p_limit: 10000 })
  assert.equal(result.ok, true)
  assert.equal(result.processed, 10000)
  assert.equal(result.updated, 10000)
  assert.equal(result.approved, 10000)
  assert.equal(result.remainingExisting, 0)
  assert.equal(result.remainingNew, 300)
  assert.equal(result.remainingTotal, 300)
})

test('the RPC is called with the function name refresh_existing_catalog_from_supplier', async () => {
  let fnName = null
  const client = mockClient((fn) => {
    fnName = fn
    return Promise.resolve({ data: [{ processed: 0, updated: 0, approved: 0, remaining_existing: 0, remaining_new: 0, remaining_total: 0 }], error: null })
  })
  await refreshExistingCatalogFromSupplier(client, 100)
  assert.equal(fnName, 'refresh_existing_catalog_from_supplier')
})

test('RPC error returns ok=false without throwing, and reports zero progress', async () => {
  const client = mockClient(() => Promise.resolve({ data: null, error: { message: 'timeout' } }))
  const result = await refreshExistingCatalogFromSupplier(client, 5000)
  assert.equal(result.ok, false)
  assert.equal(result.processed, 0)
  assert.equal(result.updated, 0)
  assert.equal(result.approved, 0)
  assert.match(result.message, /timeout/)
})

test('a repeated call after the backlog is drained is idempotent (no error, zero work)', async () => {
  const client = mockClient(() => Promise.resolve({
    data: [{ processed: 0, updated: 0, approved: 0, remaining_existing: 0, remaining_new: 12, remaining_total: 12 }],
    error: null,
  }))
  const first = await refreshExistingCatalogFromSupplier(client, 1000)
  const second = await refreshExistingCatalogFromSupplier(client, 1000)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(second.processed, 0)
  assert.equal(second.updated, 0)
  assert.equal(second.approved, 0)
})

test('limit passed to the RPC is clamped before being sent', async () => {
  let capturedArgs = null
  const client = mockClient((fn, args) => {
    capturedArgs = args
    return Promise.resolve({ data: [{ processed: 0, updated: 0, approved: 0, remaining_existing: 0, remaining_new: 0, remaining_total: 0 }], error: null })
  })
  await refreshExistingCatalogFromSupplier(client, 999999)
  assert.deepEqual(capturedArgs, { p_limit: MAX_REFRESH_LIMIT })
})

test('a missing RPC result (empty array, no error) returns ok=false, not a silent zero-success', async () => {
  const client = mockClient(() => Promise.resolve({ data: [], error: null }))
  const result = await refreshExistingCatalogFromSupplier(client, 1000)
  assert.equal(result.ok, false)
  assert.match(result.message, /no result row/)
})

test('a missing RPC result (null data, no error) returns ok=false', async () => {
  const client = mockClient(() => Promise.resolve({ data: null, error: null }))
  const result = await refreshExistingCatalogFromSupplier(client, 1000)
  assert.equal(result.ok, false)
  assert.match(result.message, /no result row/)
})

test('blockedManual is passed through from the RPC row', async () => {
  const client = mockClient(() => Promise.resolve({
    data: [{ processed: 100, updated: 100, approved: 100, remaining_existing: 0, remaining_new: 0, remaining_total: 0, blocked_manual: 37 }],
    error: null,
  }))
  const result = await refreshExistingCatalogFromSupplier(client, 1000)
  assert.equal(result.ok, true)
  assert.equal(result.blockedManual, 37)
})

test('only manual-shadow rows remaining is reported via blockedManual, not folded into remainingTotal', async () => {
  const client = mockClient(() => Promise.resolve({
    data: [{ processed: 0, updated: 0, approved: 0, remaining_existing: 0, remaining_new: 0, remaining_total: 0, blocked_manual: 250 }],
    error: null,
  }))
  const result = await refreshExistingCatalogFromSupplier(client, 1000)
  assert.equal(result.remainingTotal, 0, 'remaining must reach zero once no actionable work is left')
  assert.equal(result.blockedManual, 250)
})

// ── simulateExistingRowRefresh: pure mirror of the SQL CASE logic ──────────────

const current = { priceUah: 100, mainImageUrl: 'https://x/old.jpg', images: ['https://x/old.jpg'] }
const supplierFacts = { priceUah: 250, mainImageUrl: 'https://x/new.jpg', images: ['https://x/new.jpg'], stockQuantity: 7, isInStock: true }

test('manual rows are excluded entirely — never refreshed', () => {
  const outcome = simulateExistingRowRefresh(current, { source: 'manual', priceManualLock: false, imageManualLock: false }, supplierFacts)
  assert.equal(outcome, null)
})

test('metal rows are excluded the same way as any other source=manual row', () => {
  const outcome = simulateExistingRowRefresh(current, { source: 'manual', priceManualLock: true, imageManualLock: true }, supplierFacts)
  assert.equal(outcome, null)
})

test('an unlocked supplier row refreshes price and images', () => {
  const outcome = simulateExistingRowRefresh(current, { source: 'supplier', priceManualLock: false, imageManualLock: false }, supplierFacts)
  assert.equal(outcome.priceUah, 250)
  assert.equal(outcome.mainImageUrl, 'https://x/new.jpg')
  assert.deepEqual(outcome.images, ['https://x/new.jpg'])
})

test('price_manual_lock preserves the current price but images still refresh', () => {
  const outcome = simulateExistingRowRefresh(current, { source: 'supplier', priceManualLock: true, imageManualLock: false }, supplierFacts)
  assert.equal(outcome.priceUah, 100, 'locked price must be preserved')
  assert.equal(outcome.mainImageUrl, 'https://x/new.jpg')
})

test('image_manual_lock preserves current imagery but price still refreshes', () => {
  const outcome = simulateExistingRowRefresh(current, { source: 'supplier', priceManualLock: false, imageManualLock: true }, supplierFacts)
  assert.equal(outcome.priceUah, 250)
  assert.equal(outcome.mainImageUrl, 'https://x/old.jpg', 'locked image must be preserved')
  assert.deepEqual(outcome.images, ['https://x/old.jpg'])
})

test('stock refreshes even when BOTH price and image are locked', () => {
  const outcome = simulateExistingRowRefresh(current, { source: 'supplier', priceManualLock: true, imageManualLock: true }, supplierFacts)
  assert.equal(outcome.priceUah, 100)
  assert.equal(outcome.mainImageUrl, 'https://x/old.jpg')
  assert.equal(outcome.stockQuantity, 7)
  assert.equal(outcome.isInStock, true)
})

test('negative/null supplier stock normalizes to zero and out-of-stock', () => {
  const outcome1 = simulateExistingRowRefresh(current, { source: 'supplier', priceManualLock: false, imageManualLock: false }, { ...supplierFacts, stockQuantity: -5, isInStock: null })
  assert.equal(outcome1.stockQuantity, 0)
  assert.equal(outcome1.isInStock, false)

  const outcome2 = simulateExistingRowRefresh(current, { source: 'supplier', priceManualLock: false, imageManualLock: false }, { ...supplierFacts, stockQuantity: null, isInStock: null })
  assert.equal(outcome2.stockQuantity, 0)
  assert.equal(outcome2.isInStock, false)
})

test('is_in_stock is true when quantity > 0 OR the supplier flag is true', () => {
  const zeroQtyButFlagged = simulateExistingRowRefresh(current, { source: 'supplier', priceManualLock: false, imageManualLock: false }, { ...supplierFacts, stockQuantity: 0, isInStock: true })
  assert.equal(zeroQtyButFlagged.stockQuantity, 0)
  assert.equal(zeroQtyButFlagged.isInStock, true, 'supplier flag=true keeps a 0-qty row in stock')

  const zeroQtyNotFlagged = simulateExistingRowRefresh(current, { source: 'supplier', priceManualLock: false, imageManualLock: false }, { ...supplierFacts, stockQuantity: 0, isInStock: false })
  assert.equal(zeroQtyNotFlagged.isInStock, false)
})

test('zero/negative supplier price never overwrites the current price', () => {
  const outcome = simulateExistingRowRefresh(current, { source: 'supplier', priceManualLock: false, imageManualLock: false }, { ...supplierFacts, priceUah: 0 })
  assert.equal(outcome.priceUah, 100, 'current price is preserved when supplier price is not positive')
})
