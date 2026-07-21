import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStorefrontProduct, STOREFRONT_SCOPE_OR } from '../lib/supabase/catalog.ts'

test('source=supplier is included', () => {
  assert.equal(isStorefrontProduct({ source: 'supplier', lead_type: null }), true)
})

test('legacy source=NULL supplier row is included', () => {
  assert.equal(isStorefrontProduct({ source: null, lead_type: null }), true)
  assert.equal(isStorefrontProduct({}), true) // absent source treated as legacy supplier
})

test('manual + lead_type=metal is included', () => {
  assert.equal(isStorefrontProduct({ source: 'manual', lead_type: 'metal' }), true)
})

test('other manual products are excluded', () => {
  assert.equal(isStorefrontProduct({ source: 'manual', lead_type: 'natural_products' }), false)
  assert.equal(isStorefrontProduct({ source: 'manual', lead_type: null }), false)
})

test('the PostgREST scope clause encodes exactly this rule', () => {
  // supplier OR null OR (manual AND metal)
  assert.match(STOREFRONT_SCOPE_OR, /source\.eq\.supplier/)
  assert.match(STOREFRONT_SCOPE_OR, /source\.is\.null/)
  assert.match(STOREFRONT_SCOPE_OR, /and\(source\.eq\.manual,lead_type\.eq\.metal\)/)
})
