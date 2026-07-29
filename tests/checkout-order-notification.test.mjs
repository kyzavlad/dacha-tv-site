import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

// ─────────────────────────────────────────────────────────────────────────────
// submitProductOrder used to send the primary admin notification BEFORE stock
// validation and BEFORE the orders insert, so:
//   • the webhook payload carried order_id = null;
//   • every failed checkout (stale stock, out of stock, DB failure) emitted a
//     false "new order" alert.
// The alert now fires only after the order row is persisted, keyed on
// event_id = product_order_created:<persisted order id>.
//
// These tests drive the REAL server action with its module boundaries mocked,
// so they assert observable behaviour (orders stored, notifications sent),
// not source text.
// ─────────────────────────────────────────────────────────────────────────────

const abs = (rel) => fileURLToPath(new URL(rel, import.meta.url))

// Mutable per-scenario state. node:test allows a module to be mocked once per
// process, so the mocks below read from this object instead of being replaced.
const ctx = {
  stockRows: [],
  ordersInsertError: null,
  supplierMode: 'disabled',
  notifications: [],
  events: [],
  inserted: null,
}

function resetCtx(over = {}) {
  ctx.stockRows = []
  ctx.ordersInsertError = null
  ctx.supplierMode = 'disabled'
  ctx.notifications = []
  ctx.events = []
  ctx.inserted = { orders: [], order_items: [], inquiries: [] }
  Object.assign(ctx, over)
  return ctx
}

// ── Fake Supabase admin client ───────────────────────────────────────────────
function fakeClient() {
  return {
    from(table) {
      ctx.events.push(`from:${table}`)
      if (table === 'catalog_products') {
        return { select: () => ({ in: async () => ({ data: ctx.stockRows, error: null }) }) }
      }
      if (table === 'orders') {
        return {
          insert(row) {
            ctx.inserted.orders.push(row)
            ctx.events.push('insert:orders')
            return {
              select: () => ({
                single: async () =>
                  ctx.ordersInsertError
                    ? { data: null, error: ctx.ordersInsertError }
                    : { data: { id: 'order-uuid-0001' }, error: null },
              }),
            }
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      return {
        insert: async (row) => {
          ctx.inserted[table] ??= []
          ctx.inserted[table].push(row)
          ctx.events.push(`insert:${table}`)
          return { error: null }
        },
      }
    },
  }
}

mock.module(abs('../lib/supabase/admin.ts'), {
  namedExports: { getAdminClient: () => fakeClient() },
})
mock.module(abs('../lib/notify/order-notify.ts'), {
  namedExports: {
    sendOrderNotifications: async (opts) => {
      ctx.notifications.push(opts)
      ctx.events.push('notify')
      return { webhook: 'sent', telegram_fallback: 'skipped' }
    },
    formatNotifyLog: () => 'webhook=sent',
  },
})
mock.module(abs('../lib/supplier/order.ts'), {
  namedExports: {
    getSupplierOrderMode: () => ctx.supplierMode,
    detectTestOrderMarker: (fields) =>
      fields.some((f) => typeof f === 'string' && /тест|test/i.test(f)) ? 'ТЕСТ' : null,
    buildPersonalCabOrderPayload: () => ({ ok: true, payload: {} }),
    sendPersonalCabOrder: async () => ({
      ok: true, mode: 'test', confirmed: true, order_id: 'sup-1', message: 'ok', raw_response: null,
    }),
  },
})
mock.module(abs('../lib/runtime/request-cookies.ts'), {
  namedExports: { cookies: async () => ({ get: () => undefined }) },
})

const { submitProductOrder } = await import('../actions/submitProductOrder.ts')

// ── Fixtures ─────────────────────────────────────────────────────────────────

const freshRow = (slug) => ({
  slug,
  supplier_sku: `SKU-${slug}`,
  supplier_product_id: 1,
  source: 'supplier',
  lead_type: null,
  is_in_stock: true,
  stock_synced_at: new Date().toISOString(),
  name_ua: slug,
})

// Synced far outside SUPPLIER_STOCK_MAX_AGE_HOURS (default 48h).
const staleRow = (slug) => ({ ...freshRow(slug), stock_synced_at: '2020-01-01T00:00:00.000Z' })

function formOf(over = {}) {
  const fd = new FormData()
  const fields = {
    firstName: 'Іван',
    lastName: 'Петренко',
    phone: '+380671112233',
    methodPayment: 'cashondelivery',
    warehouseId: '42',
    warehouseName: 'Відділення №1',
    source: '/catalog',
    ...over,
  }
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v)
  return fd
}

const item = (slug = 'drill') => ({
  id: '1', productType: 'catalog', productSlug: slug, name: 'Дриль', price: 1000, quantity: 1,
})

// Only the primary order-created alert; supplier warnings are a separate event.
const orderCreated = () => ctx.notifications.filter((n) => n.payload?.type === 'product_order_received')

// ── 1. Stale stock → zero order notifications ────────────────────────────────

test('stale supplier stock → order blocked, ZERO order notifications', async () => {
  resetCtx({ stockRows: [staleRow('drill')] })
  const res = await submitProductOrder([item()], formOf())

  assert.equal(res.success, false, 'stale stock must block checkout')
  assert.equal(ctx.inserted.orders.length, 0, 'no order row may be created')
  assert.deepEqual(orderCreated(), [], 'no order notification may be sent')
  assert.deepEqual(ctx.notifications, [], 'no notification of any kind for a blocked checkout')
})

test('out-of-stock item → order blocked, ZERO order notifications', async () => {
  resetCtx({ stockRows: [{ ...freshRow('drill'), is_in_stock: false }] })
  const res = await submitProductOrder([item()], formOf())

  assert.equal(res.success, false)
  assert.equal(ctx.inserted.orders.length, 0)
  assert.deepEqual(ctx.notifications, [])
})

test('invalid checkout data → zero order notifications', async () => {
  resetCtx()
  const res = await submitProductOrder([item()], formOf({ phone: 'not-a-phone' }))

  assert.equal(res.success, false)
  assert.equal(ctx.inserted.orders.length, 0)
  assert.deepEqual(ctx.notifications, [], 'a rejected form must never notify')
})

test('failed orders insert → zero order-created notifications', async () => {
  resetCtx({
    stockRows: [freshRow('drill')],
    ordersInsertError: { code: '23505', message: 'duplicate key value' },
  })
  const res = await submitProductOrder([item()], formOf())

  assert.equal(res.success, false, 'a non-PGRST205 insert failure fails the checkout')
  assert.deepEqual(orderCreated(), [], 'a failed insert must not notify')
})

// ── 2. Successful live order → one stored order, one notification ────────────

test('successful live order → one stored order and exactly one notification', async () => {
  resetCtx({ stockRows: [freshRow('drill')] })
  const res = await submitProductOrder([item()], formOf())

  assert.equal(res.success, true)
  assert.equal(res.orderId, 'order-uuid-0001')
  assert.equal(res.isTestOrder, false)
  assert.equal(ctx.inserted.orders.length, 1, 'exactly one order row')

  const created = orderCreated()
  assert.equal(created.length, 1, 'exactly one order-created notification')
  assert.equal(created[0].eventId, 'product_order_created:order-uuid-0001')
  assert.equal(created[0].payload.order_id, 'order-uuid-0001')
  assert.notEqual(created[0].payload.order_id, null, 'order_id must never be null')
  assert.equal(created[0].payload.is_test_order, false)
  assert.match(created[0].message, /НОВЕ ЗАМОВЛЕННЯ З САЙТУ/)
  assert.doesNotMatch(created[0].message, /ТЕСТОВЕ/)
})

// ── 3. Successful test order → one stored order, one TEST notification ───────

test('successful test order → one stored order and one clearly marked TEST notification', async () => {
  resetCtx({ stockRows: [freshRow('drill')], supplierMode: 'live' })
  const res = await submitProductOrder([item()], formOf({ comment: 'тест, не відправляти' }))

  assert.equal(res.success, true)
  assert.equal(res.isTestOrder, true)
  assert.equal(ctx.inserted.orders.length, 1, 'a test order is still stored')

  const created = orderCreated()
  assert.equal(created.length, 1, 'exactly one order-created notification')
  assert.equal(created[0].eventId, 'product_order_created:order-uuid-0001')
  assert.equal(created[0].payload.order_id, 'order-uuid-0001')
  assert.equal(created[0].payload.is_test_order, true)
  assert.match(created[0].message, /🧪 ТЕСТОВЕ\/СЛУЖБОВЕ ЗАМОВЛЕННЯ/, 'must be clearly marked as a test')

  // …and still blocked from supplier forwarding.
  assert.match(
    ctx.inserted.orders[0].admin_notes ?? '',
    /заблоковано від надсилання постачальнику/,
    'a test order must be recorded as blocked from the supplier',
  )
})

// ── Ordering: the alert follows persistence ──────────────────────────────────

test('the notification is dispatched AFTER the order row is inserted', async () => {
  resetCtx({ stockRows: [freshRow('drill')] })
  await submitProductOrder([item()], formOf())

  const insertAt = ctx.events.indexOf('insert:orders')
  const notifyAt = ctx.events.indexOf('notify')
  assert.notEqual(insertAt, -1, 'the order row is written')
  assert.notEqual(notifyAt, -1, 'a notification is sent')
  assert.ok(notifyAt > insertAt, 'the notification must follow persistence')
})

test('stock revalidation runs before any notification', async () => {
  resetCtx({ stockRows: [freshRow('drill')] })
  await submitProductOrder([item()], formOf())

  const stockAt = ctx.events.indexOf('from:catalog_products')
  const notifyAt = ctx.events.indexOf('notify')
  assert.notEqual(stockAt, -1, 'stock is revalidated')
  assert.ok(notifyAt > stockAt, 'the notification must follow stock validation')
})
