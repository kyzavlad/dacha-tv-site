// ─── Pure, DB-free helpers for GET /api/health ─────────────────────────────
// Kept separate from the route handler so URL normalization and response-body
// shaping are unit-testable without a live Next.js request/response cycle.
// This endpoint is intentionally unauthenticated (PM2/Nginx/uptime monitors
// need to reach it without a secret) — it must never reveal secret VALUES,
// only booleans/status strings, and it must never write anything.

export function normalizeSupabaseUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    return `${u.protocol}//${u.host}`
  } catch {
    return raw.trim().replace(/\/+$/, '')
  }
}

export interface HealthEnvStatus {
  configured: boolean
  reason?: string
}

// Only checks PRESENCE of the public anon key/url — never the service role
// key (this endpoint never uses it) and never any value itself.
export function checkHealthEnv(supabaseUrl: string | undefined, anonKey: string | undefined): HealthEnvStatus {
  if (!supabaseUrl || !anonKey) {
    return { configured: false, reason: 'Supabase env not configured' }
  }
  return { configured: true }
}

export type HealthBackendStatus = 'ok' | 'unreachable' | 'unconfigured'

export interface HealthBody {
  ok: boolean
  status: 'alive' | 'degraded'
  backend: HealthBackendStatus
  uptime_s: number
  latency_ms?: number
  timestamp: string
}

// The process being able to run this function at all already proves
// "the Next.js process is alive" — `ok`/`status` reflect whether the backend
// dependency check also passed, since a health check that only ever says
// "alive" regardless of backend state is not honest for a load balancer.
export function buildHealthBody(opts: {
  ok: boolean
  backend: HealthBackendStatus
  uptimeSeconds: number
  latencyMs?: number
  nowIso?: string
}): HealthBody {
  return {
    ok: opts.ok,
    status: opts.ok ? 'alive' : 'degraded',
    backend: opts.backend,
    uptime_s: opts.uptimeSeconds,
    ...(opts.latencyMs != null ? { latency_ms: opts.latencyMs } : {}),
    timestamp: opts.nowIso ?? new Date().toISOString(),
  }
}
