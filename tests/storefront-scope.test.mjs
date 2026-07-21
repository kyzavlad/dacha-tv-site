import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStorefrontProduct, STOREFRONT_SCOPE_OR } from '../lib/supabase/catalog.ts'

test('source=supplier is included', () => {
  assert.equal(isStorefrontProduct({ source: 'supplier', lead_type: null }), true)
})

test('legacy source=NULL row is included ONLY with supplier identity', () => {
  // Has supplier identity → genuine legacy supplier row → included.
  assert.equal(isStorefrontProduct({ source: null, supplier_sku: 'ABC-1' }), true)
  assert.equal(isStorefrontProduct({ source: null, supplier_product_id: 'uuid-1' }), true)
  // NULL source WITHOUT supplier identity → unknown legacy manual → EXCLUDED.
  assert.equal(isStorefrontProduct({ source: null, lead_type: null }), false)
  assert.equal(isStorefrontProduct({}), false)
  assert.equal(isStorefrontProduct({ source: null, supplier_sku: null, supplier_product_id: null }), false)
})

test('manual + lead_type=metal is included', () => {
  assert.equal(isStorefrontProduct({ source: 'manual', lead_type: 'metal' }), true)
})

test('other manual products are excluded', () => {
  assert.equal(isStorefrontProduct({ source: 'manual', lead_type: 'natural_products' }), false)
  assert.equal(isStorefrontProduct({ source: 'manual', lead_type: null }), false)
})

test('the PostgREST scope clause encodes exactly this rule', () => {
  // supplier OR (null AND has-supplier-identity) OR (manual AND metal)
  assert.match(STOREFRONT_SCOPE_OR, /source\.eq\.supplier/)
  assert.match(STOREFRONT_SCOPE_OR, /and\(source\.is\.null,or\(supplier_sku\.not\.is\.null,supplier_product_id\.not\.is\.null\)\)/)
  assert.match(STOREFRONT_SCOPE_OR, /and\(source\.eq\.manual,lead_type\.eq\.metal\)/)
})
