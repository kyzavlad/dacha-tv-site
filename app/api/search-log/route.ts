export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { getAdminClient } from '@/lib/supabase/admin'
import { ATTRIBUTION_COOKIE } from '@/lib/analytics/attribution'

// ─── Internal site-search logging (fail-safe, non-blocking) ───────────────────
// Called by the public search page AFTER results render (client-side, keepalive),
// so it never slows search. Writes one lightweight row to `search_logs`. No PII —
// only the query, locale, result count, path, and optional UTM source/campaign
// from the existing attribution cookie. Any failure (missing table, bad input) is
// swallowed and returns ok — logging must never surface an error to the shopper.
//   POST /api/search-log  { q, locale?, resultCount?, path? }
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      q?: unknown; locale?: unknown; resultCount?: unknown; path?: unknown
    }
    const query = typeof body.q === 'string' ? body.q.trim().slice(0, 200) : ''
    if (query.length < 2) return Response.json({ ok: true, skipped: true })

    const locale = typeof body.locale === 'string' ? body.locale.slice(0, 8) : null
    const resultCount = Number.isFinite(Number(body.resultCount)) ? Math.max(0, Math.trunc(Number(body.resultCount))) : null
    const path = typeof body.path === 'string' ? body.path.slice(0, 300) : null

    // Optional UTM from the attribution cookie (no new data collected).
    let utm_source: string | null = null
    let utm_campaign: string | null = null
    try {
      const raw = (await cookies()).get(ATTRIBUTION_COOKIE)?.value
      if (raw) {
        const p = new URLSearchParams(decodeURIComponent(raw))
        utm_source = p.get('utm_source')?.slice(0, 120) ?? null
        utm_campaign = p.get('utm_campaign')?.slice(0, 120) ?? null
      }
    } catch { /* ignore */ }

    const client = getAdminClient()
    await client.from('search_logs').insert({
      query,
      query_norm: query.toLowerCase(),
      locale,
      result_count: resultCount,
      path,
      utm_source,
      utm_campaign,
    })
    return Response.json({ ok: true })
  } catch (e) {
    // Missing table (migration not applied yet) or any other error is non-fatal.
    console.warn(`[search-log] skipped: ${e instanceof Error ? e.message : String(e)}`)
    return Response.json({ ok: true, error: true })
  }
}
