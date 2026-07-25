export const dynamic = 'force-dynamic'

import { buildLivenessBody } from '@/lib/health'

// ─── Public liveness check (pure, no backend) ─────────────────────────────────
// Polled every few seconds by PM2 (switch-release.sh / health-check.sh) and
// Nginx. It is DELIBERATELY liveness-only:
//   • no Supabase client (the previous per-request createClient was the RSS leak)
//   • no network request, no timer, no socket, no per-request allocation that
//     can remain referenced after the response
//   • returns process status + uptime + timestamp
// The bounded backend check lives at GET /api/admin/health/backend (protected).
export function GET() {
  return Response.json(buildLivenessBody(), { status: 200 })
}
