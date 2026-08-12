import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assessAdReadiness, rankClusters, clusterLandingPath,
  AD_READY_MIN_IN_STOCK, AD_READY_MIN_BUYABLE, AD_READY_MIN_SEARCHES_30,
} from '../lib/catalog/ad-readiness.ts'
import {
  classifyUaSeoRow, summarizeUaBacklog, missingUaFields, UA_BACKLOG_COLS,
} from '../lib/catalog/seo-backlog.ts'

// ── Paid-search readiness ────────────────────────────────────────────────────

const supply = (over = {}) => ({ matched: 500, inStock: 300, buyable: 280, ...over })
const demand = (searches30 = 25) => ({ searches30, searches7: Math.round(searches30 / 4) })

test('a cluster with demand, stock and priced inventory is ad-ready', () => {
  const r = assessAdReadiness('карбюратор', demand(), supply())
  assert.equal(r.ready, true)
  assert.deepEqual(r.blockers, [])
  assert.equal(r.landingPath, `/search?q=${encodeURIComponent('карбюратор')}&buyable=1`)
})

test('the ad landing page always carries the buyable filter', () => {
  // A paid click must land on products that show a price and can be bought.
  assert.ok(clusterLandingPath('ремень вариатора').endsWith('&buyable=1'))
})

test('no matching products blocks the cluster', () => {
  const r = assessAdReadiness('чого немає', demand(), supply({ matched: 0, inStock: 0, buyable: 0 }))
  assert.equal(r.ready, false)
  assert.deepEqual(r.blockers, ['no_matching_products'])
})

test('thin stock or thin priced inventory blocks the cluster', () => {
  const thinStock = assessAdReadiness('вилка', demand(), supply({ inStock: AD_READY_MIN_IN_STOCK - 1 }))
  assert.equal(thinStock.ready, false)
  assert.ok(thinStock.blockers.includes('insufficient_stock'))

  const thinPrice = assessAdReadiness('вилка', demand(), supply({ buyable: AD_READY_MIN_BUYABLE - 1 }))
  assert.equal(thinPrice.ready, false)
  assert.ok(thinPrice.blockers.includes('insufficient_priced_inventory'))
})

test('a query nobody searches is not promoted on inventory alone', () => {
  const r = assessAdReadiness('щось', { searches30: AD_READY_MIN_SEARCHES_30 - 1 }, supply())
  assert.equal(r.ready, false)
  assert.ok(r.blockers.includes('no_demand'))
})

test('ranking puts ad-ready clusters first, then higher demand × sellable supply', () => {
  const rows = [
    { query: 'вилка', demand: demand(40), supply: supply({ inStock: 5, buyable: 5 }), readiness: null },
    { query: 'карбюратор', demand: demand(30), supply: supply({ inStock: 700, buyable: 690 }), readiness: null },
    { query: 'варіатор', demand: demand(35), supply: supply({ inStock: 520, buyable: 500 }), readiness: null },
  ].map((r) => ({ ...r, readiness: assessAdReadiness(r.query, r.demand, r.supply) }))

  const ranked = rankClusters(rows)
  assert.equal(ranked[0].readiness.ready, true)
  assert.equal(ranked.at(-1).query, 'вилка', 'a cluster without sellable stock ranks last')
  assert.deepEqual(ranked.slice(0, 2).map((r) => r.query), ['варіатор', 'карбюратор'])
})

test('the readiness score is a ranking signal only — never a performance forecast', () => {
  const src = readFileSync(new URL('../lib/catalog/ad-readiness.ts', import.meta.url), 'utf8')
  assert.match(src, /NOT a CTR\/CPA\/ROAS estimate/)
})

// ── Actionable UA SEO backlog ────────────────────────────────────────────────

const complete = {
  supplier_sku: 'S-1', name_ua: 'Карбюратор Honda Dio AF34', name: null, source: 'supplier',
  meta_title: 'Карбюратор Honda Dio AF34 — купити', meta_description: 'Опис для пошуку довжиною достатньою.',
  description_ua: 'Довгий опис товару українською.', seo_status: 'ai', seo_manual_lock: false,
}

test('a fully filled published product is complete', () => {
  assert.equal(classifyUaSeoRow(complete), 'complete')
  assert.deepEqual(missingUaFields(complete), [])
})

test('a supplier row missing a UA field is real, actionable backlog', () => {
  assert.equal(classifyUaSeoRow({ ...complete, description_ua: null }), 'actionable_supplier')
  assert.equal(classifyUaSeoRow({ ...complete, meta_title: '   ' }), 'actionable_supplier')
  assert.deepEqual(missingUaFields({ ...complete, meta_title: '', description_ua: null }), ['meta_title', 'description_ua'])
})

test('a manual Dacha TV product without description_ua is an exception, not backlog', () => {
  const manual = { ...complete, source: 'manual', seo_status: 'manual', description_ua: null }
  assert.equal(classifyUaSeoRow(manual), 'manual_exception')
})

test('a human-locked row is never counted as backlog', () => {
  assert.equal(classifyUaSeoRow({ ...complete, seo_manual_lock: true, description_ua: null }), 'manual_locked')
})

test('sheet/manual SEO status is treated as human-owned', () => {
  assert.equal(classifyUaSeoRow({ ...complete, seo_status: 'sheet', description_ua: null }), 'manual_exception')
})

test('a row with an unusable public name is malformed, not an SEO task', () => {
  assert.equal(classifyUaSeoRow({ ...complete, name_ua: '<>', name: null, description_ua: null }), 'malformed')
  assert.equal(classifyUaSeoRow({ ...complete, name_ua: '', name: '', meta_title: null }), 'malformed')
})

test('summarizeUaBacklog reports actionable work separately from exceptions', () => {
  const rows = [
    complete,
    { ...complete, description_ua: null },                                   // actionable
    { ...complete, meta_description: null },                                 // actionable
    { ...complete, source: 'manual', description_ua: null },                 // exception
    { ...complete, seo_manual_lock: true, description_ua: null },            // locked
    { ...complete, name_ua: '<>', name: null, description_ua: null },        // malformed
  ]
  const s = summarizeUaBacklog(rows)
  assert.equal(s.total, 6)
  assert.equal(s.complete, 1)
  assert.equal(s.actionable_supplier, 2)
  assert.equal(s.manual_exception, 1)
  assert.equal(s.manual_locked, 1)
  assert.equal(s.malformed, 1)
  assert.equal(s.actionable, 2, 'only genuine supplier gaps count as work')
})

test('the backlog column list carries every field the classifier reads', () => {
  for (const col of ['source', 'supplier_sku', 'name_ua', 'name', 'meta_title', 'meta_description', 'description_ua', 'seo_status', 'seo_manual_lock']) {
    assert.ok(UA_BACKLOG_COLS.includes(col), `UA_BACKLOG_COLS must select ${col}`)
  }
})

// ── The audit script itself ──────────────────────────────────────────────────

const auditSrc = readFileSync(new URL('../scripts/growth-readiness-audit.mjs', import.meta.url), 'utf8')

test('the growth audit is read-only — it never writes to the catalog', () => {
  for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
    assert.ok(!auditSrc.includes(forbidden), `audit must not call ${forbidden}`)
  }
})

test('the growth audit checks the archived junk products in both sitemap and DB', () => {
  assert.match(auditSrc, /--10/)
  assert.match(auditSrc, /SD-5220/)
  assert.match(auditSrc, /archived junk products absent from sitemap/)
  assert.match(auditSrc, /archived junk products are non-public/)
})

test('the growth audit fails the process only on real blockers', () => {
  assert.match(auditSrc, /process\.exit\(counts\.fail > 0 \? 1 : 0\)/)
})

test('the growth audit samples at least 20 products across categories and checks both locales', () => {
  assert.match(auditSrc, /Math\.max\(Number\(flag\('products', 20\)\) \|\| 20, 20\)/)
  assert.match(auditSrc, /product\(ru\)/)
  assert.match(auditSrc, /hreflang\(html, 'uk'\)/)
  assert.match(auditSrc, /hreflang\(html, 'ru'\)/)
})
