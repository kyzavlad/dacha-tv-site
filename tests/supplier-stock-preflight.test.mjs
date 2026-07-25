import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revalidateSupplierStock } from '../lib/cart/stock-revalidation.ts'
import { ordersToReconcile, decideReconciliation } from '../lib/supplier/reconcile.ts'

const NOW = Date.parse('2026-07-25T12:00:00.000Z')
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString()

function item(slug, name = slug) {
  return { productType: 'catalog', productSlug: slug, name }
}

// ── Freshness gate (fail closed) ──────────────────────────────────────────────

test('fresh supplier stock passes the freshness gate', () => {
  const r = revalidateSupplierStock({
    items: [item('a')],
    rows: [{ slug: 'a', source: 'supplier', supplier_sku: 'SKU-A', is_in_stock: true, stock_synced_at: hoursAgo(5) }],
    lookupFailed: false,
    maxStockAgeMs: 48 * 3600_000,
    now: NOW,
  })
  assert.deepEqual(r, { ok: true })
})

test('stale supplier stock (older than max age) fails closed as "stale"', () => {
  const r = revalidateSupplierStock({
    items: [item('a', 'Widget A')],
    rows: [{ slug: 'a', source: 'supplier', supplier_sku: 'SKU-A', is_in_stock: true, stock_synced_at: hoursAgo(72), name_ua: 'Віджет A' }],
    lookupFailed: false,
    maxStockAgeMs: 48 * 3600_000,
    now: NOW,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'stale')
  assert.deepEqual(r.names, ['Віджет A'])
})

test('null stock_synced_at on a forwarded supplier row fails closed as stale', () => {
  const r = revalidateSupplierStock({
    items: [item('a')],
    rows: [{ slug: 'a', source: 'supplier', supplier_sku: 'SKU-A', is_in_stock: true, stock_synced_at: null }],
    lookupFailed: false,
    maxStockAgeMs: 48 * 3600_000,
    now: NOW,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'stale')
})

test('manual / metal rows are NEVER subjected to the freshness gate', () => {
  const r = revalidateSupplierStock({
    items: [item('m')],
    // manual row, no supplier_sku → never forwarded → freshness irrelevant
    rows: [{ slug: 'm', source: 'manual', supplier_sku: null, is_in_stock: null, stock_synced_at: null }],
    lookupFailed: false,
    maxStockAgeMs: 48 * 3600_000,
    now: NOW,
  })
  assert.deepEqual(r, { ok: true })
})

test('out_of_stock takes precedence over stale', () => {
  const r = revalidateSupplierStock({
    items: [item('a', 'A')],
    rows: [{ slug: 'a', source: 'supplier', supplier_sku: 'SKU-A', is_in_stock: false, stock_synced_at: hoursAgo(72), name_ua: 'A' }],
    lookupFailed: false,
    maxStockAgeMs: 48 * 3600_000,
    now: NOW,
  })
  assert.equal(r.reason, 'out_of_stock')
})

test('maxStockAgeMs omitted → gate disabled (backwards compatible)', () => {
  const r = revalidateSupplierStock({
    items: [item('a')],
    rows: [{ slug: 'a', source: 'supplier', supplier_sku: 'SKU-A', is_in_stock: true, stock_synced_at: hoursAgo(999) }],
    lookupFailed: false,
  })
  assert.deepEqual(r, { ok: true })
})

// ── Reconciliation decision core ──────────────────────────────────────────────

test('ordersToReconcile keeps only forwarded, pollable orders and bounds the count', () => {
  const orders = [
    { id: '1', supplier_order_id: 'MC-1', supplier_order_status: 'sent' },
    { id: '2', supplier_order_id: 'MC-2', supplier_order_status: 'sent_unconfirmed' },
    { id: '3', supplier_order_id: null, supplier_order_status: 'sent' },       // no supplier id
    { id: '4', supplier_order_id: 'MC-4', supplier_order_status: 'skipped' },  // not forwarded
    { id: '5', supplier_order_id: 'MC-5', supplier_order_status: 'not_fulfilled' }, // already terminal
  ]
  const got = ordersToReconcile(orders, 10)
  assert.deepEqual(got.map((o) => o.id), ['1', '2'])
  assert.equal(ordersToReconcile(orders, 1).length, 1, 'respects the limit')
})

test('decideReconciliation escalates not_fulfilled / cancelled and preserves supplier id', () => {
  const order = { id: 'o1', supplier_order_id: 'MC-9', supplier_order_status: 'sent' }
  const bad = decideReconciliation(order, 'not_fulfilled')
  assert.equal(bad.needsAttention, true)
  assert.equal(bad.newSupplierStatus, 'not_fulfilled')
  assert.equal(bad.supplierOrderId, 'MC-9')

  const cancelled = decideReconciliation(order, 'cancelled')
  assert.equal(cancelled.needsAttention, true)

  for (const ok of ['fulfilled', 'shipped', 'processing', 'unknown']) {
    const d = decideReconciliation(order, ok)
    assert.equal(d.needsAttention, false, `${ok} must not escalate`)
    assert.equal(d.newSupplierStatus, null, `${ok} leaves status unchanged`)
    assert.equal(d.supplierOrderId, 'MC-9', 'supplier id always preserved')
  }
})
