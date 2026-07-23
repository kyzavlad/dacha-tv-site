import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  extractCategories,
  preferReadableCategoryName,
  buildSupplierCategoryRows,
  fetchLightweightCategories,
  resolvePriceUah,
  extractRootCurrency,
} from '../lib/supplier/sync.ts'
import { isNumericAutoRepairableCategory } from '../lib/catalog/pipeline.ts'
import { runCronStage } from '../lib/catalog/cron-stage.ts'

// ── syncSupplierProducts wiring: extracts categories from its OWN response ────
// syncSupplierProducts requires a live Supabase admin client (no DI exists in
// this codebase to mock it), so it cannot be executed end-to-end in a unit
// test. Instead, this asserts the exact wiring requirement B depends on: the
// function calls extractCategories(raw) on the SAME `raw` object it already
// fetched for products — never a second apiFetch('get_products', ...) call —
// and that this happens inside a try/catch so a failure here cannot lose an
// already-processed product window (requirement B.6).
test('syncSupplierProducts extracts categories from its own already-fetched response, guarded so a failure cannot lose a product window', () => {
  const src = readFileSync(new URL('../lib/supplier/sync.ts', import.meta.url), 'utf8')
  const fnStart = src.indexOf('export async function syncSupplierProducts')
  assert.ok(fnStart >= 0, 'syncSupplierProducts must exist')
  const fnEnd = src.indexOf('\nexport async function syncPricesAndStock', fnStart)
  const fnBody = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined)

  // Only ONE apiFetch('get_products', ...) call in the whole function — the
  // category extraction must reuse `raw` from that single call, not fetch again.
  const getProductsCalls = fnBody.match(/apiFetch\('get_products'/g) ?? []
  assert.equal(getProductsCalls.length, 1, 'syncSupplierProducts must fetch get_products exactly once')

  assert.match(fnBody, /extractCategories\(raw\)/, 'must extract categories from the already-fetched `raw` response')
  assert.match(fnBody, /catch \(e\) \{[\s\S]{0,200}categorySync = \{/, 'category extraction failure must be caught locally, not thrown')
})

// ── extractCategories: top-level `categories` key reuse (requirement B) ────────

test('extractCategories reads the top-level `categories` key from a get_products-shaped response', () => {
  const raw = {
    currency: 41.5,
    discount: 0,
    categories: [{ id: '1', name: 'Мед' }, { id: '2', name: 'Квіти' }],
    products: [{ id: 'p1', category_id: '1' }],
  }
  const cats = extractCategories(raw)
  assert.equal(cats.length, 2)
  assert.deepEqual(cats[0], { id: '1', name: 'Мед' })
})

test('extractCategories returns [] for a response with no categories key', () => {
  assert.deepEqual(extractCategories({ products: [] }), [])
  assert.deepEqual(extractCategories(null), [])
  assert.deepEqual(extractCategories('not an object'), [])
})

// ── preferReadableCategoryName: never let numeric overwrite readable ──────────

test('a readable existing name survives a numeric-only candidate', () => {
  assert.equal(preferReadableCategoryName('Мед', '123', '123'), 'Мед')
})

test('a readable candidate is used when there is no existing name', () => {
  assert.equal(preferReadableCategoryName(undefined, 'Квіти', '2'), 'Квіти')
})

test('a readable candidate replaces a numeric-only existing name (an upgrade, not a downgrade)', () => {
  assert.equal(preferReadableCategoryName('456', 'Садова техніка', '456'), 'Садова техніка')
})

test('falls back to the supplier id only when neither existing nor candidate is readable', () => {
  assert.equal(preferReadableCategoryName('789', '789', '789'), '789')
  assert.equal(preferReadableCategoryName(undefined, undefined, '999'), '999')
})

// ── buildSupplierCategoryRows: readable names preserved, idempotent ───────────

test('buildSupplierCategoryRows preserves an existing readable name over a numeric feed name', () => {
  const categories = [{ id: '10', name: '10' }] // feed only knows the numeric id
  const existing = new Map([['10', 'Мед']])
  const rows = buildSupplierCategoryRows(categories, existing, '2026-01-01T00:00:00.000Z')
  assert.equal(rows[0].name, 'Мед')
})

test('buildSupplierCategoryRows keeps a readable feed name when there is no existing name', () => {
  const categories = [{ id: '11', name: 'Лаванда' }]
  const rows = buildSupplierCategoryRows(categories, new Map(), '2026-01-01T00:00:00.000Z')
  assert.equal(rows[0].name, 'Лаванда')
})

test('buildSupplierCategoryRows preserves parent relationships', () => {
  const categories = [{ id: '20', name: 'Підкатегорія', parent_id: '5' }]
  const rows = buildSupplierCategoryRows(categories, new Map(), '2026-01-01T00:00:00.000Z')
  assert.equal(rows[0].parent_supplier_id, '5')
})

test('buildSupplierCategoryRows skips categories with no usable id', () => {
  const rows = buildSupplierCategoryRows([{ name: 'no id here' }], new Map())
  assert.equal(rows.length, 0)
})

test('buildSupplierCategoryRows is idempotent — identical inputs produce byte-identical rows', () => {
  const categories = [{ id: '30', name: 'Мед', parent_id: null }, { id: '31', name: '31' }]
  const existing = new Map([['31', 'Продукти пасіки']])
  const nowIso = '2026-01-01T00:00:00.000Z'
  const first = buildSupplierCategoryRows(categories, existing, nowIso)
  const second = buildSupplierCategoryRows(categories, existing, nowIso)
  assert.deepEqual(first, second)
})

// ── fetchLightweightCategories: NEVER get_products, NEVER YML/XML (requirement A/F) ──

function withSupplierEnv(fn) {
  const prevUrl = process.env.SUPPLIER_API_URL
  const prevKey = process.env.SUPPLIER_API_KEY
  process.env.SUPPLIER_API_URL = 'https://supplier.example.test/api'
  process.env.SUPPLIER_API_KEY = 'super-secret-key'
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevUrl === undefined) delete process.env.SUPPLIER_API_URL; else process.env.SUPPLIER_API_URL = prevUrl
      if (prevKey === undefined) delete process.env.SUPPLIER_API_KEY; else process.env.SUPPLIER_API_KEY = prevKey
    })
}

function withMockedFetch(handler, fn) {
  const prevFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    return handler(String(url), init)
  }
  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => { globalThis.fetch = prevFetch })
}

test('fetchLightweightCategories calls ONLY get_categories — never get_products, never a yml/xml type param', async () => {
  await withSupplierEnv(() =>
    withMockedFetch(
      async () => new Response(JSON.stringify({ categories: [{ id: '1', name: 'Мед' }] }), { status: 200 }),
      async (calls) => {
        const result = await fetchLightweightCategories()
        assert.equal(calls.length, 1, 'exactly one supplier HTTP request')
        assert.match(calls[0], /method=get_categories/)
        assert.doesNotMatch(calls[0], /method=get_products/)
        assert.doesNotMatch(calls[0], /type=yml/)
        assert.doesNotMatch(calls[0], /type=xml/)
        assert.equal(result.categories.length, 1)
      },
    ),
  )
})

test('fetchLightweightCategories never leaks SUPPLIER_API_KEY in the requested URL history is masked in the returned safeUrl', async () => {
  await withSupplierEnv(() =>
    withMockedFetch(
      async () => new Response(JSON.stringify({ categories: [] }), { status: 200 }),
      async () => {
        const result = await fetchLightweightCategories()
        assert.doesNotMatch(result.safeUrl, /super-secret-key/)
        assert.match(result.safeUrl, /key=\*\*\*/)
      },
    ),
  )
})

test('fetchLightweightCategories returns a controlled, labeled error on timeout instead of hanging', async () => {
  await withSupplierEnv(() =>
    withMockedFetch(
      (url, init) => new Promise((resolve, reject) => {
        // Simulate a hanging supplier — never resolves on its own; only
        // settles if aborted by the timeout signal, exactly like a real fetch.
        // AbortSignal.timeout()'s internal timer is unref'd (by design — it
        // must never keep a process alive on its own), so this mock keeps a
        // REF'd fallback timer running so the event loop stays open long
        // enough for the abort to win the race; the fallback itself would
        // only fire if the abort somehow never happens (test would then fail
        // on the outer `assert.rejects` timeout instead of hanging forever).
        const keepAlive = setTimeout(() => {}, 5000)
        const onAbort = () => {
          clearTimeout(keepAlive)
          const err = new Error('The operation was aborted')
          err.name = 'TimeoutError'
          reject(err)
        }
        if (init.signal?.aborted) onAbort()
        else init.signal?.addEventListener('abort', onAbort)
      }),
      async () => {
        await assert.rejects(
          () => fetchLightweightCategories(50),
          (err) => {
            assert.match(err.message, /timed out after 50ms/)
            assert.match(err.message, /get_categories/)
            return true
          },
        )
      },
    ),
  )
})

// ── isNumericAutoRepairableCategory: manual categories are never touched ──────

test('a numeric-named non-manual category is eligible for repair', () => {
  assert.equal(isNumericAutoRepairableCategory({ name_ua: '123', source: null }), true)
  assert.equal(isNumericAutoRepairableCategory({ name_ua: '123', source: 'supplier' }), true)
})

test('a numeric-named MANUAL category is never eligible — must remain untouched', () => {
  assert.equal(isNumericAutoRepairableCategory({ name_ua: '123', source: 'manual' }), false)
})

test('a readable-named category (manual or not) is never flagged for repair', () => {
  assert.equal(isNumericAutoRepairableCategory({ name_ua: 'Мед', source: null }), false)
  assert.equal(isNumericAutoRepairableCategory({ name_ua: 'Мед', source: 'manual' }), false)
})

// ── runCronStage: a stage failure is isolated, never crashes the process ──────

test('runCronStage catches a thrown error and reports a failed stage instead of throwing', async () => {
  const report = await runCronStage(async () => { throw new Error('supplier feed exploded') })
  assert.equal(report.ok, false)
  assert.equal(report.errors, 1)
  assert.match(report.message, /supplier feed exploded/)
  assert.equal(typeof report.durationMs, 'number')
})

test('runCronStage reports a truthful ok/processed/updated/remaining/errors contract on success', async () => {
  const report = await runCronStage(async () => ({
    ok: true, synced: 12, updated: 3, remaining: 0, errors: 0, message: 'done',
  }))
  assert.equal(report.ok, true)
  assert.equal(report.processed, 12)
  assert.equal(report.updated, 3)
  assert.equal(report.remaining, 0)
  assert.equal(report.errors, 0)
  assert.equal(report.message, 'done')
})

// ── Regression: product price/stock resolution is unchanged (requirement F.10) ──

test('resolvePriceUah / extractRootCurrency behavior is unchanged by this patch', () => {
  const rootCurrency = extractRootCurrency({ currency: 41.5 })
  assert.equal(rootCurrency, 41.5)
  const { priceUah, winField } = resolvePriceUah({ price_uah: 500 }, rootCurrency)
  assert.equal(priceUah, 500)
  assert.equal(winField, 'price_uah')
  const usdRow = resolvePriceUah({ price_usd: 10 }, rootCurrency)
  assert.equal(usdRow.priceUah, Math.round(10 * 41.5))
})
