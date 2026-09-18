import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

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
