import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseRecipientNames } from '../lib/supplier/recipient-name.ts'
import { buildPersonalCabOrderPayload, sendPersonalCabOrder } from '../lib/supplier/order.ts'

for (const firstName of ['Іван Коваль', '  Іван\u00a0Коваль  ', 'Iван Коваль']) {
  test(`exact autofill regression: ${firstName}`, () => {
    const value = normaliseRecipientNames({ firstName, lastName: 'Коваль' })
    assert.equal(value.ok, true)
    assert.equal(value.firstName, 'Іван')
    assert.equal(value.lastName, 'Коваль')
    assert.deepEqual(normaliseRecipientNames(value), value, 'normalisation must be idempotent')
  })
}
test('typography and mixed-script visual lookalikes preserve a Cyrillic name', () => {
  assert.equal(normaliseRecipientNames({ firstName: 'Cергіи\u0306', lastName: 'Коваль' }).firstName, 'Сергій')
  assert.equal(normaliseRecipientNames({ firstName: 'Мар’яна', lastName: 'Коваль\u2011Петренко' }).firstName, "Мар'яна")
  assert.equal(normaliseRecipientNames({ firstName: 'Анна-Марія', lastName: 'Коваль' }).ok, true)
})
for (const firstName of ['Ivan', 'Коваль Іван', 'Іван Петрович', 'Іван Коваль Інший', 'Сер\u200bгей', 'Сер\nгей', 'Сер\u202eгей', 'Sван']) {
  test(`ambiguous or non-Cyrillic data is rejected before forwarding: ${JSON.stringify(firstName)}`, () => {
    assert.equal(normaliseRecipientNames({ firstName, lastName: 'Коваль' }).ok, false)
  })
}
test('patronymic is validated without guessing or moving it between fields', () => {
  assert.equal(normaliseRecipientNames({ firstName: 'Іван', lastName: 'Коваль', patronymic: 'Ivanovich' }).ok, false)
  assert.equal(normaliseRecipientNames({ firstName: 'Іван', lastName: 'Коваль', patronymic: 'Петрович' }).patronymic, 'Петрович')
})
test('real failure shape reaches the vendor once with corrected name, same quantity, COD and price', async t => {
  const built = buildPersonalCabOrderPayload({ receiver_first_name: 'Iван Коваль', receiver_last_name: 'Коваль', receiver_phone: '+380671234567', method_payment: 'cashondelivery', location: 'fixture-warehouse', items: [{ supplier_sku: 'fixture-tyre', quantity: 1, price_uah: 1701 }] })
  assert.equal(built.ok, true)
  let calls = 0
  const old = { url: process.env.SUPPLIER_API_URL, key: process.env.SUPPLIER_API_KEY }
  process.env.SUPPLIER_API_URL = 'https://supplier.invalid'
  process.env.SUPPLIER_API_KEY = 'fixture'
  t.after(() => { for (const [k, v] of Object.entries({ SUPPLIER_API_URL: old.url, SUPPLIER_API_KEY: old.key })) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  t.mock.method(console, 'info', () => {})
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++
    const body = JSON.parse(init.body)
    assert.equal(body.receiver_first_name, 'Іван')
    assert.equal(body.receiver_last_name, 'Коваль')
    assert.equal(body.method_payment, 'cashondelivery')
    assert.deepEqual(body.products, [{ sku: 'fixture-tyre', qty: 1, price: 1701 }])
    return new Response(JSON.stringify({ success: 1, order_temporary_id: '900001' }))
  })
  assert.equal((await sendPersonalCabOrder(built.payload, { mode: 'live' })).order_id, '900001')
  assert.equal(calls, 1)
})
