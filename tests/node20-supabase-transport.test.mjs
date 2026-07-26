import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// ─── Node 20 compatibility for the singleton Supabase clients ─────────────────
// realtime-js ≥2.11 resolves a WebSocket implementation EAGERLY inside
// createClient (RealtimeClient._initializeOptions) and THROWS on Node < 22,
// where there is no global WebSocket. Production runs Node 20; this sandbox runs
// Node 22 — so we SIMULATE Node 20 by deleting the native global BEFORE the
// clients are imported. This test file runs in its own process (node --test),
// so the deletion cannot affect other test files.

const NATIVE_WEBSOCKET = globalThis.WebSocket
delete globalThis.WebSocket

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key'

after(() => {
  if (NATIVE_WEBSOCKET) globalThis.WebSocket = NATIVE_WEBSOCKET
})

test('sanity: this process has NO native WebSocket (Node 20 conditions)', () => {
  assert.equal(typeof WebSocket, 'undefined')
  assert.equal(typeof globalThis.WebSocket, 'undefined')
})

test('getAdminClient constructs WITHOUT native WebSocket and stays a singleton', async () => {
  const { getAdminClient } = await import('../lib/supabase/admin.ts')
  // Before the fix this threw: "Node.js detected but native WebSocket not found".
  const a = getAdminClient()
  const b = getAdminClient()
  assert.ok(a, 'client constructed on Node-20 conditions')
  assert.equal(a, b, 'still ONE reusable client per process (memory fix preserved)')
})

test('getSupabaseClient constructs WITHOUT native WebSocket and stays a singleton', async () => {
  const { getSupabaseClient } = await import('../lib/supabase/client.ts')
  const a = getSupabaseClient()
  assert.ok(a)
  assert.equal(a, getSupabaseClient())
})

test('realtimeCompatOptions supplies the ws transport exactly when native WS is absent', async () => {
  const { realtimeCompatOptions } = await import('../lib/supabase/realtime-transport.ts')
  const opts = realtimeCompatOptions()
  assert.ok(opts.realtime?.transport, 'a transport is provided on Node without native WebSocket')
  assert.equal(typeof opts.realtime.transport, 'function', 'transport is a constructor')
  assert.equal(opts.realtime.transport.name, 'WebSocket', 'transport is the ws WebSocket class')
  // Cached: repeated calls return the same resolved fragment (no per-call work).
  assert.equal(realtimeCompatOptions(), opts)
})

test('all four singleton modules pass the compat options into createClient', () => {
  for (const f of ['admin', 'client', 'queries', 'catalog']) {
    const src = readFileSync(new URL(`../lib/supabase/${f}.ts`, import.meta.url), 'utf8')
    assert.match(src, /realtimeCompatOptions\(\)/, `${f}.ts must spread realtimeCompatOptions into createClient`)
  }
})

test('the transport helper is browser-bundle safe (guards + no static ws import)', () => {
  const src = readFileSync(new URL('../lib/supabase/realtime-transport.ts', import.meta.url), 'utf8')
  // ws must be loaded lazily behind BOTH guards — never as a top-level import
  // (catalog.ts reaches the browser bundle via CatalogSortSelect).
  assert.doesNotMatch(src, /^import .*from 'ws'/m, 'no static runtime import of ws')
  assert.match(src, /typeof WebSocket !== 'undefined'/, 'native WebSocket short-circuit')
  assert.match(src, /typeof window === 'undefined'/, 'server-only guard before require(ws)')
})
