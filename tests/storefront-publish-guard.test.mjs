import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  publishBlockReason,
  canPublishToStorefront,
  partitionPublishCandidates,
  PUBLISH_GUARD_COLS,
} from '../lib/catalog/storefront-quality.ts'
import { publishAllCatalogProducts, publishDraftProducts } from '../lib/catalog/pipeline.ts'
import { isPublicListableProduct } from '../lib/supabase/catalog.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Storefront publish guard.
//
// Two supplier rows with unusable names reached PUBLISHED and had to be archived
// by hand in production:
//   341b0a17-8c97-4b8e-97d7-0c42e33e1ebc  sku "--10"     name "F0000000024"
//   4700c861-79bc-4efd-83cf-724d176b8b1f  sku "SD-5220"  name "<>"
// The guard runs at the ONE boundary that makes a row public (draft → published)
// and reuses the storefront's own listability predicate, so it can only ever
// block rows the public catalog already refuses to render.
// ─────────────────────────────────────────────────────────────────────────────

const ARCHIVED_JUNK = [
  { id: '341b0a17-8c97-4b8e-97d7-0c42e33e1ebc', supplier_sku: '--10', name_ua: 'F0000000024', name: 'F0000000024', source: 'supplier' },
  { id: '4700c861-79bc-4efd-83cf-724d176b8b1f', supplier_sku: 'SD-5220', name_ua: '<>', name: '<>', source: 'supplier' },
]

// ── Requirement 1 & 2: unusable names can never become public ────────────────

test('"<>" can never become a new public storefront product', () => {
  assert.equal(publishBlockReason({ id: 'x', supplier_sku: 'SD-5220', name_ua: '<>', name: '<>', source: 'supplier' }), 'unusable_name')
  assert.equal(canPublishToStorefront({ id: 'x', supplier_sku: 'SD-5220', name_ua: '<>', name: null, source: 'supplier' }), false)
})

test('empty / whitespace / punctuation-only names are blocked', () => {
  const junk = [null, undefined, '', '   ', '\t\n ', '<>', '<<>>', '---', '...', '. . .', '()', '[]', '{}', '—', '/', '\\', '|', '_', '--10']
  for (const n of junk) {
    assert.equal(
      canPublishToStorefront({ id: 'x', supplier_sku: 'SKU1', name_ua: n, name: n, source: 'supplier' }),
      false,
      `must block name ${JSON.stringify(n)}`,
    )
  }
})

test('a name that is only the SKU (code-like) is blocked', () => {
  assert.equal(canPublishToStorefront({ id: 'x', supplier_sku: 'F0000000024', name_ua: 'F0000000024', name: null, source: 'supplier' }), false)
})

// ── Requirement 3: legitimate technical names still publish ──────────────────

test('legitimate technical / model / dimension names still pass the guard', () => {
  const legit = [
    'Карбюратор Honda Dio AF34',
    'Ремінь варіатора 669-18-30',
    'Амортизатор задній 340 мм',
    'Глушник Yamaha JOG 3KJ',
    'Свічка запалювання NGK BPR6HS',
    'Акумулятор 12V 9Ah AGM',
    'Вилка передня Viper Storm 150',
    'Замок запалювання 4 контакти',
    'Поршнева група 47 мм D=47',
    'Мастило 2Т 1л API TC',
    'Колодки гальмівні AMG 90×49×10',
    'Підшипник 6202-ZZ',
    'CRF 250 рама з документами',
    'Двигун 157QMJ 150cc 4Т',
  ]
  for (const name of legit) {
    assert.equal(
      canPublishToStorefront({ id: 'x', supplier_sku: 'S-1875', name_ua: name, name: null, source: 'supplier' }),
      true,
      `must publish legitimate name: ${name}`,
    )
  }
})

test('the guard is exactly the storefront listability predicate — it can never hide a listable product', () => {
  const rows = [
    { name_ua: 'Карбюратор Honda Dio AF34', supplier_sku: 'S-1' },
    { name_ua: '<>', supplier_sku: 'S-2' },
    { name_ua: '', supplier_sku: 'S-3' },
    { name_ua: 'Ремінь варіатора 669-18-30', supplier_sku: 'S-4' },
    { name_ua: 'S-5', supplier_sku: 'S-5' },
  ]
  for (const r of rows) {
    assert.equal(
      canPublishToStorefront({ id: 'x', source: 'supplier', name: null, ...r }),
      isPublicListableProduct(r),
      `guard must agree with the public list filter for ${JSON.stringify(r.name_ua)}`,
    )
  }
})

// ── Requirement 6: manual products are unaffected ────────────────────────────

test('source=manual rows are never blocked by the guard', () => {
  assert.equal(publishBlockReason({ id: 'm1', supplier_sku: null, name_ua: 'Мед квітковий 1л', name: null, source: 'manual' }), null)
  // Even a manual row the storefront filter would drop stays the operator's call.
  assert.equal(publishBlockReason({ id: 'm2', supplier_sku: null, name_ua: '<>', name: null, source: 'manual' }), null)
})

test('legacy supplier rows (source=null) are still guarded', () => {
  assert.equal(publishBlockReason({ id: 'l1', supplier_sku: 'SD-5220', name_ua: '<>', name: null, source: null }), 'unusable_name')
  assert.equal(publishBlockReason({ id: 'l2', supplier_sku: 'SD-1', name_ua: 'Карбюратор 4T 139QMB', name: null, source: null }), null)
})

test('partitionPublishCandidates splits rows and samples the blocked ones', () => {
  const rows = [
    { id: 'a', supplier_sku: 'S-1', name_ua: 'Карбюратор Honda Dio', name: null, source: 'supplier' },
    ...ARCHIVED_JUNK,
    { id: 'b', supplier_sku: 'S-2', name_ua: 'Глушник Yamaha JOG', name: null, source: 'manual' },
  ]
  const { publishable, blocked, blockedSamples } = partitionPublishCandidates(rows)
  assert.deepEqual(publishable.map((r) => r.id), ['a', 'b'])
  assert.equal(blocked.length, 2)
  assert.equal(blockedSamples.length, 2)
  assert.ok(blockedSamples.every((s) => s.reason === 'unusable_name'))
})

// ── DB-level behaviour with a fake Supabase client ───────────────────────────

function fakeClient(rows) {
  const products = rows.map((r) => ({ ...r }))
  const updates = [] // { ids, payload, requiredStatus }

  function from(table) {
    const preds = []
    let pending = null
    let selected = null
    const api = {
      select(cols, opts) {
        selected = cols
        api._count = opts?.count ?? null
        return api
      },
      eq(col, val) {
        preds.push((r) => r[col] === val)
        if (pending) {
          // .update(...).in(...).eq('status','draft')
          const ids = pending.ids.filter((id) => {
            const row = products.find((p) => p.id === id)
            return row && row.status === val
          })
          const done = { ids, payload: pending.payload, requiredStatus: val }
          updates.push(done)
          for (const id of ids) Object.assign(products.find((p) => p.id === id), pending.payload)
          pending = null
          return Promise.resolve({ error: null })
        }
        return api
      },
      not(col) { preds.push((r) => r[col] != null); return api },
      order() { return api },
      range(from_, to) { api._range = [from_, to]; return api },
      in(col, vals) {
        if (pending) { pending.ids = vals.slice(); return api }
        preds.push((r) => vals.includes(r[col]))
        return api
      },
      update(payload) { pending = { payload, ids: [] }; return api },
      then(resolve, reject) {
        if (pending) {
          // .update(...).in(...) with no trailing .eq — apply unconditionally
          const done = { ids: pending.ids.slice(), payload: pending.payload, requiredStatus: null }
          updates.push(done)
          for (const id of done.ids) Object.assign(products.find((p) => p.id === id), done.payload)
          pending = null
          return Promise.resolve({ error: null }).then(resolve, reject)
        }
        let out = products.filter((r) => preds.every((f) => f(r)))
        const count = out.length
        if (api._count === 'exact') return Promise.resolve({ data: null, count, error: null }).then(resolve, reject)
        if (api._range) out = out.slice(api._range[0], api._range[1] + 1)
        // Only expose the selected guard columns, mirroring PostgREST.
        if (typeof selected === 'string' && selected.includes('name_ua')) {
          out = out.map((r) => {
            const o = {}
            for (const c of selected.split(',').map((x) => x.trim())) o[c] = r[c] ?? null
            return o
          })
        }
        return Promise.resolve({ data: out, count, error: null }).then(resolve, reject)
      },
    }
    void table
    return api
  }
  return { from, _products: products, _updates: updates }
}


const draft = (over) => ({ status: 'draft', source: 'supplier', name: null, created_at: '2026-01-01', ...over })

test('publishAllCatalogProducts publishes good drafts and leaves junk-named ones as draft', async () => {
  const client = fakeClient([
    draft({ id: 'good-1', supplier_sku: 'S-1', name_ua: 'Карбюратор Honda Dio AF34' }),
    draft({ id: 'good-2', supplier_sku: 'S-2', name_ua: 'Ремінь варіатора 669-18-30' }),
    draft({ id: 'junk-1', supplier_sku: 'SD-5220', name_ua: '<>' }),
    draft({ id: 'junk-2', supplier_sku: '--10', name_ua: 'F0000000024' }),
    draft({ id: 'manual-1', supplier_sku: null, name_ua: 'Мед гречаний 0.5л', source: 'manual' }),
  ])

  const r = await publishAllCatalogProducts({ client })

  assert.equal(r.ok, true)
  assert.equal(r.updated, 3, 'two supplier products + one manual product')
  assert.equal(r.blockedUnusable, 2)
  const statusOf = (id) => client._products.find((p) => p.id === id).status
  assert.equal(statusOf('good-1'), 'published')
  assert.equal(statusOf('manual-1'), 'published')
  assert.equal(statusOf('junk-1'), 'draft', 'junk stays draft — never archived, never deleted')
  assert.equal(statusOf('junk-2'), 'draft')
  // Every publishing UPDATE is status-guarded.
  for (const u of client._updates) assert.equal(u.requiredStatus, 'draft')
})

test('publishDraftProducts (dry run and apply) reports and enforces the guard', async () => {
  const rows = [
    draft({ id: 'good-1', supplier_sku: 'S-1', name_ua: 'Глушник Yamaha JOG 3KJ' }),
    draft({ id: 'junk-1', supplier_sku: 'SD-5220', name_ua: '<>' }),
  ]
  const dry = await publishDraftProducts({ dryRun: true, client: fakeClient(rows) })
  assert.equal(dry.wouldPublish, 1)
  assert.equal(dry.blockedUnusable, 1)
  assert.equal(dry.published, 0)

  const client = fakeClient(rows)
  const applied = await publishDraftProducts({ client })
  assert.equal(applied.published, 1)
  assert.equal(applied.blockedUnusable, 1)
  assert.equal(client._products.find((p) => p.id === 'junk-1').status, 'draft')
})

// ── Requirements 4 & 5: archived rows are never revived ──────────────────────

test('archived products are never re-published by any publish path', async () => {
  const client = fakeClient([
    ...ARCHIVED_JUNK.map((j) => ({ ...j, status: 'archived', created_at: '2026-01-01' })),
    draft({ id: 'good-1', supplier_sku: 'S-1', name_ua: 'Амортизатор задній 340 мм' }),
  ])
  const r = await publishAllCatalogProducts({ client })
  assert.equal(r.updated, 1)
  for (const j of ARCHIVED_JUNK) {
    assert.equal(client._products.find((p) => p.id === j.id).status, 'archived', `${j.id} must stay archived`)
  }
})

test('the two known archived junk UUIDs stay non-public even if they were re-drafted', async () => {
  // Worst case: something flips them back to draft. The guard still refuses to
  // publish them, so they cannot return to the storefront or the sitemap.
  const client = fakeClient(ARCHIVED_JUNK.map((j) => ({ ...j, status: 'draft', created_at: '2026-01-01' })))
  const r = await publishAllCatalogProducts({ client })
  assert.equal(r.updated, 0)
  assert.equal(r.blockedUnusable, 2)
  for (const p of client._products) assert.equal(p.status, 'draft')
})

test('the guard column list carries everything the predicate needs', () => {
  for (const col of ['id', 'source', 'supplier_sku', 'name_ua', 'name']) {
    assert.ok(PUBLISH_GUARD_COLS.includes(col), `PUBLISH_GUARD_COLS must select ${col}`)
  }
})
