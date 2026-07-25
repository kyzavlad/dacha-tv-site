export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { normalizeSupabaseUrl } from '@/lib/health'

// ─── Protected bounded backend check (CRON_SECRET) ────────────────────────────
// The backend probe that used to live in the public /api/health. Uses plain
// fetch + AbortController against the Supabase REST endpoint — NO
// @supabase/supabase-js createClient (which retained per-request resources and
// leaked). Nothing here outlives the response. Never returns a secret VALUE.
//
//   curl -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3030/api/admin/health/backend
const CHECK_TIMEOUT_MS = 4500

async function probe(baseUrl: string, key: string, table: string, errors: string[]): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/rest/v1/${table}?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      errors.push(`${table}: HTTP ${res.status}`)
      return false
    }
    // Drain the (tiny) body so the connection can be released, then discard.
    await res.text().catch(() => '')
    return true
  } catch (e) {
    errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`)
    return false
  } finally {
    clearTimeout(t)
  }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const env = {
    supabaseUrlPresent: Boolean(supabaseUrl),
    serviceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anonKeyPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  }
  const timestamp = new Date().toISOString()

  if (!supabaseUrl || !key) {
    return Response.json(
      { ok: false, env, checks: {}, errors: ['Supabase env missing: need NEXT_PUBLIC_SUPABASE_URL and a key.'], timestamp },
      { status: 500 },
    )
  }

  const base = normalizeSupabaseUrl(supabaseUrl)
  const errors: string[] = []
  const [bookingsRead, servicesRead, catalogCategoriesRead, catalogProductsRead] = await Promise.all([
    probe(base, key, 'bookings', errors),
    probe(base, key, 'services', errors),
    probe(base, key, 'catalog_categories', errors),
    probe(base, key, 'catalog_products', errors),
  ])
  const checks = { bookingsRead, servicesRead, catalogCategoriesRead, catalogProductsRead }
  const ok = bookingsRead && servicesRead
  return Response.json({ ok, env, checks, errors, timestamp }, { status: ok ? 200 : 500 })
}
