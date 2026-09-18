import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { searchNovaPoshtaWarehouses } from '../lib/supplier/warehouses.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const source = fs.readFileSync(path.join(ROOT, 'lib/supplier/warehouses.ts'), 'utf8')

test('checkout warehouse search never fetches the nationwide dataset on a cold request', () => {
  assert.match(source, /getWarehousesForCityQuery\(query\)/)
  assert.match(source, /fetchNovaPoshtaWarehouses\(supplierCity\)/)
  assert.doesNotMatch(source, /fetchNovaPoshtaWarehouses\(\)\s*\.then/)
  assert.doesNotMatch(source, /getAllWarehouses\(/)
})

test('warehouse city rows and user queries pass through the same alias folding', () => {
  assert.match(source, /const q = applyAlias\(normRaw\)/)
  assert.match(source, /const city = applyAlias\(normalizeSearch\(row\.city_name\)\)/)
})

test('cold warehouse lookup scopes the supplier request to the entered city', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    return new Response(JSON.stringify([
      {
        internal_id: 'kh-1',
        name: 'Відділення №1',
        city_name: 'Харьков',
        address: 'вул. Тестова, 1',
      },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  process.env.SUPPLIER_API_URL = 'https://supplier.example.test/api'
  process.env.SUPPLIER_API_KEY = 'test-key'

  try {
    const rows = await searchNovaPoshtaWarehouses('Харків', 30)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].searchParams.get('method'), 'get_novaposhta_warehouses')
    assert.equal(calls[0].searchParams.get('city'), 'Харків')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].internal_id, 'kh-1')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.SUPPLIER_API_URL
    delete process.env.SUPPLIER_API_KEY
  }
})

test('Russian city alias is sent as the Ukrainian canonical city and still matches supplier rows', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push(url)
    return new Response(JSON.stringify([
      {
        internal_id: 'kyiv-1',
        name: 'Отделение №1',
        city_name: 'Киев',
        address: 'ул. Тестовая, 1',
      },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  process.env.SUPPLIER_API_URL = 'https://supplier.example.test/api'
  process.env.SUPPLIER_API_KEY = 'test-key'

  try {
    const rows = await searchNovaPoshtaWarehouses('Киев', 30)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].searchParams.get('city'), 'київ')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].internal_id, 'kyiv-1')
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.SUPPLIER_API_URL
    delete process.env.SUPPLIER_API_KEY
  }
})
