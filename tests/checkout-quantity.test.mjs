import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cartReducer, cartTotals } from '../lib/cart/CartContext.tsx'
import { buildPersonalCabOrderPayload } from '../lib/supplier/order.ts'

test('changing an existing checkout item from one to three preserves one line and forwards quantity three', () => {
  const original = { id: 'catalog-gasket', productType: 'catalog', productSlug: 'gasket', name: 'Gasket pair', price: 145, quantity: 1 }
  const state = cartReducer({ items: [original], isOpen: false }, { type: 'UPDATE_QTY', id: original.id, quantity: 3 })
  assert.equal(state.items.length, 1)
  assert.equal(state.items[0].quantity, 3)
  assert.equal(original.quantity, 1)
  assert.deepEqual(cartTotals(state.items), { totalItems: 3, totalPrice: 435 })
  const payload = buildPersonalCabOrderPayload({
    receiver_first_name: 'Тест', receiver_last_name: 'Фікстура', receiver_phone: '+380671234567',
    method_payment: 'cashondelivery', location: 'fixture-warehouse',
    items: state.items.map(item => ({ supplier_sku: 'Z-89349', quantity: item.quantity, price_uah: item.price })),
  })
  assert.equal(payload.ok, true)
  assert.deepEqual(payload.payload.products, [{ sku: 'Z-89349', qty: 3, price: 145 }])
})

test('the direct-buy checkout exposes guarded quantity edits before recipient fields', () => {
  const src = readFileSync(new URL('../app/checkout/page.tsx', import.meta.url), 'utf8')
  assert.ok(src.indexOf('{t.quantityLabel}') < src.indexOf('<form onSubmit={handleSubmit}'))
  assert.match(src, /value=\{item\.quantity\}/)
  assert.match(src, /updateQty\(item\.id, quantity\)/)
  assert.match(src, /Number\.isSafeInteger\(quantity\) && quantity >= 1/)
  assert.match(src, /disabled=\{submitting \|\| item\.quantity <= 1\}/)
})
