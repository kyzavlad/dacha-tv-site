import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const config = await readFile(new URL('../lib/catalog/automation-config.ts', import.meta.url), 'utf8')
const pipeline = await readFile(new URL('../lib/catalog/pipeline.ts', import.meta.url), 'utf8')

test('automatic supplier import has no lifetime published-count ceiling', () => {
  assert.match(config, /AUTOMATION_MAX_PUBLISHED\s*=\s*Number\.POSITIVE_INFINITY/)
  assert.doesNotMatch(config, /AUTOMATION_MAX_PUBLISHED\s*=\s*3000/)
})

test('new supplier rows remain bounded per request', () => {
  assert.match(config, /NEW_PRODUCT_INSERT_BATCH_CAP\s*=\s*500/)
  assert.match(pipeline, /insertNewSupplierProducts\(client,\s*NEW_PRODUCT_INSERT_BATCH_CAP,\s*capReached,\s*nowIso\)/)
})
