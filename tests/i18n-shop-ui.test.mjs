import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shopUiDict } from '../lib/i18n/sections/shop-ui.ts'

test('shopUiDict resolves every key to a non-empty string per locale', () => {
  for (const loc of ['uk', 'ru', 'en']) {
    const t = shopUiDict(loc)
    for (const [k, v] of Object.entries(t)) {
      assert.equal(typeof v, 'string', `${k} should resolve to a string`)
      assert.ok(v.length > 0, `${k} should be non-empty for ${loc}`)
    }
  }
})

test('search page body text differs across uk/ru/en', () => {
  const uk = shopUiDict('uk'), ru = shopUiDict('ru'), en = shopUiDict('en')
  const probes = ['searchTitle', 'searchPrompt', 'searchEmpty', 'searchContact']
  for (const key of probes) {
    assert.notEqual(uk[key], ru[key], `uk vs ru must differ: ${key}`)
    assert.notEqual(uk[key], en[key], `uk vs en must differ: ${key}`)
  }
})

test('checkout form labels and validation messages differ across locales', () => {
  const uk = shopUiDict('uk'), ru = shopUiDict('ru'), en = shopUiDict('en')
  const probes = [
    'checkoutTitle', 'recipientTitle', 'lastNameLabel', 'firstNameLabel', 'cyrillicHint',
    'phoneLabel', 'phonePlaceholder', 'phoneHint', 'phoneError',
    'paymentTitle', 'payCodLabel', 'payCodDesc', 'payPrepayLabel', 'payPrepayDesc', 'payLockedHint',
    'commentLabel', 'commentOptional', 'commentPlaceholder',
    'submit', 'submitting', 'afterSubmitNote',
  ]
  for (const key of probes) {
    assert.notEqual(uk[key], ru[key], `uk vs ru must differ: ${key}`)
    assert.notEqual(uk[key], en[key], `uk vs en must differ: ${key}`)
  }
})

test('warehouse (Nova Poshta) stock/search messages differ across locales', () => {
  const uk = shopUiDict('uk'), ru = shopUiDict('ru'), en = shopUiDict('en')
  const probes = [
    'warehouseLabel', 'warehousePlaceholder', 'warehouseAriaLabel', 'warehouseResultsAria',
    'warehouseShortHint', 'warehouseSearching', 'warehouseSlowHint', 'warehouseSelected',
    'warehouseErrSearch', 'warehouseNotFound', 'warehouseErrConnection', 'warehouseError',
  ]
  for (const key of probes) {
    assert.notEqual(uk[key], ru[key], `uk vs ru must differ: ${key}`)
    assert.notEqual(uk[key], en[key], `uk vs en must differ: ${key}`)
  }
})

test('order summary and info bullets differ across locales', () => {
  const uk = shopUiDict('uk'), ru = shopUiDict('ru'), en = shopUiDict('en')
  const probes = ['orderSummaryTitle', 'total', 'summaryNote', 'infoDelivery', 'infoPayment', 'infoCall']
  for (const key of probes) {
    assert.notEqual(uk[key], ru[key], `uk vs ru must differ: ${key}`)
    assert.notEqual(uk[key], en[key], `uk vs en must differ: ${key}`)
  }
})

test('cart drawer body text, empty state and aria-labels differ across locales', () => {
  const uk = shopUiDict('uk'), ru = shopUiDict('ru'), en = shopUiDict('en')
  const probes = [
    'cartTitle', 'cartCloseAria', 'cartEmpty', 'cartEmptyHint',
    'qtyDecrease', 'qtyIncrease', 'remove', 'checkout', 'continueShopping',
  ]
  for (const key of probes) {
    assert.notEqual(uk[key], ru[key], `uk vs ru must differ: ${key}`)
    assert.notEqual(uk[key], en[key], `uk vs en must differ: ${key}`)
  }
})

test('stock and pricing state labels differ across locales', () => {
  const uk = shopUiDict('uk'), ru = shopUiDict('ru'), en = shopUiDict('en')
  // cartItemOne ("товар") is a cognate identical in uk/ru; only its en value differs.
  assert.notEqual(uk.cartItemOne, en.cartItemOne)
  const probes = ['outOfStock', 'priceOnRequest', 'cartItemMany']
  for (const key of probes) {
    assert.notEqual(uk[key], ru[key], `uk vs ru must differ: ${key}`)
    assert.notEqual(uk[key], en[key], `uk vs en must differ: ${key}`)
  }
})

test('breadcrumb and success-screen strings are localized to specific known values', () => {
  assert.equal(shopUiDict('uk').crumbHome, 'Головна')
  assert.equal(shopUiDict('ru').crumbHome, 'Главная')
  assert.equal(shopUiDict('en').crumbHome, 'Home')
  assert.equal(shopUiDict('en').successTitle, 'Thank you for your order!')
  assert.equal(shopUiDict('ru').successBody, 'Ваш заказ принят и передан на комплектацию.')
})
