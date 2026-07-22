import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSupabaseUrl, checkHealthEnv, buildHealthBody } from '../lib/health.ts'

// ── normalizeSupabaseUrl ────────────────────────────────────────────────────

test('normalizeSupabaseUrl strips path/query, keeps protocol+host', () => {
  assert.equal(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1?x=1'), 'https://abc.supabase.co')
  assert.equal(normalizeSupabaseUrl('https://abc.supabase.co/'), 'https://abc.supabase.co')
})

test('normalizeSupabaseUrl falls back to a trimmed string for an invalid URL', () => {
  assert.equal(normalizeSupabaseUrl('not-a-url/'), 'not-a-url')
})

// ── checkHealthEnv: presence only, never leaks values ───────────────────────

test('checkHealthEnv reports unconfigured when either var is missing', () => {
  assert.equal(checkHealthEnv(undefined, 'anon-key').configured, false)
  assert.equal(checkHealthEnv('https://x.supabase.co', undefined).configured, false)
  assert.equal(checkHealthEnv(undefined, undefined).configured, false)
})

test('checkHealthEnv reports configured when both are present', () => {
  const status = checkHealthEnv('https://x.supabase.co', 'anon-key')
  assert.equal(status.configured, true)
  assert.equal(status.reason, undefined)
})

test('checkHealthEnv never echoes the actual values it was given', () => {
  const secretLookingValue = 'sb_anon_super_secret_looking_value_12345'
  const status = checkHealthEnv('https://x.supabase.co', secretLookingValue)
  assert.equal(JSON.stringify(status).includes(secretLookingValue), false)
})

// ── buildHealthBody: honest ok/status, no secrets ───────────────────────────

test('buildHealthBody reports ok=true / status=alive on a healthy backend', () => {
  const body = buildHealthBody({ ok: true, backend: 'ok', uptimeSeconds: 42, latencyMs: 7, nowIso: '2026-07-22T00:00:00.000Z' })
  assert.equal(body.ok, true)
  assert.equal(body.status, 'alive')
  assert.equal(body.backend, 'ok')
  assert.equal(body.uptime_s, 42)
  assert.equal(body.latency_ms, 7)
  assert.equal(body.timestamp, '2026-07-22T00:00:00.000Z')
})

test('buildHealthBody reports ok=false / status=degraded when the backend is unreachable', () => {
  const body = buildHealthBody({ ok: false, backend: 'unreachable', uptimeSeconds: 5 })
  assert.equal(body.ok, false)
  assert.equal(body.status, 'degraded')
  assert.equal(body.backend, 'unreachable')
  assert.equal(body.latency_ms, undefined, 'no latency figure when the check never completed')
})

test('buildHealthBody reports ok=false / status=degraded when the backend is unconfigured', () => {
  const body = buildHealthBody({ ok: false, backend: 'unconfigured', uptimeSeconds: 1 })
  assert.equal(body.ok, false)
  assert.equal(body.backend, 'unconfigured')
})

test('buildHealthBody never includes a secret-shaped field', () => {
  const body = buildHealthBody({ ok: true, backend: 'ok', uptimeSeconds: 1 })
  const keys = Object.keys(body)
  for (const k of keys) {
    assert.doesNotMatch(k.toLowerCase(), /key|secret|token|password/)
  }
})
