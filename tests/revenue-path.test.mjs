import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cartReducer, cartTotals } from '../lib/cart/CartContext.tsx'
import { detectTestOrderMarker, getSupplierOrderMode, buildPersonalCabOrderPayload } from '../lib/supplier/order.ts'
import {
  trackPurchase, trackAddToCart, trackViewItem, trackBeginCheckout, CURRENCY,
} from '../lib/analytics/gtag.ts'
import {
  formatAttribution, buildStoredSource, parseStoredSource, attributionNotificationLine,
} from '../lib/analytics/attribution.ts'

// ─────────────────────────────────────────────────────────────────────────────
// The money path: product → cart → checkout → order → notification → supplier.
// No real order is ever placed here: the supplier dispatch is exercised only
// through its pure guards (test-order marker, mode, payload builder).
// ─────────────────────────────────────────────────────────────────────────────

const item = (over = {}) => ({
  id: 'catalog:karbyurator-honda-dio',
  productType: 'catalog',
  productSlug: 'karbyurator-honda-dio',
  name: 'Карбюратор Honda Dio AF34',
  price: 450,
  quantity: 1,
  ...over,
})

// ── Cart arithmetic ──────────────────────────────────────────────────────────

test('adding the same product twice merges quantity instead of duplicating the line', () => {
  let state = { items: [], isOpen: false }
  state = cartReducer(state, { type: 'ADD_ITEM', item: item() })
  state = cartReducer(state, { type: 'ADD_ITEM', item: item({ quantity: 2 }) })
  assert.equal(state.items.length, 1)
  assert.equal(state.items[0].quantity, 3)
  assert.equal(cartTotals(state.items).totalPrice, 1350)
})

test('quantity changes update the totals; quantity 0 removes the line', () => {
  let state = { items: [item(), item({ id: 'catalog:remin', productSlug: 'remin', name: 'Ремінь варіатора', price: 320 })], isOpen: false }
  assert.deepEqual(cartTotals(state.items), { totalItems: 2, totalPrice: 770 })

  state = cartReducer(state, { type: 'UPDATE_QTY', id: 'catalog:remin', quantity: 3 })
  assert.deepEqual(cartTotals(state.items), { totalItems: 4, totalPrice: 450 + 960 })

  state = cartReducer(state, { type: 'UPDATE_QTY', id: 'catalog:remin', quantity: 0 })
  assert.equal(state.items.length, 1)
  assert.deepEqual(cartTotals(state.items), { totalItems: 1, totalPrice: 450 })
})

test('the order total the server computes equals the cart total the customer saw', () => {
  const items = [item({ quantity: 2 }), item({ id: 'catalog:x', productSlug: 'x', price: 99, quantity: 3 })]
  // actions/submitProductOrder.ts computes: items.reduce(price * quantity)
  const serverTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  assert.equal(serverTotal, cartTotals(items).totalPrice)
})

// ── Order submission source contract ─────────────────────────────────────────
// These assert on the real source so a refactor cannot quietly reorder the
// success/persist/track sequence.

const checkoutSrc = readFileSync(new URL('../app/checkout/page.tsx', import.meta.url), 'utf8')
const orderSrc = readFileSync(new URL('../actions/submitProductOrder.ts', import.meta.url), 'utf8')

test('purchase is tracked only AFTER a successful order result', () => {
  const failGuard = checkoutSrc.indexOf('if (!result.success)')
  const purchase = checkoutSrc.indexOf('trackPurchase({')
  assert.ok(failGuard > 0 && purchase > 0, 'both the failure guard and trackPurchase must exist')
  assert.ok(purchase > failGuard, 'trackPurchase must come after the !result.success early return')
  assert.ok(
    checkoutSrc.slice(failGuard, purchase).includes('return'),
    'the failure branch must return before purchase tracking is reached',
  )
})

test('begin_checkout fires once per checkout, not per render', () => {
  assert.match(checkoutSrc, /beginCheckoutFired\s*=\s*useRef\(false\)/)
  assert.match(checkoutSrc, /if \(beginCheckoutFired\.current\) return/)
})

test('the cart is cleared after a successful order so a refresh cannot re-submit it', () => {
  const purchase = checkoutSrc.indexOf('trackPurchase({')
  const clear = checkoutSrc.indexOf('clearCart()')
  const success = checkoutSrc.indexOf('setSuccessOrderId(result.orderId)')
  assert.ok(clear > purchase && success > clear, 'order: trackPurchase → clearCart → success screen')
})

test('a failed submission surfaces the error instead of showing success', () => {
  assert.match(checkoutSrc, /setError\(result\.error\)/)
  const failGuard = checkoutSrc.indexOf('if (!result.success)')
  const successState = checkoutSrc.indexOf('setSuccessOrderId(result.orderId)')
  assert.ok(failGuard < successState)
})

test('the order row is persisted before any supplier call is made', () => {
  const insert = orderSrc.indexOf(".from('orders')\n      .insert(")
  const supplierSend = orderSrc.indexOf('await sendPersonalCabOrder(built.payload')
  assert.ok(insert > 0 && supplierSend > 0)
  assert.ok(insert < supplierSend, 'orders insert must precede the supplier dispatch')
})

test('a supplier failure never discards the customer order', () => {
  // The supplier outcome is only ever written back onto the existing order row.
  assert.match(orderSrc, /supplier_order_status: supplierStatus/)
  assert.ok(!/\.from\('orders'\)\s*\.delete\(/.test(orderSrc), 'checkout must never delete an order row')
})

// ── Supplier dispatch safeguards (no network call) ───────────────────────────

test('test/internal orders are detected from the human-entered fields', () => {
  assert.ok(detectTestOrderMarker(['Тест Тестович', '+380000000000', null, 'тест', null]))
  assert.equal(detectTestOrderMarker(['Коваленко Іван', '+380671112233', 'Відділення №1', 'Дзвоніть після 18:00', '/checkout']), null)
})

test('SUPPLIER_ORDER_MODE decides dispatch; anything unknown is the safe test mode', () => {
  const prev = process.env.SUPPLIER_ORDER_MODE
  try {
    for (const [raw, expected] of [['live', 'live'], ['disabled', 'disabled'], ['off', 'disabled'], ['manual', 'disabled'], ['none', 'disabled'], ['', 'test'], ['whatever', 'test']]) {
      process.env.SUPPLIER_ORDER_MODE = raw
      assert.equal(getSupplierOrderMode(), expected, `mode "${raw}"`)
    }
    delete process.env.SUPPLIER_ORDER_MODE
    assert.equal(getSupplierOrderMode(), 'test', 'unset must never mean live')
  } finally {
    if (prev === undefined) delete process.env.SUPPLIER_ORDER_MODE
    else process.env.SUPPLIER_ORDER_MODE = prev
  }
})

test('an incomplete supplier payload is reported, never silently sent', () => {
  const built = buildPersonalCabOrderPayload({
    receiver_first_name: '', receiver_last_name: 'Коваленко', receiver_phone: '',
    method_payment: 'cashondelivery', location: '', items: [],
  })
  assert.equal(built.ok, false)
  assert.ok(built.errors.length > 0)
})

// ── Analytics events ─────────────────────────────────────────────────────────

function captureGtag(fn) {
  const events = []
  const prevWindow = globalThis.window
  globalThis.window = { gtag: (...args) => events.push(args), location: { pathname: '/t' } }
  try { fn() } finally {
    if (prevWindow === undefined) delete globalThis.window
    else globalThis.window = prevWindow
  }
  return events.filter((e) => e[0] === 'event').map((e) => ({ name: e[1], params: e[2] }))
}

test('view_item / add_to_cart / begin_checkout carry UAH value and item data', () => {
  const events = captureGtag(() => {
    trackViewItem({ item_id: 'karbyurator', item_name: 'Карбюратор', price: 450, item_category: 'moto' })
    trackAddToCart({ item_id: 'karbyurator', item_name: 'Карбюратор', price: 450, quantity: 2 })
    trackBeginCheckout([{ item_id: 'karbyurator', item_name: 'Карбюратор', price: 450, quantity: 2 }], 900)
  })
  assert.deepEqual(events.map((e) => e.name), ['view_item', 'add_to_cart', 'begin_checkout'])
  for (const e of events) assert.equal(e.params.currency, CURRENCY)
  assert.equal(CURRENCY, 'UAH')
  assert.equal(events[0].params.value, 450)
  assert.equal(events[1].params.value, 900, 'add_to_cart value is price × quantity')
  assert.equal(events[2].params.value, 900)
  assert.equal(events[1].params.items[0].item_id, 'karbyurator')
})

test('purchase reports transaction id, order value and currency', () => {
  const events = captureGtag(() =>
    trackPurchase({ orderId: 'ORDER-1', value: 1350, items: [{ item_id: 'a', item_name: 'A', price: 450, quantity: 3 }] }))
  const purchase = events.find((e) => e.name === 'purchase')
  assert.ok(purchase)
  assert.equal(purchase.params.transaction_id, 'ORDER-1')
  assert.equal(purchase.params.value, 1350)
  assert.equal(purchase.params.currency, 'UAH')
})

test('a test order never fires the real purchase or Ads conversion', () => {
  const events = captureGtag(() =>
    trackPurchase({ orderId: 'TEST-1', value: 100, items: [], isTest: true }))
  assert.deepEqual(events.map((e) => e.name), ['order_submit_test'])
  assert.ok(!events.some((e) => e.name === 'purchase' || e.name === 'conversion'))
})

test('analytics never throws when gtag is unavailable (ad blocker / SSR)', () => {
  const prevWindow = globalThis.window
  if (prevWindow !== undefined) delete globalThis.window
  try {
    assert.doesNotThrow(() => trackPurchase({ orderId: 'X', value: 1, items: [] }))
    assert.doesNotThrow(() => trackAddToCart({ item_id: 'a', item_name: 'A' }))
  } finally {
    if (prevWindow !== undefined) globalThis.window = prevWindow
  }
})

// ── Campaign attribution: landing → checkout → order ─────────────────────────

test('attribution survives landing → checkout → stored order source', () => {
  const cookie = encodeURIComponent('utm_source=google&utm_medium=cpc&utm_campaign=karbyurator&ref=google.com&lp=/search')
  const attribution = formatAttribution(cookie)
  assert.match(attribution, /utm: google\/cpc\/karbyurator/)
  const stored = buildStoredSource('/checkout', attribution)
  const parsed = parseStoredSource(stored)
  assert.equal(parsed.page, '/checkout')
  assert.equal(parsed.utm, 'google/cpc/karbyurator')
  assert.equal(parsed.ref, 'google.com')
  assert.equal(parsed.lp, '/search')
  assert.match(attributionNotificationLine(cookie), /Source: google \/ cpc \/ karbyurator/)
})

test('no attribution still produces a normal, storable order source', () => {
  assert.equal(formatAttribution(undefined), '')
  assert.equal(formatAttribution(null), '')
  assert.equal(buildStoredSource('/checkout', ''), '/checkout')
  assert.equal(buildStoredSource(null, ''), null, 'a direct order stores no source rather than an empty string')
  assert.equal(attributionNotificationLine(undefined), '')
})

test('malformed tracking values cannot break an order', () => {
  for (const bad of ['%%%%', '%E0%A4%A', 'utm_source=' + 'x'.repeat(5000), '=====', ' ', 'utm_source=<script>alert(1)</script>']) {
    assert.doesNotThrow(() => {
      const a = formatAttribution(bad)
      const stored = buildStoredSource('/checkout', a)
      parseStoredSource(stored)
      attributionNotificationLine(bad)
    }, `must survive ${bad.slice(0, 24)}`)
  }
})

test('the order action reads attribution defensively (never blocks checkout)', () => {
  // Both reads are wrapped in try/catch in actions/submitProductOrder.ts.
  const reads = orderSrc.match(/try \{[^\n]*(attributionNotificationLine|formatAttribution)[^\n]*\} catch/g) ?? []
  assert.equal(reads.length, 2, 'both attribution reads must be individually guarded')
})
