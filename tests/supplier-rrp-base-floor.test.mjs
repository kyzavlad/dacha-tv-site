import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260816131500_supplier_rrp_base_floor.sql', import.meta.url),
  'utf8',
)

test('RRP batch only accepts prices at or above a positive supplier base price', () => {
  assert.match(migration, /sp0\.price_uah\s+is\s+not\s+null/i)
  assert.match(migration, /sp0\.price_uah\s*>\s*0/i)
  assert.match(migration, /i\.price_uah\s*>=\s*sp0\.price_uah/i)
})

test('catalog guard fails closed when a stored RRP becomes lower than base cost', () => {
  assert.match(migration, /select\s+sp\.our_price_uah,\s*sp\.price_uah/i)
  assert.match(migration, /v_rrp\s*>=\s*v_base/i)
  assert.match(migration, /v_rrp\s*<\s*v_base/i)
  assert.match(migration, /new\.price_uah\s*:=\s*null/i)
})

test('manual and price-locked catalog rows remain outside supplier enforcement', () => {
  assert.match(migration, /coalesce\(new\.source,\s*'supplier'\)\s*<>\s*'manual'/i)
  assert.match(migration, /coalesce\(new\.price_manual_lock,\s*false\)\s*=\s*false/i)
  assert.match(migration, /coalesce\(cp\.source,\s*'supplier'\)\s*<>\s*'manual'/i)
  assert.match(migration, /coalesce\(cp\.price_manual_lock,\s*false\)\s*=\s*false/i)
})
