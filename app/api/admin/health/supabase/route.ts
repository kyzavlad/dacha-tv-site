export const dynamic = 'force-dynamic'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'

// ─── Protected Supabase health probe ──────────────────────────────────────────
// Read-only. Verifies that the production Supabase env is wired and that the
// core operational tables respond. Never reveals secret VALUES — only booleans
// for presence. Protected by CRON_SECRET.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/health/supabase
//
// HTTP 200 when env is present and the core checks (bookings + services) pass;
// HTTP 500 when env is missing or Supabase cannot be reached at all.

const CHECK_TIMEOUT_MS = 4500

function normalizeSupabaseUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    return `${u.protocol}//${u.host}`
  } catch {
    return raw.trim().replace(/\/+$/, '')
  }
}

// Reject after `ms` so a hanging Supabase call can't stall the probe.
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

// Lightweight existence/read probe: select id, limit 1, no scan. Returns true on
// success; on failure records a sanitized error and returns false.
async function probe(
  client: SupabaseClient,
  table: string,
  errors: string[],
): Promise<boolean> {
  try {
    const { error } = await withTimeout(
      client.from(table).select('id').limit(1),
      CHECK_TIMEOUT_MS,
      table,
    )
    if (error) {
      errors.push(`${table}: ${error.message}`)
      return false
    }
    return true
  } catch (e) {
    errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  const env = {
    supabaseUrlPresent: Boolean(supabaseUrl),
    anonKeyPresent: Boolean(anonKey),
    serviceRolePresent: Boolean(serviceRole),
  }

  const errors: string[] = []
  const timestamp = new Date().toISOString()

  // Need a URL and at least one key to connect. Prefer the service role so RLS
  // never hides a table that actually exists.
  const key = serviceRole || anonKey
  if (!supabaseUrl || !key) {
    errors.push('Supabase env missing: need NEXT_PUBLIC_SUPABASE_URL and a key (service role or anon).')
    return Response.json(
      {
        ok: false,
        env,
        checks: { bookingsRead: false, servicesRead: false, catalogCategoriesRead: false, catalogProductsRead: false },
        errors,
        timestamp,
      },
      { status: 500 },
    )
  }

  let client: SupabaseClient
  try {
    client = createClient(normalizeSupabaseUrl(supabaseUrl), key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  } catch (e) {
    errors.push(`client init failed: ${e instanceof Error ? e.message : String(e)}`)
    return Response.json(
      {
        ok: false,
        env,
        checks: { bookingsRead: false, servicesRead: false, catalogCategoriesRead: false, catalogProductsRead: false },
        errors,
        timestamp,
      },
      { status: 500 },
    )
  }

  const [bookingsRead, servicesRead, catalogCategoriesRead, catalogProductsRead] = await Promise.all([
    probe(client, 'bookings', errors),
    probe(client, 'services', errors),
    probe(client, 'catalog_categories', errors),
    probe(client, 'catalog_products', errors),
  ])

  const checks = { bookingsRead, servicesRead, catalogCategoriesRead, catalogProductsRead }

  // Core = the booking-critical tables. Catalog tables may legitimately be
  // mid-migration without the site being "down" for bookings.
  const coreOk = bookingsRead && servicesRead
  const ok = coreOk

  return Response.json({ ok, env, checks, errors, timestamp }, { status: ok ? 200 : 500 })
}
