import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  refreshExistingCatalogFromSupplier,
  getRefreshQueueCounts,
  clampRefreshLimit,
} from '../lib/catalog/existing-product-refresh.ts'
import { combineExistingAndNewBatchResults } from '../lib/catalog/new-product-insert.ts'
import { EXISTING_REFRESH_BATCH_SIZE, NEW_PRODUCT_INSERT_BATCH_CAP } from '../lib/catalog/automation-config.ts'

// ── The v7 migration: static guarantees about the SQL, verified without a live
// Postgres (same pattern as tests/analytics-build-vars & supplier-category-sync).
const MIGRATION_PATH = new URL('../supabase/migrations/20260724000000_bounded_refresh_v7.sql', import.meta.url)
const migration = readFileSync(MIGRATION_PATH, 'utf8')

// Slice the migration into its two functions so assertions target the right one.
const hotStart = migration.indexOf('create or replace function public.refresh_existing_catalog_from_supplier')
const diagStart = migration.indexOf('create or replace function public.catalog_refresh_queue_counts')
assert.ok(hotStart >= 0, 'the hot refresh function must exist')
assert.ok(diagStart > hotStart, 'the diagnostic count function must exist, after the hot one')
const hotFn = migration.slice(hotStart, diagStart)
const diagFn = migration.slice(diagStart)

// ── Requirement 4 / 12: NO exact whole-queue COUNT scan in the hot path ───────

test('the hot refresh function performs NO exact whole-queue COUNT scan', () => {
  // The removed v6 code computed remaining_* via `count(*)::integer` over
  // `supplier_products sp join catalog_products cp ...` and a `not exists`
  // subquery. None of those may appear in the hot function anymore.
  assert.doesNotMatch(hotFn, /count\(\*\)::integer/, 'no exact-count-style scan in the hot path')
  assert.doesNotMatch(hotFn, /not exists\s*\(/i, 'the remaining_new NOT EXISTS scan must be gone from the hot path')
  // The remaining_* columns still exist in the signature but are returned NULL.
  assert.match(hotFn, /null::integer\s+as\s+remaining_existing/i)
  assert.match(hotFn, /null::integer\s+as\s+remaining_new/i)
  assert.match(hotFn, /null::integer\s+as\s+remaining_total/i)
  assert.match(hotFn, /null::integer\s+as\s+blocked_manual/i)
})

test('the ONLY counts remaining in the hot path are over the bounded temp tables, never the full queue', () => {
  // These three cheap counts are fine: they count the bounded candidate batch
  // and the two RETURNING temp tables — never supplier_products/catalog_products.
  assert.match(hotFn, /count\(\*\)\s+into\s+v_updated\s+from\s+_refreshed_ids/i)
  assert.match(hotFn, /count\(\*\)\s+into\s+v_approved\s+from\s+approved_rows/i)
  assert.match(hotFn, /\(select count\(\*\) from _refresh_candidates\)/i)
})

test('the exact queue counts live in a SEPARATE diagnostic function (requirement 6)', () => {
  assert.match(diagFn, /remaining_existing/)
  assert.match(diagFn, /remaining_new/)
  assert.match(diagFn, /blocked_manual/)
  assert.match(diagFn, /count\(\*\)::integer/, 'the diagnostic function is where the exact scans now live')
})

// ── Requirement 9: controlled statement + lock timeout ────────────────────────

test('the hot function sets a bounded statement_timeout and a short lock_timeout', () => {
  assert.match(hotFn, /set statement_timeout\s*=\s*'30s'/i)
  assert.match(hotFn, /set lock_timeout\s*=\s*'5s'/i)
})

test('the diagnostic function gets a larger statement_timeout (it does scan the full queue)', () => {
  assert.match(diagFn, /set statement_timeout\s*=\s*'120s'/i)
})

// ── Requirement 8: default batch raised to 5000; new inserts still capped 500 ──

test('the hot function default batch is 5000 and stays clamped to <= 10000', () => {
  assert.match(hotFn, /p_limit integer default 5000/i)
  assert.match(hotFn, /least\(coalesce\(p_limit, 5000\), 10000\)/i)
})

test('config exposes EXISTING_REFRESH_BATCH_SIZE=5000 and NEW_PRODUCT_INSERT_BATCH_CAP=500', () => {
  assert.equal(EXISTING_REFRESH_BATCH_SIZE, 5000)
  assert.equal(NEW_PRODUCT_INSERT_BATCH_CAP, 500)
})

// ── Requirement 3 / 12: locks + manual/metal exclusion preserved verbatim ─────

test('the hot function still honors price_manual_lock and image_manual_lock', () => {
  assert.match(hotFn, /when not c\.price_manual_lock and c\.sp_price_uah is not null and c\.sp_price_uah > 0/i)
  assert.match(hotFn, /main_image_url = case when not c\.image_manual_lock/i)
  assert.match(hotFn, /images\s+= case when not c\.image_manual_lock/i)
})

test('the hot function still refreshes stock for non-manual rows and excludes source=manual', () => {
  assert.match(hotFn, /stock_quantity = greatest\(0, coalesce\(c\.sp_stock_quantity, 0\)\)/i)
  assert.match(hotFn, /is_in_stock\s+= \(coalesce\(c\.sp_stock_quantity, 0\) > 0\) or \(c\.sp_is_in_stock is true\)/i)
  assert.match(hotFn, /coalesce\(cp\.source, 'supplier'\) <> 'manual'/i)
})

// ── Requirement 3 / 12: approve-by-UPDATE-RETURNING atomicity preserved ───────

test('approval is keyed STRICTLY off the UPDATE RETURNING set, not the candidate set', () => {
  // The refresh UPDATE returns the touched supplier ids into _refreshed_ids...
  assert.match(hotFn, /returning c\.supplier_id/i)
  // ...and approval reads FROM _refreshed_ids (the confirmed set), never _refresh_candidates.
  assert.match(hotFn, /update supplier_products sp\s+set is_approved = true\s+from _refreshed_ids r/i)
  assert.doesNotMatch(hotFn, /set is_approved = true\s+from _refresh_candidates/i)
  // SKIP LOCKED keeps concurrent calls safe.
  assert.match(hotFn, /for update of sp skip locked/i)
})

// ── Requirement 7: equality-join index on catalog_products(supplier_sku) ──────

test('the migration verifies/creates a btree index on catalog_products(supplier_sku)', () => {
  assert.match(migration, /pg_indexes/)
  assert.match(migration, /create index idx_catalog_products_supplier_sku on catalog_products \(supplier_sku\)/i)
  // It is guarded so it never duplicates the existing UNIQUE btree index.
  assert.match(migration, /if not exists\s*\(/i)
})

// ── Requirement 5 / 12: progress-based looping (hasMore), no exact counts ──────

function mockClient(rpcImpl) {
  return {
    rpc: rpcImpl,
    from() { throw new Error('the refresh path must only call .rpc(), never .from()') },
  }
}

// Fast-path row: remaining_* are NULL (v7). processed drives hasMore.
function fastRow(processed) {
  return { processed, updated: processed, approved: processed, remaining_existing: null, remaining_new: null, remaining_total: null, blocked_manual: null }
}

test('hasMore is true on a full batch (processed >= limit) and false on a partial one', async () => {
  const full = mockClient(() => Promise.resolve({ data: [fastRow(5000)], error: null }))
  const r1 = await refreshExistingCatalogFromSupplier(full, 5000)
  assert.equal(r1.ok, true)
  assert.equal(r1.hasMore, true, 'a full batch signals more work')
  // Exact counts are NOT reported on the fast path.
  assert.equal(r1.remainingExisting, undefined)
  assert.equal(r1.remainingTotal, undefined)

  const partial = mockClient(() => Promise.resolve({ data: [fastRow(1200)], error: null }))
  const r2 = await refreshExistingCatalogFromSupplier(partial, 5000)
  assert.equal(r2.hasMore, false, 'a partial batch drained the queue')
})

test('progress-based loop drains a queue and TERMINATES without any exact count', async () => {
  const LIMIT = 5000
  let queue = 5000 * 4 + 137 // 4 full batches + a partial
  const client = mockClient(() => {
    const processed = Math.min(LIMIT, queue)
    queue -= processed
    return Promise.resolve({ data: [fastRow(processed)], error: null })
  })

  let calls = 0
  let hasMore = true
  const MAX = 1000 // hard stop so a bug can't hang the test forever
  while (hasMore && calls < MAX) {
    const r = await refreshExistingCatalogFromSupplier(client, LIMIT)
    assert.equal(r.ok, true)
    hasMore = r.hasMore
    calls++
  }
  assert.equal(hasMore, false, 'the loop must terminate on its own (hasMore=false)')
  assert.equal(queue, 0, 'the whole queue was drained')
  assert.equal(calls, 5, 'ceil((4*5000+137)/5000) = 5 calls — bounded, not hundreds')
})

test('repeated calls against an already-drained queue are idempotent and terminate immediately', async () => {
  const client = mockClient(() => Promise.resolve({ data: [fastRow(0)], error: null }))
  const first = await refreshExistingCatalogFromSupplier(client, 5000)
  const second = await refreshExistingCatalogFromSupplier(client, 5000)
  assert.equal(first.hasMore, false)
  assert.equal(second.hasMore, false)
  assert.equal(second.processed, 0)
  assert.equal(second.approved, 0)
})

// ── Requirement 12: the exact production timeout returns a controlled error ────

test('the production statement-timeout error returns ok=false without throwing', async () => {
  const client = mockClient(() => Promise.resolve({
    data: null,
    error: { message: 'canceling statement due to statement timeout' },
  }))
  const r = await refreshExistingCatalogFromSupplier(client, 5000)
  assert.equal(r.ok, false)
  assert.equal(r.hasMore, false, 'a failed call never signals "keep looping"')
  assert.match(r.message, /canceling statement due to statement timeout/)
  assert.match(r.message, /refresh_existing_catalog_from_supplier RPC failed/)
})

// ── combine(): fast-path (no exact counts) still yields a terminating signal ───

function insertResult(overrides = {}) {
  return { ok: true, processed: 0, scanned: 0, inserted: 0, approved: 0, insertsSkippedCap: 0, duplicateSlugFixed: 0, errors: [], hasMore: false, ...overrides }
}

test('combine derives hasMore from progress when exact counts are absent (fast path)', () => {
  // Existing refresh filled its batch → more work, even with NULL remaining.
  const c1 = combineExistingAndNewBatchResults(
    { ok: true, processed: 5000, updated: 5000, approved: 5000, hasMore: true },
    insertResult(),
  )
  assert.equal(c1.hasMore, true)
  assert.equal(c1.remainingTotal, undefined, 'no exact count is fabricated on the fast path')

  // Nothing processed and no new inserts → drained.
  const c2 = combineExistingAndNewBatchResults(
    { ok: true, processed: 0, updated: 0, approved: 0, hasMore: false },
    insertResult({ inserted: 0, hasMore: false }),
  )
  assert.equal(c2.hasMore, false)

  // New-insert path still has a full batch → keep looping even if existing drained.
  const c3 = combineExistingAndNewBatchResults(
    { ok: true, processed: 0, updated: 0, approved: 0, hasMore: false },
    insertResult({ inserted: 500, approved: 500, processed: 500, hasMore: true }),
  )
  assert.equal(c3.hasMore, true)
})

// ── getRefreshQueueCounts: the deliberate diagnostic path ─────────────────────

test('getRefreshQueueCounts returns exact counts from the diagnostic RPC', async () => {
  const client = mockClient((fn) => {
    assert.equal(fn, 'catalog_refresh_queue_counts')
    return Promise.resolve({ data: [{ remaining_existing: 12, remaining_new: 340, remaining_total: 352, blocked_manual: 9 }], error: null })
  })
  const r = await getRefreshQueueCounts(client)
  assert.equal(r.ok, true)
  assert.equal(r.remainingExisting, 12)
  assert.equal(r.remainingNew, 340)
  assert.equal(r.remainingTotal, 352)
  assert.equal(r.blockedManual, 9)
})

test('getRefreshQueueCounts fails soft (ok=false, no throw) on RPC error', async () => {
  const client = mockClient(() => Promise.resolve({ data: null, error: { message: 'timeout' } }))
  const r = await getRefreshQueueCounts(client)
  assert.equal(r.ok, false)
  assert.match(r.message, /timeout/)
})

// ── The clamp still bounds the limit sent to the RPC ──────────────────────────

test('clampRefreshLimit keeps the effective batch within [1, 10000]', () => {
  assert.equal(clampRefreshLimit(5000), 5000)
  assert.equal(clampRefreshLimit(0), 1)
  assert.equal(clampRefreshLimit(999999), 10000)
})
