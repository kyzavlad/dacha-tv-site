import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/supplier/sync.ts', import.meta.url), 'utf8')

test('heavy product feed has dedicated timeout without relaxing lightweight supplier calls', () => {
  assert.match(src, /const DEFAULT_SUPPLIER_TIMEOUT_MS = 15000/)
  assert.match(src, /const GET_PRODUCTS_SUPPLIER_TIMEOUT_MS = 35000/)
  assert.match(
    src,
    /apiFetch\('get_products', extra, GET_PRODUCTS_SUPPLIER_TIMEOUT_MS\)/,
  )
  assert.match(
    src,
    /async function apiFetch\(method: string, extra: Record<string, string> = \{\}, timeoutMs = DEFAULT_SUPPLIER_TIMEOUT_MS\)/,
  )
})
