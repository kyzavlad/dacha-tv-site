export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { normalizeSupabaseUrl, checkHealthEnv, buildHealthBody } from '@/lib/health'

// ─── Public, unauthenticated runtime health check ──────────────────────────
// For PM2 (deploy/self-host/switch-release.sh), Nginx, and any uptime
// monitor — none of which carry CRON_SECRET. Deliberately separate from
// /api/admin/health/supabase (which IS protected and reveals more detail for
// operator diagnostics). This endpoint:
//   - never returns a secret VALUE (only booleans/status strings)
//   - uses the public anon key only — never the service role key
//   - performs at most one tiny bounded read (services, limit 1)
//   - never writes anything
//   - has no authentication side effects (nothing to authenticate)
//   - returns an honest non-200 when Supabase is unreachable/unconfigured
//
//   curl http://127.0.0.1:3030/api/health
const CHECK_TIMEOUT_MS = 2000

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

export async function GET() {
  const startedAt = Date.now()
  const uptimeSeconds = Math.round(process.uptime())

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const env = checkHealthEnv(supabaseUrl, anonKey)
  if (!env.configured) {
    // The Next.js process IS alive (we're running), but the required backend
    // is not configured — an honest non-200, not a false "everything's fine".
    return Response.json(buildHealthBody({ ok: false, backend: 'unconfigured', uptimeSeconds }), { status: 503 })
  }

  try {
    const client = createClient(normalizeSupabaseUrl(supabaseUrl!), anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await withTimeout(
      client.from('services').select('id').limit(1),
      CHECK_TIMEOUT_MS,
      'services',
    )
    if (error) {
      return Response.json(buildHealthBody({ ok: false, backend: 'unreachable', uptimeSeconds }), { status: 503 })
    }
    return Response.json(
      buildHealthBody({ ok: true, backend: 'ok', uptimeSeconds, latencyMs: Date.now() - startedAt }),
      { status: 200 },
    )
  } catch {
    return Response.json(buildHealthBody({ ok: false, backend: 'unreachable', uptimeSeconds }), { status: 503 })
  }
}
