import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLivenessBody } from '../lib/health.ts'

// ── /api/health is pure liveness (no Supabase client, no network) ─────────────

test('buildLivenessBody returns pure liveness — no backend fields', () => {
  const b = buildLivenessBody({ uptimeSeconds: 42, pid: 123, nowIso: '2026-07-25T00:00:00.000Z' })
  assert.equal(b.ok, true)
  assert.equal(b.status, 'alive')
  assert.equal(b.uptime_s, 42)
  assert.equal(b.pid, 123)
  assert.equal(b.timestamp, '2026-07-25T00:00:00.000Z')
  // It must NOT carry any backend/latency field — those imply a network probe.
  assert.equal('backend' in b, false)
  assert.equal('latency_ms' in b, false)
})

test('the /api/health route imports NO Supabase client and does no network', () => {
  const src = readFileSync(new URL('../app/api/health/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /from ['"]@supabase\/supabase-js['"]/, 'health route must not import supabase-js')
  assert.doesNotMatch(src, /createClient\(/, 'health route must not create a client')
  assert.doesNotMatch(src, /\bfetch\s*\(/, 'health route must not fetch')
  assert.match(src, /buildLivenessBody/, 'health route returns the pure liveness body')
})

test('the protected backend health route uses plain fetch + AbortController, never createClient', () => {
  const src = readFileSync(new URL('../app/api/admin/health/backend/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /createClient\(/, 'backend health must not create a supabase client')
  assert.doesNotMatch(src, /from ['"]@supabase\/supabase-js['"]/, 'backend health must not import supabase-js')
  assert.match(src, /AbortController/, 'backend health bounds the probe with AbortController')
  assert.match(src, /verifyCronAuth/, 'backend health is CRON_SECRET protected')
})

// ── Shared Supabase clients are process singletons (no per-request alloc) ──────

test('getAdminClient returns the SAME instance across calls (singleton)', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
  const { getAdminClient } = await import('../lib/supabase/admin.ts')
  const a = getAdminClient()
  const b = getAdminClient()
  assert.equal(a, b, 'admin client must be reused, not re-created per call')
})

test('the memory diagnostic route is CRON_SECRET protected and reports memoryUsage fields', () => {
  const src = readFileSync(new URL('../app/api/admin/diag/memory/route.ts', import.meta.url), 'utf8')
  assert.match(src, /verifyCronAuth/)
  assert.match(src, /memoryUsage/)
  for (const field of ['rss', 'heapUsed', 'heapTotal', 'external', 'arrayBuffers']) {
    assert.match(src, new RegExp(field), `reports ${field}`)
  }
})
