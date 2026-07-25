import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateRussianMetaTitle,
  validateMetaTitle,
  validateRussianText,
} from '../lib/catalog/seo-validate.ts'
import {
  productRuNeeds,
  checkRuProductField,
  planRuProductItem,
  applyRuProductAiBatch,
} from '../lib/catalog/seo-ai-ru.ts'
import { summarizeApply } from '../lib/catalog/seo-batch-report.ts'

// ─────────────────────────────────────────────────────────────────────────────
// RU PRODUCT SEO effective-throughput fix. The n8n workflow reports 100 updated
// but only ~10 become complete because (a) invalid nonblank RU titles were not
// re-requested (needs was blank-only), (b) the blunt >50%-Cyrillic rule rejected
// legitimate technical titles, and (c) partial field writes counted as updates.
// These tests pin the corrected behavior without a live Postgres.
// ─────────────────────────────────────────────────────────────────────────────

// Reusable valid RU content (all-Cyrillic, no Ukrainian letters, sane lengths).
const VALID_TITLE = 'Тормозные колодки AMG для мотоцикла'
const VALID_DESC_META = 'Тормозные колодки для мотоцикла: надёжная остановка и долгий ресурс. Доставка по Украине, оплата после подтверждения заказа.'
const VALID_DESCRIPTION =
  'Тормозные колодки для мотоцикла обеспечивают уверенное торможение и равномерный износ. Подходят для городской езды и трассы, устойчивы к перегреву. Уточните совместимость с вашей моделью у менеджера перед заказом.'

// ── Requirement 2: dedicated RU meta-title validator ──────────────────────────

test('valid technical Russian titles with Latin brand/model pass', () => {
  for (const t of [
    'Тормозные колодки AMG 90×49×10 для мотоцикла',
    'Подшипник коленвала Bosch 6202-ZZ для мототехники',
    'Ремень привода Gates 10×850 для оборудования',
  ]) {
    const ru = validateRussianMetaTitle(t)
    const base = validateMetaTitle(t)
    assert.ok(ru.ok && base.ok, `should pass: ${t} — ${[...base.reasons, ...ru.reasons].join('; ')}`)
  }
})

test('code / brand / number-only titles fail (no meaningful Russian words)', () => {
  for (const t of ['AMG 90x49x10 N-296705', 'Bosch 6202-ZZ', 'CRF 250 New VV', 'N-296705']) {
    assert.equal(validateRussianMetaTitle(t).ok, false, `should fail: ${t}`)
  }
})

test('a title with Ukrainian letters (і/ї/є/ґ) fails the RU title validator', () => {
  const r = validateRussianMetaTitle('Гальмівні колодки для мотоцикла Bosch')
  assert.equal(r.ok, false)
  assert.ok(r.reasons.some((x) => /украинск/i.test(x)), 'must flag Ukrainian letters')
})

test('the RU title validator does NOT use the >50%-Cyrillic rule (heavy Latin/model is fine)', () => {
  // Majority-Latin by letter count (12 Cyrillic vs 13 Latin), so the old
  // validateRussianText 50% rule rejects it outright — the production root cause
  // ("текст преимущественно не кириллицей"). It has 3 meaningful Russian words,
  // so the new dedicated validator accepts it.
  const t = 'Ремень ГРМ вал Bosch Gates NTN'
  assert.equal(validateRussianText(t).ok, false, 'the OLD 50% rule rejects this technical title')
  assert.equal(validateRussianMetaTitle(t).ok && validateMetaTitle(t).ok, true, 'the NEW dedicated validator accepts it')
})

test('heavily technical titles prefer ≥3 Russian words; brand+2-words still ok', () => {
  assert.equal(validateRussianMetaTitle('Тормозные колодки Bosch 6202-ZZ').ok, true) // 2 ru words, 2 tech
  assert.equal(validateRussianMetaTitle('Колодки Bosch Gates AMG N-296705').ok, false) // 1 ru word, 4 tech
})

test('meta_description / description keep the strict Russian gate (Ukrainian letters invalid)', () => {
  // Requirement 2: do NOT weaken RU validation for description fields.
  assert.equal(checkRuProductField('meta_description', 'Гальмівні колодки для мотоцикла надійні').ok, false)
  assert.equal(checkRuProductField('description', 'Гальмівні колодки для мотоцикла, надійні та зносостійкі, підходять для міста.').ok, false)
})

// ── Requirement 1: needs detection re-requests nonblank invalid fields ─────────

test('a nonblank Latin-heavy invalid existing RU title is returned in needs', () => {
  const tx = {
    product_id: 'p1',
    meta_title: 'Bosch 6202-ZZ',            // nonblank but invalid (code/brand only)
    meta_description: VALID_DESC_META,        // valid
    description: VALID_DESCRIPTION,           // valid
    seo_keywords: null, seo_status: 'ai', seo_manual_lock: false, seo_generated_at: '2026-07-01T00:00:00Z',
  }
  const needs = productRuNeeds(tx)
  assert.ok(needs.includes('meta_title'), 'invalid nonblank title must be re-requested')
  assert.ok(!needs.includes('meta_description'), 'valid description must NOT be re-requested')
  assert.ok(!needs.includes('description'), 'valid long description must NOT be re-requested')
})

test('a fully valid RU row needs nothing; a missing row needs all three', () => {
  const valid = {
    product_id: 'p2', meta_title: VALID_TITLE, meta_description: VALID_DESC_META, description: VALID_DESCRIPTION,
    seo_keywords: null, seo_status: 'ai', seo_manual_lock: false, seo_generated_at: '2026-07-01T00:00:00Z',
  }
  assert.deepEqual(productRuNeeds(valid), [])
  assert.deepEqual(productRuNeeds(undefined), ['meta_title', 'meta_description', 'description'])
})

// ── Requirement 3: atomic per-item plan ───────────────────────────────────────

test('one invalid required field makes the whole item invalid with no payload', () => {
  const plan = planRuProductItem({
    id: 'p3',
    meta_title: 'Bosch 6202-ZZ',           // invalid
    meta_description: VALID_DESC_META,       // valid
    description: VALID_DESCRIPTION,          // valid
  })
  assert.equal(plan.status, 'invalid')
  assert.equal(plan.payload, null, 'no partial content payload when a required field is invalid')
  assert.ok(plan.reasons.some((r) => r.startsWith('meta_title')), 'field-level reason present')
})

test('a fully valid item plans as updated with all three fields', () => {
  const plan = planRuProductItem({ id: 'p4', meta_title: VALID_TITLE, meta_description: VALID_DESC_META, description: VALID_DESCRIPTION })
  assert.equal(plan.status, 'updated')
  assert.deepEqual(plan.fields.sort(), ['description', 'meta_description', 'meta_title'])
  assert.ok(plan.payload && plan.payload.meta_title === VALID_TITLE)
})

// ── In-memory fake Supabase client for applyRuProductAiBatch ──────────────────
function fakeClient(seed = {}) {
  const products = (seed.products ?? []).map((r) => ({ ...r }))
  const translations = new Map((seed.translations ?? []).map((t) => [t.product_id, { ...t }]))
  const upserts = [] // every catalog_product_translations upsert payload

  function from(table) {
    const filters = []
    const api = {
      select() { return api },
      eq(col, val) { filters.push((r) => r[col] === val); return api },
      in(col, vals) { filters.push((r) => vals.includes(r[col])); return api },
      single() { return api },
      insert() { return { select() { return { single() { return Promise.resolve({ data: { id: 'log-1' }, error: null }) } } } } },
      update() { return { eq() { return Promise.resolve({ error: null }) } } },
      upsert(payload) {
        if (table === 'catalog_product_translations') {
          upserts.push({ ...payload })
          const cur = translations.get(payload.product_id) ?? { product_id: payload.product_id }
          translations.set(payload.product_id, { ...cur, ...payload }) // merge (onConflict merge-duplicates)
        }
        return Promise.resolve({ error: null })
      },
      then(resolve, reject) {
        let rows
        if (table === 'catalog_products') rows = products.filter((r) => filters.every((f) => f(r)))
        else if (table === 'catalog_product_translations') rows = [...translations.values()].filter((r) => filters.every((f) => f(r)))
        else rows = []
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      },
    }
    return api
  }
  return { from, _translations: translations, _upserts: upserts }
}

// ── Requirement 4 & 6: 100 products, 95 fully valid → updated=95 ──────────────

test('100 input products with 95 fully valid results report updated=95', async () => {
  const products = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, supplier_sku: `SKU${i}` }))
  const items = products.map((p, i) => ({
    id: p.id,
    meta_title: i < 95 ? VALID_TITLE : 'Bosch 6202-ZZ',  // last 5 have an invalid title
    meta_description: VALID_DESC_META,
    description: VALID_DESCRIPTION,
  }))
  const client = fakeClient({ products })
  const r = await applyRuProductAiBatch(items, { client })

  assert.equal(r.updated, 95, 'updated counts only fully-complete products')
  assert.equal(r.invalid, 5, 'the 5 invalid-title products are invalid, not updated')
  assert.equal(r.skipped, 0)
  // Effective throughput / backlog reduction reflects only complete products.
  const summary = summarizeApply(r)
  assert.equal(summary.applied, 95)
  assert.equal(summary.failed, 5)
  // No partial content was written for the invalid ones — their translation rows
  // carry NO meta_title/meta_description/description keys, only a rotation marker.
  for (let i = 95; i < 100; i++) {
    const tx = client._translations.get(`p${i}`)
    assert.ok(tx, 'a rotation marker row exists')
    assert.equal(tx.meta_title, undefined, 'no partial title content written')
    assert.equal(tx.description, undefined, 'no partial description content written')
    assert.ok(tx.seo_generated_at, 'rotation marker bumped seo_generated_at')
    assert.notEqual(tx.seo_status, 'ai', 'invalid product is not marked ai-complete')
  }
})

// ── Requirement 3 & 7: invalid rows stay eligible and rotate for retry ────────

test('an invalid product preserves existing valid fields, rotates, and stays eligible', async () => {
  const oldAt = '2026-01-01T00:00:00.000Z'
  const products = [{ id: 'px', supplier_sku: 'SKUX' }]
  const translations = [{
    product_id: 'px', locale: 'ru',
    meta_title: 'Старый валидный заголовок для мотоцикла', // existing VALID title (preserve!)
    meta_description: VALID_DESC_META,
    description: VALID_DESCRIPTION,
    seo_keywords: null, seo_status: 'ai', seo_manual_lock: false, seo_generated_at: oldAt,
  }]
  const client = fakeClient({ products, translations })

  // n8n re-sends an INVALID new title for this product.
  const r = await applyRuProductAiBatch(
    [{ id: 'px', meta_title: 'CRF 250 New VV', meta_description: VALID_DESC_META, description: VALID_DESCRIPTION }],
    { client },
  )
  assert.equal(r.invalid, 1)
  assert.equal(r.updated, 0)

  const tx = client._translations.get('px')
  // Existing valid content preserved — NOT overwritten by the invalid payload.
  assert.equal(tx.meta_title, 'Старый валидный заголовок для мотоцикла')
  // Rotation: seo_generated_at advanced past the old value → sorts to the back
  // of the oldest-first retry page next scan (one bad product can't wedge it).
  assert.ok(tx.seo_generated_at > oldAt, 'seo_generated_at rotated forward')
  // Still eligible: it remains an AI row whose incoming title never landed, so a
  // fresh needs check (were its stored title the bad one) would re-request it.
  assert.ok(productRuNeeds({ ...tx, meta_title: 'CRF 250 New VV' }).includes('meta_title'))
})

test('manual-locked RU rows are never written and are skipped', async () => {
  const products = [{ id: 'pl', supplier_sku: 'SKUL' }]
  const translations = [{ product_id: 'pl', locale: 'ru', meta_title: null, meta_description: null, description: null, seo_keywords: null, seo_status: 'missing', seo_manual_lock: true, seo_generated_at: null }]
  const client = fakeClient({ products, translations })
  const r = await applyRuProductAiBatch(
    [{ id: 'pl', meta_title: VALID_TITLE, meta_description: VALID_DESC_META, description: VALID_DESCRIPTION }],
    { client },
  )
  assert.equal(r.skipped, 1)
  assert.equal(r.updated, 0)
  assert.equal(client._upserts.length, 0, 'a locked row is never upserted (no content, no marker)')
})
