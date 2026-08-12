import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getRuProductAiCandidates,
  applyRuProductAiBatch,
  isCanonicalUuid,
} from '../lib/catalog/seo-ai-ru.ts'

// ─────────────────────────────────────────────────────────────────────────────
// RU PRODUCT candidate selection is now driven by the SQL queue
// (public.ru_product_seo_queue via public.get_ru_product_seo_candidate_ids),
// NOT by a blind paginated scan of catalog_products.
//
// The removed root cause: getRuProductAiCandidates() paged catalog_products
// 1000 rows at a time (up to 200 pages), probing catalog_product_translations
// for every page and skipping already-complete RU rows in JS. Near completion
// almost every scanned row was already complete, so ONE request walked 70k–80k
// products and hit the Supabase/nginx statement timeout.
//
// These tests pin the new behavior without a live Postgres. The fake client
// FAILS LOUDLY if anything tries to paginate catalog_products again
// (.range()/.order()) — that is the actual regression guard.
// ─────────────────────────────────────────────────────────────────────────────

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const VALID_TITLE = 'Тормозные колодки AMG для мотоцикла'
const VALID_DESC_META = 'Тормозные колодки для мотоцикла: надёжная остановка и долгий ресурс. Доставка по Украине, оплата после подтверждения заказа.'
const VALID_DESCRIPTION =
  'Тормозные колодки для мотоцикла обеспечивают уверенное торможение и равномерный износ. Подходят для городской езды и трассы, устойчивы к перегреву. Уточните совместимость с вашей моделью у менеджера перед заказом.'

function product(i, over = {}) {
  return {
    id: uuid(i),
    slug: `tovar-${i}`,
    supplier_sku: `SKU${i}`,
    name_ua: `Гальмівні колодки ${i} для мотоцикла`,
    name: `Тормозные колодки ${i}`,
    category_slug: 'moto',
    price_uah: 250,
    price_prefix: null,
    unit_label: 'грн',
    main_image_url: 'https://images.zone/x.jpg',
    images: null,
    meta_title: 'UA заголовок',
    meta_description: 'UA опис',
    description_ua: 'UA опис товару',
    status: 'published',
    ...over,
  }
}

// Fake Supabase client: RPC + `.in()` lookups only. Any attempt to paginate
// catalog_products (the removed blind scan) throws.
function fakeClient({ queue = [], products = [], translations = [], categories = [], rpcError = null } = {}) {
  const calls = { rpc: [], tables: [] }
  const prodById = new Map(products.map((p) => [p.id, p]))
  const txByProduct = new Map(translations.map((t) => [t.product_id, t]))

  function from(table) {
    const rec = { table, methods: [], columns: null, filters: [] }
    calls.tables.push(rec)
    const preds = []
    const api = {
      select(cols, opts) { rec.methods.push('select'); rec.columns = cols; rec.count = opts?.count ?? null; return api },
      eq(col, val) { rec.methods.push('eq'); rec.filters.push([col, val]); preds.push((r) => r[col] === val); return api },
      neq(col, val) { rec.methods.push('neq'); preds.push((r) => r[col] !== val); return api },
      not(col) { rec.methods.push('not'); preds.push((r) => r[col] != null); return api },
      in(col, vals) { rec.methods.push('in'); rec.filters.push([col, vals]); preds.push((r) => vals.includes(r[col])); return api },
      order() { rec.methods.push('order'); throw new Error(`BLIND SCAN: .order() on ${table}`) },
      range() { rec.methods.push('range'); throw new Error(`BLIND SCAN: .range() on ${table}`) },
      then(resolve, reject) {
        let rows
        if (table === 'catalog_products') rows = [...prodById.values()]
        else if (table === 'catalog_product_translations') rows = [...txByProduct.values()]
        else if (table === 'catalog_categories') rows = categories
        else rows = []
        rows = rows.filter((r) => preds.every((f) => f(r)))
        // PostgREST returns rows in an unspecified order — shuffle deterministically
        // so any test that passes only because the DB happened to echo the queue
        // order would fail.
        rows = [...rows].reverse()
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject)
      },
    }
    return api
  }

  return {
    from,
    rpc(fn, args) {
      calls.rpc.push({ fn, args })
      if (rpcError) return Promise.resolve({ data: null, error: { message: rpcError } })
      const limit = args?.p_limit ?? 100
      return Promise.resolve({ data: queue.slice(0, limit), error: null })
    },
    _calls: calls,
  }
}

const queueRow = (i, priority = 0, over = {}) => ({
  product_id: uuid(i), priority, seo_generated_at: null, seo_status: null, ...over,
})

// ── The regression guard: RPC selection, no paginated catalog scan ────────────

test('candidate selection calls the SQL queue RPC once and never paginates catalog_products', async () => {
  const queue = Array.from({ length: 300 }, (_, i) => queueRow(i))
  const products = Array.from({ length: 300 }, (_, i) => product(i))
  const client = fakeClient({ queue, products })

  const r = await getRuProductAiCandidates(100, { client })

  assert.equal(r.ok, true)
  assert.equal(r.count, 100)
  assert.equal(client._calls.rpc.length, 1, 'exactly one queue RPC call')
  assert.equal(client._calls.rpc[0].fn, 'get_ru_product_seo_candidate_ids')
  // Bounded pool: more than the page (so drop-outs cannot under-fill) but small.
  const pool = client._calls.rpc[0].args.p_limit
  assert.ok(pool >= 100 && pool <= 400, `p_limit must be bounded, got ${pool}`)

  // Every catalog_products read is an id-list hydration — never an ordered page.
  const prodQueries = client._calls.tables.filter((t) => t.table === 'catalog_products')
  assert.ok(prodQueries.length > 0)
  for (const q of prodQueries) {
    assert.ok(!q.methods.includes('range'), 'no .range() paging')
    assert.ok(!q.methods.includes('order'), 'no .order() paging')
    assert.ok(q.filters.some(([col]) => col === 'id'), 'hydration filters on id')
  }
})

test('diagnostics report the bounded queue, not tens of thousands of scanned products', async () => {
  const queue = Array.from({ length: 300 }, (_, i) => queueRow(i))
  const products = Array.from({ length: 300 }, (_, i) => product(i))
  const r = await getRuProductAiCandidates(100, { client: fakeClient({ queue, products }) })

  const d = r.diagnostics
  assert.equal(d.pages, 1, 'RPC selection is a single page')
  assert.equal(d.scanned, d.pool_limit, 'scanned is the bounded queue size')
  assert.ok(d.scanned <= 400, `scanned must stay bounded, got ${d.scanned}`)
  assert.equal(d.scan_capped, false)
  assert.equal(d.complete_skipped, 0, 'a healthy queue contains no already-complete rows')
  assert.equal(d.returned, 100)
  assert.equal(d.missing_translation_found, 100)
})

test('100 requested → 100 unique canonical product UUIDs', async () => {
  const queue = Array.from({ length: 300 }, (_, i) => queueRow(i))
  const products = Array.from({ length: 300 }, (_, i) => product(i))
  const r = await getRuProductAiCandidates(100, { client: fakeClient({ queue, products }) })

  assert.equal(r.candidates.length, 100)
  const ids = r.candidates.map((c) => c.id)
  assert.equal(new Set(ids).size, 100, 'all ids unique')
  for (const id of ids) assert.ok(isCanonicalUuid(id), `canonical UUID expected, got ${id}`)
})

test('SQL queue order is preserved through hydration (priority order is the queue order)', async () => {
  // Queue deliberately NOT in id order, and the fake DB returns hydrated rows
  // reversed — only real order preservation can satisfy this.
  const order = [7, 2, 9, 0, 5]
  const queue = order.map((i, idx) => queueRow(i, idx < 3 ? 0 : 1))
  const products = order.map((i) => product(i))
  const r = await getRuProductAiCandidates(5, { client: fakeClient({ queue, products }) })

  assert.deepEqual(r.candidates.map((c) => c.id), order.map(uuid))
})

test('priority tiers stay in queue order: missing RU row → partial non-AI → incomplete AI', async () => {
  const queue = [queueRow(1, 0), queueRow(2, 1), queueRow(3, 2)]
  const products = [product(1), product(2), product(3)]
  const translations = [
    { product_id: uuid(2), locale: 'ru', meta_title: null, meta_description: null, description: null, seo_keywords: null, seo_status: 'missing', seo_manual_lock: false, seo_generated_at: null },
    { product_id: uuid(3), locale: 'ru', meta_title: 'Bosch 6202-ZZ', meta_description: VALID_DESC_META, description: VALID_DESCRIPTION, seo_keywords: null, seo_status: 'ai', seo_manual_lock: false, seo_generated_at: '2026-01-01T00:00:00Z' },
  ]
  const r = await getRuProductAiCandidates(10, { client: fakeClient({ queue, products, translations }) })

  assert.deepEqual(r.candidates.map((c) => c.id), [uuid(1), uuid(2), uuid(3)])
  assert.equal(r.diagnostics.missing_translation_found, 1)
  assert.equal(r.diagnostics.partial_found, 1)
  assert.equal(r.diagnostics.invalid_found, 1)
  // Defensive re-validation is retained: the nonblank-but-invalid AI title is
  // re-requested, the valid fields are not.
  assert.deepEqual(r.candidates[2].needs, ['meta_title'])
})

// ── Safety validation retained on top of the queue ────────────────────────────

test('manual-locked, already-complete and unlistable queued rows are dropped, not returned', async () => {
  const queue = [queueRow(1), queueRow(2), queueRow(3), queueRow(4), queueRow(5)]
  const products = [
    product(1),
    product(2),
    product(3),
    // No real name → not safely matchable to a source product.
    product(4, { name_ua: 'N-1171', name: 'N-1171' }),
    // id 5 has NO catalog_products row at all (stale queue entry).
  ]
  const translations = [
    { product_id: uuid(2), locale: 'ru', meta_title: VALID_TITLE, meta_description: VALID_DESC_META, description: VALID_DESCRIPTION, seo_keywords: null, seo_status: 'ai', seo_manual_lock: false, seo_generated_at: '2026-01-01T00:00:00Z' },
    { product_id: uuid(3), locale: 'ru', meta_title: null, meta_description: null, description: null, seo_keywords: null, seo_status: 'missing', seo_manual_lock: true, seo_generated_at: null },
  ]
  const r = await getRuProductAiCandidates(10, { client: fakeClient({ queue, products, translations }) })

  assert.deepEqual(r.candidates.map((c) => c.id), [uuid(1)], 'only the genuinely eligible row survives')
  assert.equal(r.diagnostics.complete_skipped, 1)
  assert.equal(r.diagnostics.locked_skipped, 1)
  assert.equal(r.diagnostics.unmatched_skipped, 2, 'unlistable + missing source row')
})

test('a queued product that is no longer published is never handed to n8n', async () => {
  const queue = [queueRow(1), queueRow(2)]
  const products = [product(1, { status: 'draft' }), product(2)]
  const r = await getRuProductAiCandidates(10, { client: fakeClient({ queue, products }) })

  assert.deepEqual(r.candidates.map((c) => c.id), [uuid(2)])
  assert.equal(r.diagnostics.unmatched_skipped, 1)
})

test('the candidate response shape is unchanged', async () => {
  const client = fakeClient({
    queue: [queueRow(1)],
    products: [product(1)],
    categories: [{ slug: 'moto', name_ua: 'Мотозапчастини' }],
  })
  const r = await getRuProductAiCandidates(1, { client })
  const c = r.candidates[0]

  assert.deepEqual(Object.keys(c).sort(), [
    'category_name', 'category_slug', 'current_ru', 'id', 'image', 'locale',
    'name', 'needs', 'price', 'sku', 'slug', 'source_uk', 'suggested_targets',
  ])
  assert.equal(c.locale, 'ru')
  assert.equal(c.category_name, 'Мотозапчастини')
  assert.deepEqual(Object.keys(c.source_uk).sort(), ['description_ua', 'meta_description', 'meta_title', 'name_ua'])
  assert.deepEqual(Object.keys(c.current_ru).sort(), ['description', 'meta_description', 'meta_title', 'seo_keywords', 'seo_status'])
  assert.deepEqual(c.needs, ['meta_title', 'meta_description', 'description'])
  assert.equal(c.suggested_targets.language, 'ru')
})

test('an RPC failure is reported — it never falls back to scanning the catalog', async () => {
  const client = fakeClient({ rpcError: 'function get_ru_product_seo_candidate_ids does not exist' })
  const r = await getRuProductAiCandidates(100, { client })

  assert.equal(r.ok, false)
  assert.equal(r.count, 0)
  assert.match(r.message, /get_ru_product_seo_candidate_ids/)
  assert.equal(client._calls.tables.filter((t) => t.table === 'catalog_products').length, 0, 'no catalog scan fallback')
})

// ─────────────────────────────────────────────────────────────────────────────
// Numeric-id → UUID column guard.
// Production log: `invalid input syntax for type uuid` with values like 49/242.
// PostgREST forwards the whole `in.(…)` list to Postgres, so ONE non-canonical
// id used to fail the entire 300-item chunk (silently — the query error was
// discarded), and every product in that chunk resolved to "not found".
// ─────────────────────────────────────────────────────────────────────────────

function applyFakeClient(seed = {}) {
  const products = (seed.products ?? []).map((r) => ({ ...r }))
  const translations = new Map((seed.translations ?? []).map((t) => [t.product_id, { ...t }]))
  const upserts = []
  const idFilters = [] // every value list sent to the uuid `id` column

  function from(table) {
    const preds = []
    const api = {
      select() { return api },
      eq(col, val) { preds.push((r) => r[col] === val); return api },
      in(col, vals) {
        if (table === 'catalog_products' && col === 'id') {
          idFilters.push([...vals])
          // Mirror Postgres: a non-uuid literal in a uuid comparison aborts the
          // whole statement, and PostgREST returns it as a query error.
          const bad = vals.find((v) => !isCanonicalUuid(v))
          if (bad !== undefined) {
            return { then: (resolve) => Promise.resolve({ data: null, error: { message: `invalid input syntax for type uuid: "${bad}"` } }).then(resolve) }
          }
        }
        preds.push((r) => vals.includes(r[col]))
        return api
      },
      insert() { return { select() { return { single() { return Promise.resolve({ data: { id: 'log-1' }, error: null }) } } } } },
      update() { return { eq() { return Promise.resolve({ error: null }) } } },
      upsert(payload) {
        if (table === 'catalog_product_translations') {
          upserts.push({ ...payload })
          const cur = translations.get(payload.product_id) ?? { product_id: payload.product_id }
          translations.set(payload.product_id, { ...cur, ...payload })
        }
        return Promise.resolve({ error: null })
      },
      then(resolve, reject) {
        let rows
        if (table === 'catalog_products') rows = products
        else if (table === 'catalog_product_translations') rows = [...translations.values()]
        else rows = []
        rows = rows.filter((r) => preds.every((f) => f(r)))
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      },
    }
    return api
  }
  return { from, _translations: translations, _upserts: upserts, _idFilters: idFilters }
}

test('isCanonicalUuid accepts catalog UUIDs and rejects numeric/sheet ids', () => {
  assert.equal(isCanonicalUuid(uuid(49)), true)
  for (const bad of ['49', '242', 49, '', null, undefined, 'SKU49', '00000000-0000-4000-8000-0000000000']) {
    assert.equal(isCanonicalUuid(bad), false, `must reject ${String(bad)}`)
  }
})

test('a numeric item id never reaches the uuid id column and never poisons the batch', async () => {
  const products = [product(1), product(2)]
  const client = applyFakeClient({ products })

  const good = { id: uuid(1), meta_title: VALID_TITLE, meta_description: VALID_DESC_META, description: VALID_DESCRIPTION }
  const numeric = { id: '49', meta_title: VALID_TITLE, meta_description: VALID_DESC_META, description: VALID_DESCRIPTION }
  const r = await applyRuProductAiBatch([good, numeric], { client })

  // No uuid-column query ever received "49".
  for (const list of client._idFilters) {
    for (const v of list) assert.ok(isCanonicalUuid(v), `non-uuid ${v} sent to the id column`)
  }
  // The valid product still applied — one bad id no longer fails the whole chunk.
  assert.equal(r.updated, 1)
  assert.equal(r.skipped, 1)
  const skipped = r.results.find((x) => x.status === 'skipped')
  assert.match(skipped.reasons[0], /не является UUID каталога/)
  // Nothing was written for the numeric id.
  assert.equal(client._upserts.length, 1)
  assert.equal(client._upserts[0].product_id, uuid(1))
  assert.ok(isCanonicalUuid(client._upserts[0].product_id))
})

test('a numeric id is never coerced onto another product via supplier_sku', async () => {
  // A product whose supplier_sku IS "49" must NOT absorb an item sent with id=49.
  const products = [product(1, { supplier_sku: '49' })]
  const client = applyFakeClient({ products })
  const r = await applyRuProductAiBatch(
    [{ id: '49', meta_title: VALID_TITLE, meta_description: VALID_DESC_META, description: VALID_DESCRIPTION }],
    { client },
  )
  assert.equal(r.updated, 0)
  assert.equal(r.skipped, 1)
  assert.equal(client._upserts.length, 0, 'no write to an unrelated product')
})

test('a numeric JSON id (not a string) is handled without a crash', async () => {
  const client = applyFakeClient({ products: [product(1)] })
  const r = await applyRuProductAiBatch(
    [{ id: 242, meta_title: VALID_TITLE, meta_description: VALID_DESC_META, description: VALID_DESCRIPTION }],
    { client },
  )
  assert.equal(r.skipped, 1)
  assert.equal(r.updated, 0)
})

test('an item carrying a numeric id but a real sku still resolves by sku', async () => {
  const client = applyFakeClient({ products: [product(1)] })
  const r = await applyRuProductAiBatch(
    [{ id: '49', sku: 'SKU1', meta_title: VALID_TITLE, meta_description: VALID_DESC_META, description: VALID_DESCRIPTION }],
    { client },
  )
  assert.equal(r.updated, 1)
  assert.equal(client._upserts[0].product_id, uuid(1))
})
