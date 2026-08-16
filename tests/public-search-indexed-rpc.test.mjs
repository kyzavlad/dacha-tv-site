import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const searchSrc = readFileSync(new URL('../lib/catalog/public-search.ts', import.meta.url), 'utf8')
const migrationSrc = readFileSync(
  new URL('../supabase/migrations/202608160935_public_catalog_search_rpc.sql', import.meta.url),
  'utf8',
)

test('public product text search uses the bounded indexed RPC instead of direct anon ILIKE', () => {
  assert.match(searchSrc, /\.rpc\('search_public_catalog_products_indexed'/)
  assert.match(searchSrc, /p_tokens: tokens/)
  assert.match(searchSrc, /p_offset: from/)
  assert.match(searchSrc, /p_limit: CATALOG_PAGE_SIZE \+ 1/)
  assert.match(searchSrc, /p_sort: sort/)
  assert.match(searchSrc, /p_buyable: buyable/)
  assert.match(searchSrc, /p_with_image: withImage/)
  assert.match(searchSrc, /splitSearchLookahead\(\(textData \?\? \[\]\) as CatalogProduct\[\]\)/)

  // Category-intent and SKU branches remain deliberately separate. The former
  // direct text branch (`let base = ...` + token-by-token `.or(...)`) must not
  // return, otherwise multi-token searches fall back behind the RLS barrier.
  assert.ok(!searchSrc.includes('let base = client\n    .from(\'catalog_products\')'))
  assert.ok(!searchSrc.includes('base = base.or(`name_ua.ilike.%${tok}%'))
})

test('indexed search RPC is read-only, bounded and enforces the public storefront boundary', () => {
  assert.match(migrationSrc, /returns setof public\.catalog_products/)
  assert.match(migrationSrc, /stable\s+security definer/i)
  assert.match(migrationSrc, /set row_security = off/i)
  assert.match(migrationSrc, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 100\)/)
  assert.match(migrationSrc, /cardinality\(v_tokens\) < 6/)
  assert.match(migrationSrc, /status = ''published''/)
  assert.match(migrationSrc, /source = ''supplier''/)
  assert.match(migrationSrc, /source is null and \(supplier_sku is not null or supplier_product_id is not null\)/)
  assert.match(migrationSrc, /source = ''manual'' and lead_type = ''metal''/)
  assert.match(migrationSrc, /price_uah >= 10 and is_price_suspicious is not true/)
  assert.match(migrationSrc, /main_image_url is not null or images is not null/)
  assert.match(migrationSrc, /format\(/)
  assert.match(migrationSrc, /%L/)
})

test('indexed search RPC exposes execute only to intended Supabase roles', () => {
  assert.match(migrationSrc, /revoke all on function public\.search_public_catalog_products_indexed[\s\S]*from public;/i)
  assert.match(migrationSrc, /grant execute on function public\.search_public_catalog_products_indexed[\s\S]*to anon, authenticated, service_role;/i)
  assert.ok(!/\binsert\b/i.test(migrationSrc), 'search RPC must not mutate catalog data')
  assert.ok(!/\bupdate\b/i.test(migrationSrc), 'search RPC must not mutate catalog data')
  assert.ok(!/\bdelete\b/i.test(migrationSrc), 'search RPC must not mutate catalog data')
})
