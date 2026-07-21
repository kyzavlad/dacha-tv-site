import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revalidateSupplierStock } from '../lib/cart/stock-revalidation.ts'

const supplierRow = (slug, over = {}) => ({ slug, source: 'supplier', is_in_stock: true, stock_synced_at: '2026-07-21', name_ua: slug, supplier_sku: 'SKU-' + slug, ...over })

test('no catalog items → always ok (honey/flowers pass through)', () => {
  const r = revalidateSupplierStock({ items: [{ productType: 'honey', productSlug: 'med' }], rows: [], lookupFailed: true })
  assert.deepEqual(r, { ok: true })
})

test('lookup failure with catalog items → blocks (fail closed)', () => {
  const r = revalidateSupplierStock({
    items: [{ productType: 'catalog', productSlug: 'a' }],
    rows: [], lookupFailed: true,
  })
  assert.deepEqual(r, { ok: false, reason: 'lookup_failed' })
})

test('missing catalog row → temporary validation error', () => {
  const r = revalidateSupplierStock({
    items: [{ productType: 'catalog', productSlug: 'gone', name: 'Ghost' }],
    rows: [], lookupFailed: false,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'missing')
  assert.deepEqual(r.names, ['Ghost'])
})

test('synced supplier row out of stock → blocks with names', () => {
  const r = revalidateSupplierStock({
    items: [{ productType: 'catalog', productSlug: 'a' }],
    rows: [supplierRow('a', { is_in_stock: false })],
    lookupFailed: false,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'out_of_stock')
  assert.deepEqual(r.names, ['a'])
})

test('in-stock supplier row → ok', () => {
  const r = revalidateSupplierStock({
    items: [{ productType: 'catalog', productSlug: 'a' }],
    rows: [supplierRow('a', { is_in_stock: true })],
    lookupFailed: false,
  })
  assert.deepEqual(r, { ok: true })
})

test('manual/metal rows are never blocked, even out of stock flags', () => {
  const r = revalidateSupplierStock({
    items: [{ productType: 'catalog', productSlug: 'metal-1' }],
    rows: [{ slug: 'metal-1', source: 'manual', lead_type: 'metal', is_in_stock: false, stock_synced_at: '2026-07-21', name_ua: 'Metal' }],
    lookupFailed: false,
  })
  assert.deepEqual(r, { ok: true })
})

test('unsynced supplier row (no stock signal) → ok (unknown, not blocked)', () => {
  const r = revalidateSupplierStock({
    items: [{ productType: 'catalog', productSlug: 'a' }],
    rows: [{ slug: 'a', source: 'supplier', is_in_stock: null, stock_synced_at: null }],
    lookupFailed: false,
  })
  assert.deepEqual(r, { ok: true })
})

test('missing takes precedence over out-of-stock when both present', () => {
  const r = revalidateSupplierStock({
    items: [
      { productType: 'catalog', productSlug: 'gone', name: 'Ghost' },
      { productType: 'catalog', productSlug: 'oos' },
    ],
    rows: [supplierRow('oos', { is_in_stock: false })],
    lookupFailed: false,
  })
  assert.equal(r.reason, 'missing')
})
