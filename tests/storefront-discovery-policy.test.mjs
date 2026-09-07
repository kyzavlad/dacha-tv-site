import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isDiscoveryVisibleProduct } from '../lib/catalog/discovery.ts'

const supplier = {
  source: 'supplier',
  lead_type: null,
  supplier_sku: 'B-1194',
  supplier_product_id: '1194',
  is_in_stock: true,
  stock_quantity: 5,
}

test('supplier inventory is discoverable only with positive synced stock', () => {
  assert.equal(isDiscoveryVisibleProduct(supplier), true)
  assert.equal(isDiscoveryVisibleProduct({ ...supplier, is_in_stock: false, stock_quantity: 0 }), false)
  assert.equal(isDiscoveryVisibleProduct({ ...supplier, is_in_stock: true, stock_quantity: 0 }), false)
  assert.equal(isDiscoveryVisibleProduct({ ...supplier, is_in_stock: false, stock_quantity: 5 }), false)
})

test('manual/inquiry products are not hidden by supplier stock rules', () => {
  assert.equal(isDiscoveryVisibleProduct({
    source: 'manual', lead_type: 'metal', supplier_sku: null, supplier_product_id: null,
    is_in_stock: null, stock_quantity: null,
  }), true)
})

test('unknown non-supplier rows do not leak into public discovery', () => {
  assert.equal(isDiscoveryVisibleProduct({
    source: null, lead_type: null, supplier_sku: null, supplier_product_id: null,
    is_in_stock: null, stock_quantity: null,
  }), false)
})

test('Honda/scooter landing applies stock gates before pagination', () => {
  const src = readFileSync(new URL('../lib/catalog/scooter-discovery.ts', import.meta.url), 'utf8')
  assert.match(src, /\.eq\('is_in_stock', true\)/)
  assert.match(src, /\.gt\('stock_quantity', 0\)/)
  assert.ok(src.indexOf(".eq('is_in_stock', true)") < src.indexOf('.range(from, to)'))
})

test('public search and autocomplete use the same discovery policy', () => {
  const search = readFileSync(new URL('../lib/catalog/public-search.ts', import.meta.url), 'utf8')
  const suggest = readFileSync(new URL('../app/api/catalog/suggest/route.ts', import.meta.url), 'utf8')
  assert.match(search, /isDiscoveryVisibleProduct\(p\)/)
  assert.match(suggest, /searchPublishedCatalogProductsFast/)
  assert.ok(!suggest.includes('suggestCatalogProducts'))
})

test('product cards never request unavailable supplier images', () => {
  const card = readFileSync(new URL('../components/catalog/CatalogProductCard.tsx', import.meta.url), 'utf8')
  const guard = card.indexOf('if (!isDiscoveryVisibleProduct(product)) return null')
  const image = card.indexOf('const imageUrl = getCatalogProductImage(product)')
  assert.ok(guard >= 0 && image > guard)
})
