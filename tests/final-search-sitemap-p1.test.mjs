import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  getAllSitemapIds,
  getSitemapUuidRange,
  sitemapUuidBoundary,
  SITEMAP_PRODUCT_SHARD_COUNT,
  SITEMAP_SHARD_ROW_LIMIT,
} from '../lib/catalog/sitemap-shards.ts'
import { splitSearchLookahead } from '../lib/catalog/public-search.ts'

const publicSearchSrc = readFileSync(new URL('../lib/catalog/public-search.ts', import.meta.url), 'utf8')
const searchPageSrc = readFileSync(new URL('../app/search/page.tsx', import.meta.url), 'utf8')
const searchApiSrc = readFileSync(new URL('../app/api/catalog/search/route.ts', import.meta.url), 'utf8')
const paginationSrc = readFileSync(new URL('../components/catalog/Pagination.tsx', import.meta.url), 'utf8')
const sitemapSrc = readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8')
const robotsSrc = readFileSync(new URL('../app/robots.ts', import.meta.url), 'utf8')
const shardSrc = readFileSync(new URL('../lib/catalog/sitemap-shards.ts', import.meta.url), 'utf8')

test('public search uses bounded page-size+1 lookahead and never exposes the sentinel row', () => {
  const rows = Array.from({ length: 25 }, (_, i) => i)
  const page = splitSearchLookahead(rows, 24)
  assert.equal(page.hasNext, true)
  assert.deepEqual(page.rows, Array.from({ length: 24 }, (_, i) => i))
  assert.ok(!page.rows.includes(24), 'lookahead row must never enter the visible page')

  const exact = splitSearchLookahead(rows.slice(0, 24), 24)
  assert.equal(exact.hasNext, false)
  assert.equal(exact.rows.length, 24)
})

test('production search path has no exact full count and surfaces authoritative query failures', () => {
  assert.ok(!publicSearchSrc.includes("count: 'exact'"), 'public search must not request an exact full count')
  assert.match(publicSearchSrc, /const lookaheadTo = from \+ CATALOG_PAGE_SIZE/)
  assert.match(publicSearchSrc, /\.range\(from, lookaheadTo\)/)
  assert.match(publicSearchSrc, /throw new Error\(`catalog search query failed:/)
  assert.ok(!searchPageSrc.includes('.catch(() => ({ products: [], total: 0 }))'))
  assert.match(searchPageSrc, /searchPublishedCatalogProductsFast/)
})

test('public search API shares the bounded path and does not hide DB failures as zero results', () => {
  assert.match(searchApiSrc, /searchPublishedCatalogProductsFast/)
  assert.ok(!searchApiSrc.includes('searchPublishedCatalogProducts,'), 'API must not import the legacy exact-count search')
  assert.ok(!searchApiSrc.includes('.catch(() => ({ products: [], total: 0 }))'))
  assert.match(searchApiSrc, /const \{ products, hasNext \} = await searchPublishedCatalogProductsFast/)
  assert.match(searchApiSrc, /hasMore: hasNext/)
  assert.match(searchApiSrc, /count: products\.length/)
})

test('search UI and pagination do not fabricate an unknown total or global ordinal range', () => {
  assert.ok(!searchPageSrc.includes('t.found('))
  assert.ok(!searchPageSrc.includes('pageOf: t.pageOf'))
  assert.ok(!searchPageSrc.includes('rangeFrom'))
  assert.ok(!searchPageSrc.includes('rangeTo'))
  assert.match(searchPageSrc, /t\.showing\(products\.length, hasNext\)/)
  assert.match(searchPageSrc, /На цій сторінці:/)
  assert.match(searchPageSrc, /На этой странице:/)
  assert.match(searchPageSrc, /On this page:/)
  assert.match(searchPageSrc, /hasNext=\{hasNext\}/)
  assert.match(searchPageSrc, /pageCurrent: t\.pageCurrent/)
  assert.match(paginationSrc, /total\?: number \| null/)
  assert.match(paginationSrc, /lastPage == null \? hasNext === true/)
  assert.match(paginationSrc, /lastPage == null \? l\.pageCurrent\(page\) : l\.pageOf\(page, lastPage\)/)
})

test('unknown-total search keeps a Previous path when a requested later page is empty', () => {
  assert.match(searchPageSrc, /page > 1 && \(/)
  assert.match(searchPageSrc, /hasNext=\{false\}/)
  assert.match(searchPageSrc, /params=\{paginationParams\}/)
})

test('UUID sitemap partition exposes exactly shard 0 plus 512 product shards', () => {
  assert.equal(SITEMAP_PRODUCT_SHARD_COUNT, 512)
  assert.equal(SITEMAP_SHARD_ROW_LIMIT, 1000)
  const ids = getAllSitemapIds()
  assert.equal(ids.length, 513)
  assert.equal(ids[0], 0)
  assert.equal(ids.at(-1), 512)
  assert.deepEqual(ids, Array.from({ length: 513 }, (_, i) => i))
})

test('UUID range boundaries cover the full space without gaps or overlaps', () => {
  assert.equal(sitemapUuidBoundary(0), '00000000-0000-0000-0000-000000000000')
  assert.equal(sitemapUuidBoundary(1), '00800000-0000-0000-0000-000000000000')
  assert.equal(sitemapUuidBoundary(2), '01000000-0000-0000-0000-000000000000')
  assert.equal(sitemapUuidBoundary(511), 'ff800000-0000-0000-0000-000000000000')
  assert.equal(sitemapUuidBoundary(512), null)

  const ranges = Array.from({ length: SITEMAP_PRODUCT_SHARD_COUNT }, (_, i) => getSitemapUuidRange(i))
  for (let i = 0; i < ranges.length - 1; i += 1) {
    assert.equal(ranges[i].upper, ranges[i + 1].lower, `gap/overlap between UUID buckets ${i} and ${i + 1}`)
    assert.ok(ranges[i].lower < ranges[i + 1].lower, `bucket ${i} must sort before bucket ${i + 1}`)
  }
  assert.equal(ranges[0].lower, '00000000-0000-0000-0000-000000000000')
  assert.equal(ranges.at(-1).upper, null)
})

test('product sitemap queries are range-bounded, one-snapshot lookahead, overflow-guarded and fail loudly', () => {
  assert.match(shardSrc, /\.gte\('id', range\.lower\)/)
  assert.match(shardSrc, /\.select\('slug, category_slug'\)/)
  assert.ok(!shardSrc.includes("count: 'exact'"), 'sitemap shards must not run exact counts against the large catalog')
  assert.ok(!shardSrc.includes('head: true'), 'sitemap overflow detection must stay in the rows query')
  assert.match(shardSrc, /\.limit\(SITEMAP_SHARD_ROW_LIMIT \+ 1\)/)
  assert.match(shardSrc, /rows\.length > SITEMAP_SHARD_ROW_LIMIT/)
  assert.match(shardSrc, /row\.category_slug \?\? 'all'/)
  assert.ok(!shardSrc.includes('.range(offset'))

  assert.match(sitemapSrc, /getPublishedCatalogSlugsForShard\(id\)/)
  assert.ok(!sitemapSrc.includes('getPublishedCatalogSlugsPage'))
  assert.ok(!sitemapSrc.includes('getPublishedCatalogProductCount'))
  assert.ok(!sitemapSrc.includes('getPublishedCatalogSlugsForShard(id).catch'))
})

test('robots and sitemap enumerate the exact same deterministic shard IDs', () => {
  assert.match(sitemapSrc, /getAllSitemapIds\(\)\.map\(\(id\) => \(\{ id \}\)\)/)
  assert.match(robotsSrc, /getAllSitemapIds\(\)\.map\(\(id\) => `\$\{BASE_URL\}\/sitemap\/\$\{id\}\.xml`\)/)
  assert.ok(!robotsSrc.includes('getPublishedCatalogProductCount'))
})
