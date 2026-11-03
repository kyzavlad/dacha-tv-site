import test from 'node:test'
import assert from 'node:assert/strict'
import { searchWarehouses, searchNovaPoshtaWarehouses } from '../lib/supplier/warehouses.ts'

const rows = [
  ...Array.from({ length: 40 }, (_, i) => ({ internal_id: `kyiv-${i + 1}`, city_name: 'Киев', name: `Отделение №${i + 1}`, address: `${i + 1} ул. Тестовая` })),
  { internal_id: 'kyiv-4428', city_name: 'Киев', name: 'Почтомат №4428', address: '4428 ул. Примерная, 9' },
  { internal_id: 'kyiv-14428', city_name: 'Киев', name: 'Почтомат №14428', address: '14428 ул. Примерная, 10' },
  { internal_id: 'other-4428', city_name: 'Львов', name: 'Почтомат №4428', address: '4428 ул. Примерная, 9' },
  { internal_id: 'prefix-city-4428', city_name: 'Київка', name: 'Почтомат №4428', address: '4428 вул. Тестова' },
]

test('buyer city + branch query finds the exact branch before the 30-result limit', () => {
  for (const query of ['киев 4428', 'Київ 4428', 'Київ №4428', 'Киев, отделение 4428']) {
    assert.deepEqual(searchWarehouses(rows, query).map(x => x.internal_id), ['kyiv-4428'], query)
  }
})

test('ignored supplier filter is handled while decoding split UTF-8 and escaped JSON strings', async () => {
  const previousFetch = globalThis.fetch
  process.env.SUPPLIER_API_URL = 'https://supplier.example.test/api'
  process.env.SUPPLIER_API_KEY = 'synthetic-key'
  const bytes = new TextEncoder().encode(JSON.stringify({ data: [
    { internal_id: 'foreign', city: 'Львов', name: '№700', address: '700 вул. Інша' },
    { internal_id: 'odesa-700', city: 'Одесса', city_ua: 'Одеса', name: 'Поштомат "{тест}" №700', address_ua: '700 вул. Приклад', wnum: '700' },
  ] }))
  globalThis.fetch = async () => {
    let i = 0
    const response = new Response(new ReadableStream({ pull(controller) {
      if (i >= bytes.length) return controller.close()
      controller.enqueue(bytes.slice(i, i += 3))
    } }))
    response.json = async () => { throw new Error('Full-response JSON parsing is forbidden') }
    return response
  }
  try {
    const result = await searchNovaPoshtaWarehouses('Одеса 700')
    assert.equal(result.length, 1)
    assert.equal(result[0].internal_id, 'odesa-700')
    assert.equal(result[0].city, 'Одеса')
    assert.equal(result[0].address, '700 вул. Приклад')
  } finally {
    globalThis.fetch = previousFetch
    delete process.env.SUPPLIER_API_URL
    delete process.env.SUPPLIER_API_KEY
  }
})

test('truncated supplier stream fails explicitly instead of caching an incomplete list', async () => {
  const previousFetch = globalThis.fetch
  process.env.SUPPLIER_API_URL = 'https://supplier.example.test/api'
  process.env.SUPPLIER_API_KEY = 'synthetic-key'
  globalThis.fetch = async () => new Response('[{"internal_id":"broken","city":"Тернопіль"}')
  try {
    await assert.rejects(searchNovaPoshtaWarehouses('Тернопіль 11'), /Incomplete warehouse response/)
  } finally {
    globalThis.fetch = previousFetch
    delete process.env.SUPPLIER_API_URL
    delete process.env.SUPPLIER_API_KEY
  }
})

test('branch number does not match a longer number or another city', () => {
  assert.deepEqual(searchWarehouses(rows, 'Київ 14428').map(x => x.internal_id), ['kyiv-14428'])
  assert.deepEqual(searchWarehouses(rows, 'Львів 4428').map(x => x.internal_id), ['other-4428'])
})

test('supplier city lookup excludes the branch suffix and reuses the city cache', async () => {
  const previousFetch = globalThis.fetch
  const calls = []
  process.env.SUPPLIER_API_URL = 'https://supplier.example.test/api'
  process.env.SUPPLIER_API_KEY = 'synthetic-key'
  globalThis.fetch = async input => {
    calls.push(new URL(String(input)))
    return new Response(JSON.stringify(rows.map(row => ({ ...row, city: row.city_name }))))
  }
  try {
    assert.deepEqual((await searchNovaPoshtaWarehouses('киев 4428')).map(x => x.internal_id), ['kyiv-4428'])
    assert.deepEqual((await searchNovaPoshtaWarehouses('Київ №14428')).map(x => x.internal_id), ['kyiv-14428'])
    assert.equal(calls.length, 1)
    assert.equal(calls[0].searchParams.get('city'), 'київ')
  } finally {
    globalThis.fetch = previousFetch
    delete process.env.SUPPLIER_API_URL
    delete process.env.SUPPLIER_API_KEY
  }
})
