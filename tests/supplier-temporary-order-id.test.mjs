import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendPersonalCabOrder, getPersonalCabOrderDetails } from '../lib/supplier/order.ts'

const payload = {
  receiver_first_name: 'Fixture', receiver_last_name: 'Order', receiver_phone: '+380671234567',
  method_payment: 'cashondelivery', location: 'fixture-warehouse',
  products: [{ sku: 'Z-89349', qty: 3, price: 145 }],
}

function mockSupplier(t, responses) {
  const saved = { url: process.env.SUPPLIER_API_URL, key: process.env.SUPPLIER_API_KEY }
  process.env.SUPPLIER_API_URL = 'https://supplier.invalid'
  process.env.SUPPLIER_API_KEY = 'fixture-key'
  t.after(() => {
    for (const [name, value] of [['SUPPLIER_API_URL', saved.url], ['SUPPLIER_API_KEY', saved.key]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
  const calls = []
  t.mock.method(console, 'info', () => {})
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: new URL(url), method: init?.method ?? 'GET' })
    assert.ok(responses.length > 0, 'an unexpected supplier request must fail the fixture')
    return new Response(JSON.stringify(responses.shift()), { status: 200 })
  })
  return calls
}

test('an accepted temporary ID survives submit and resolves to the final supplier order without a second POST', async t => {
  const calls = mockSupplier(t, [
    { success: 1, message: 'Order accepted', order_temporary_id: 900001, mode: 'live' },
    { Start_Order: { id: '900001', order_id: 'MC-26-900001' }, Transcript_Order: { incomplete: { line_incomplete: { article: 'Z-89349', qty: '3' } } } },
  ])
  const sent = await sendPersonalCabOrder(payload, { mode: 'live' })
  assert.equal(sent.ok, true)
  assert.equal(sent.confirmed, true)
  assert.equal(sent.order_id, '900001')
  const details = await getPersonalCabOrderDetails(sent.order_id)
  assert.equal(details.found, true)
  assert.equal(details.orders[0].order_id, 'MC-26-900001')
  assert.notEqual(details.orders[0].status, 'fulfilled')
  assert.deepEqual(calls.map(x => x.method), ['POST', 'GET'])
  assert.equal(calls[1].url.searchParams.get('id'), '900001')
})

for (const [name, response, expected] of [
  ['string temporary ID', { success: '1', order_temporary_id: '900001' }, '900001'],
  ['existing final ID', { success: 1, order_id: 'MC-26-900001' }, 'MC-26-900001'],
  ['empty response', {}, undefined],
  ['temporary ID without explicit acceptance', { order_temporary_id: 900001 }, undefined],
  ['explicit rejection', { success: 0, order_temporary_id: 900001 }, undefined],
  ['zero temporary ID', { success: 1, order_temporary_id: 0 }, undefined],
  ['non-ID temporary value', { success: 1, order_temporary_id: 'pending' }, undefined],
]) {
  test(name, async t => {
    const calls = mockSupplier(t, [response])
    const result = await sendPersonalCabOrder(payload, { mode: 'live' })
    assert.equal(result.order_id, expected)
    assert.equal(result.confirmed, expected !== undefined)
    assert.equal(calls.length, 1, 'submit never retries a supplier order')
    if (response.success === 0) assert.equal(result.ok, false)
  })
}
