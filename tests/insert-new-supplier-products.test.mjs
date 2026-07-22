import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insertNewSupplierProducts, NEW_PRODUCT_SCAN_PAGE } from '../lib/catalog/pipeline.ts'

// ── Minimal in-memory fake Supabase client ──────────────────────────────────
// Supports exactly the query-builder methods insertNewSupplierProducts calls:
// select/eq/not/gt/in/order/range (read chains, awaited as a thenable) and
// upsert / update(...).in(...) (terminal writes). `errorPlan` lets a test
// inject a failure on the Nth select/upsert/update call against a given
// table, so every "read/write error → ok=false" path can be exercised
// without a live Postgres instance.
function fakeClient(seed, errorPlan = {}) {
  const state = {
    supplier_products: (seed.supplier_products ?? []).map((r) => ({ ...r })),
    catalog_products: (seed.catalog_products ?? []).map((r) => ({ ...r })),
    catalog_categories: (seed.catalog_categories ?? []).map((r) => ({ ...r })),
  }
  const callCounts = {}

  function nextError(table, op) {
    const key = `${table}:${op}`
    callCounts[key] = (callCounts[key] ?? 0) + 1
    const plan = errorPlan[key]
    if (!plan) return null
    // A plain string means "always fail this operation" (every call, including
    // retries); a function receives the 1-based call index for "fail only the
    // Nth call" scenarios (e.g. the 2nd select on a table, not the 1st).
    return typeof plan === 'function' ? plan(callCounts[key]) : plan
  }

  function from(table) {
    const filters = []
    let mode = 'select'
    let updatePatch = null
    let orderCol = null
    let orderAsc = true
    let rangeFrom = null
    let rangeTo = null

    const api = {
      select() { return api },
      eq(col, val) { filters.push((r) => r[col] === val); return api },
      not(col, op, val) {
        if (op === 'is' && val === null) filters.push((r) => r[col] !== null && r[col] !== undefined)
        return api
      },
      gt(col, val) { filters.push((r) => typeof r[col] === 'number' && r[col] > val); return api },
      in(col, vals) {
        if (mode === 'update') {
          const err = nextError(table, 'update')
          if (err) return Promise.resolve({ error: { message: err } })
          for (const row of state[table]) {
            if (vals.includes(row[col])) Object.assign(row, updatePatch)
          }
          return Promise.resolve({ error: null })
        }
        filters.push((r) => vals.includes(r[col]))
        return api
      },
      order(col, opts) { orderCol = col; orderAsc = opts?.ascending !== false; return api },
      range(from2, to2) { rangeFrom = from2; rangeTo = to2; return api },
      update(patch) { mode = 'update'; updatePatch = patch; return api },
      upsert(rows) {
        const err = nextError(table, 'upsert')
        if (err) return Promise.resolve({ error: { message: err } })
        for (const row of rows) {
          const idx = state[table].findIndex((r) => r.supplier_sku === row.supplier_sku)
          if (idx >= 0) state[table][idx] = { ...state[table][idx], ...row }
          else state[table].push({ ...row })
        }
        return Promise.resolve({ error: null })
      },
      then(resolve, reject) {
        const err = nextError(table, 'select')
        if (err) return Promise.resolve({ data: null, error: { message: err } }).then(resolve, reject)
        let rows = state[table].filter((r) => filters.every((f) => f(r)))
        if (orderCol) {
          rows = [...rows].sort((a, b) => {
            const av = a[orderCol], bv = b[orderCol]
            const cmp = av > bv ? 1 : av < bv ? -1 : 0
            return orderAsc ? cmp : -cmp
          })
        }
        if (rangeFrom != null && rangeTo != null) rows = rows.slice(rangeFrom, rangeTo + 1)
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      },
    }
    return api
  }

  return { from, _state: state }
}

function supplierRow(i, overrides = {}) {
  return {
    id: `sp-${i}`, supplier_sku: `SKU-${i}`, name: `Product ${i}`, name_ua: `Товар ${i}`,
    supplier_category_id: null, price_uah: 100, supplier_price_usd: 5,
    main_image_url: null, images: null, stock_quantity: 3, is_in_stock: true,
    is_approved: false,
    ...overrides,
  }
}

// ── 500 existing rows before a new row do not block the new row ────────────

test('500 existing rows ahead of a new row do not block it — scan continues to the next page', async () => {
  const existing = Array.from({ length: NEW_PRODUCT_SCAN_PAGE }, (_, i) => supplierRow(i))
  const newOne = supplierRow(NEW_PRODUCT_SCAN_PAGE, { id: 'sp-new', supplier_sku: 'SKU-NEW' })
  const supplier_products = [...existing, newOne]
  // Every "existing" SKU already has a catalog_products row (source='supplier').
  const catalog_products = existing.map((sp) => ({ supplier_sku: sp.supplier_sku, source: 'supplier', slug: `slug-${sp.supplier_sku}` }))

  const client = fakeClient({ supplier_products, catalog_products })
  const result = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')

  assert.equal(result.ok, true)
  assert.equal(result.scanned, NEW_PRODUCT_SCAN_PAGE + 1, 'must scan past the first full page of existing rows')
  assert.equal(result.processed, 1)
  assert.equal(result.inserted, 1)
  assert.equal(result.approved, 1)
  assert.ok(client._state.catalog_products.some((r) => r.supplier_sku === 'SKU-NEW'))
})

// ── manual-shadow rows do not block new rows ────────────────────────────────

test('manual-shadow rows ahead of a new row do not block it', async () => {
  const shadowed = Array.from({ length: NEW_PRODUCT_SCAN_PAGE }, (_, i) => supplierRow(i))
  const newOne = supplierRow(NEW_PRODUCT_SCAN_PAGE, { id: 'sp-new', supplier_sku: 'SKU-NEW' })
  const supplier_products = [...shadowed, newOne]
  // Every "shadow" SKU already has a MANUAL catalog_products row — the insert
  // path must still skip-and-continue exactly like an ordinary existing row.
  const catalog_products = shadowed.map((sp) => ({ supplier_sku: sp.supplier_sku, source: 'manual', slug: `slug-${sp.supplier_sku}` }))

  const client = fakeClient({ supplier_products, catalog_products })
  const result = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')

  assert.equal(result.ok, true)
  assert.equal(result.processed, 1)
  assert.equal(result.inserted, 1)
  assert.ok(client._state.catalog_products.some((r) => r.supplier_sku === 'SKU-NEW'))
})

// ── error propagation: never swallow a DB error as success ─────────────────

test('supplier candidate read error returns ok=false', async () => {
  const client = fakeClient(
    { supplier_products: [supplierRow(0)] },
    { 'supplier_products:select': 'connection reset' },
  )
  const result = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')
  assert.equal(result.ok, false)
  assert.match(result.message, /supplier candidate read failed/)
  assert.match(result.message, /connection reset/)
})

test('existing-SKU read error returns ok=false', async () => {
  const supplier_products = [supplierRow(0)]
  const client = fakeClient(
    { supplier_products },
    { 'catalog_products:select': 'timeout on existence check' },
  )
  const result = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')
  assert.equal(result.ok, false)
  assert.match(result.message, /existing-SKU read failed/)
})

test('category lookup error returns ok=false', async () => {
  const supplier_products = [supplierRow(0, { supplier_category_id: 'cat-1' })]
  const client = fakeClient(
    { supplier_products },
    {
      // 1st catalog_products select = existence check (must succeed, empty result);
      // the category lookup is against catalog_categories — fail that instead.
      'catalog_categories:select': 'category service unavailable',
    },
  )
  const result = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')
  assert.equal(result.ok, false)
  assert.match(result.message, /category lookup failed/)
})

test('slug read error returns ok=false', async () => {
  const supplier_products = [supplierRow(0)]
  // catalog_products:select is called twice before any writes: (1) the
  // existence check, (2) the slug page read. Fail only the 2nd.
  const client = fakeClient(
    { supplier_products },
    { 'catalog_products:select': (n) => (n === 2 ? 'slug index unavailable' : null) },
  )
  const result = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')
  assert.equal(result.ok, false)
  assert.match(result.message, /slug read failed/)
})

test('a catalog insert error is a SOFT failure (feeds errors[]) — not ok=false by itself', async () => {
  const supplier_products = [supplierRow(0)]
  const client = fakeClient(
    { supplier_products },
    {
      // Every upsert attempt fails (chunk AND all 11 per-row retries) with a
      // non-slug, non-recoverable error.
      'catalog_products:upsert': 'insert constraint violation',
    },
  )
  const result = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')
  assert.equal(result.ok, true, 'a per-row insert failure alone does not set the hard-failure flag')
  assert.equal(result.inserted, 0)
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], /insert constraint violation/)
})

test('approval update error returns ok=false and those rows are not counted approved', async () => {
  const supplier_products = [supplierRow(0)]
  const client = fakeClient(
    { supplier_products },
    { 'supplier_products:update': 'approval write failed' },
  )
  const result = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')
  assert.equal(result.ok, false)
  assert.match(result.message, /supplier approval update failed/)
  assert.equal(result.approved, 0, 'a row must not be counted approved when its approval UPDATE failed')
  assert.equal(result.inserted, 1, 'the catalog row was still inserted — only approval failed')
})

// ── idempotency ──────────────────────────────────────────────────────────────

test('repeated calls against an exhausted queue are idempotent', async () => {
  const client = fakeClient({ supplier_products: [], catalog_products: [] })
  const first = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')
  const second = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.processed, 0)
  assert.equal(second.processed, 0)
})

test('new rows land as draft and are approved only after a successful insert', async () => {
  const supplier_products = [supplierRow(0)]
  const client = fakeClient({ supplier_products })
  const result = await insertNewSupplierProducts(client, 500, false, '2026-07-21T00:00:00.000Z')
  assert.equal(result.ok, true)
  assert.equal(result.inserted, 1)
  assert.equal(result.approved, 1)
  const inserted = client._state.catalog_products.find((r) => r.supplier_sku === 'SKU-0')
  assert.equal(inserted.status, 'draft')
  const spRow = client._state.supplier_products.find((r) => r.id === 'sp-0')
  assert.equal(spRow.is_approved, true)
})

test('capReached defers new inserts without inserting or approving them', async () => {
  const supplier_products = [supplierRow(0)]
  const client = fakeClient({ supplier_products })
  const result = await insertNewSupplierProducts(client, 500, true, '2026-07-21T00:00:00.000Z')
  assert.equal(result.ok, true)
  assert.equal(result.inserted, 0)
  assert.equal(result.approved, 0)
  assert.equal(result.insertsSkippedCap, 1)
})
