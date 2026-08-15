import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildPersonalCabOrderPayload } from '../lib/supplier/order.ts'

const checkoutSrc = readFileSync(new URL('../app/checkout/page.tsx', import.meta.url), 'utf8')
const shopUiSrc = readFileSync(new URL('../lib/i18n/sections/shop-ui.ts', import.meta.url), 'utf8')

test('supplier payload preserves prepayment exactly', () => {
  const result = buildPersonalCabOrderPayload({
    receiver_first_name: 'Влад',
    receiver_last_name: 'Кузьменко',
    receiver_phone: '+380951444853',
    method_payment: 'prepayment',
    location: '1AE7D725-103E-11E5-ADD9-005056887B8D',
    items: [{ supplier_sku: 'P-6395', quantity: 1, price_uah: 10 }],
    comments: 'safe unit test',
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.payload.method_payment, 'prepayment')
})

test('cash on delivery remains the checkout default while prepayment is selectable', () => {
  assert.match(
    checkoutSrc,
    /useState<'cashondelivery' \| 'prepayment'>\('cashondelivery'\)/,
  )
  assert.match(checkoutSrc, /value: 'prepayment'/)
  assert.match(checkoutSrc, /onChange=\{\(\) => setMethodPayment\(opt\.value\)\}/)
})

test('supplier items no longer disable or reset prepayment', () => {
  assert.ok(!checkoutSrc.includes('hasSupplierItems'), 'old supplier prepayment lock must be removed')
  assert.ok(!checkoutSrc.includes('lockedOut'), 'prepayment radio must not be disabled for supplier items')
  assert.ok(!checkoutSrc.includes('payLockedHint'), 'checkout must not display the obsolete locked hint')
})

test('customer copy describes manager-confirmed prepayment without claiming online card payment', () => {
  assert.match(shopUiSrc, /Оплата до відправки після підтвердження менеджером/)
  assert.match(shopUiSrc, /Оплата до отправки после подтверждения менеджером/)
  assert.match(shopUiSrc, /Ваше замовлення прийнято в обробку\./)
  assert.match(shopUiSrc, /Ваш заказ принят в обработку\./)
})
