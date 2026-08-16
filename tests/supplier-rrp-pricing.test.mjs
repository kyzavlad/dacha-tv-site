import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rrpSync = await readFile(new URL('../lib/supplier/rrp-sync.ts', import.meta.url), 'utf8')
const route = await readFile(new URL('../app/api/admin/cron/refresh-rrp/route.ts', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/migrations/20260816114500_supplier_rrp_price_layer.sql', import.meta.url), 'utf8')
const bootstrapSafety = await readFile(new URL('../supabase/migrations/20260816131000_preserve_price_until_rrp_bootstrap.sql', import.meta.url), 'utf8')

test('RRP sync requests the supplier-calculated retail feed and never logs the API key', () => {
  assert.match(rrpSync, /rrp:\s*'on'/)
  assert.match(rrpSync, /method:\s*'get_products'/)
  assert.match(rrpSync, /key=\*\*\*/)
  assert.doesNotMatch(rrpSync, /safeUrl\s*=.*\$\{key\}/)
})

test('RRP sync writes through the set-based retail-price RPC', () => {
  assert.match(rrpSync, /apply_supplier_rrp_batch/)
  assert.match(rrpSync, /price_uah:\s*priceUah/)
  assert.match(rrpSync, /nextOffset/)
  assert.match(rrpSync, /maxMillis/)
})

test('protected cron route is bounded, resumable and supports a one-batch pilot', () => {
  assert.match(route, /verifyCronAuth\(req\)/)
  assert.match(route, /maxDuration\s*=\s*60/)
  assert.match(route, /offset:\s*intParam\(url, 'offset'\)/)
  assert.match(route, /maxBatches:\s*intParam\(url, 'maxBatches'\)/)
  assert.match(route, /syncSupplierRrpPrices/)
  assert.match(rrpSync, /maxBatches\?: number/)
  assert.match(rrpSync, /batchesProcessed < maxBatches/)
  assert.match(rrpSync, /batchesProcessed\+\+/)
})

test('database layer keeps base cost separate from official retail price', () => {
  assert.match(migration, /supplier_price_usd\s*=\s*\(raw_data->>'price'\)::numeric/)
  assert.match(migration, /our_price_uah\s*=\s*i\.price_uah/)
  assert.match(migration, /comment on column public\.supplier_products\.price_uah[\s\S]*account\/base price/i)
  assert.match(migration, /comment on column public\.supplier_products\.our_price_uah[\s\S]*retail\/RRP price/i)
})

test('anti-dumping catalog guard never substitutes the base supplier price', () => {
  assert.match(migration, /enforce_supplier_rrp_on_catalog/)
  assert.match(migration, /select sp\.our_price_uah/)
  assert.match(migration, /new\.price_uah := v_rrp/)
  assert.match(migration, /new\.price_uah := null/)
  assert.match(migration, /price_manual_lock/)
  assert.match(migration, /source, 'supplier'\) <> 'manual'/)
  assert.doesNotMatch(migration, /select sp\.price_uah\s+into v_rrp/)
})

test('bootstrap guard preserves existing live price until first official RRP exists', () => {
  assert.match(bootstrapSafety, /if found and v_rrp is not null and v_rrp > 0/)
  assert.match(bootstrapSafety, /elsif tg_op = 'UPDATE'/)
  assert.match(bootstrapSafety, /new\.price_uah := old\.price_uah/)
  assert.match(bootstrapSafety, /new\.price_uah := null/)
})

test('RRP batch propagates retail prices only to unlocked supplier catalog rows', () => {
  assert.match(migration, /update public\.catalog_products cp/)
  assert.match(migration, /price_uah = i\.price_uah/)
  assert.match(migration, /coalesce\(cp\.source, 'supplier'\) <> 'manual'/)
  assert.match(migration, /coalesce\(cp\.price_manual_lock, false\) = false/)
})
