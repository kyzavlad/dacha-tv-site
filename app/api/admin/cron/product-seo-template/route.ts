export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { generateProductSeoTemplate } from '@/lib/catalog/seo-template'

// ─── In-app deterministic product SEO baseline ────────────────────────────────
// Fills meta_title + meta_description for published catalog products that still
// lack them, from data already in the DB (name, category, price + optional
// supplier short description). NO external dependency — unlike the n8n path this
// never no-ops on a missing webhook. Template rows stay eligible for the n8n
// batch so AI can later upgrade them.
//
// Touches ONLY meta_title, meta_description, seo_source, seo_status,
// seo_generated_at — never price, stock, status, category, orders, or checkout.
// Manual-locked and ai/manual rows are never modified; non-empty meta is never
// overwritten. Protected by CRON_SECRET.
//
//   GET  → DRY RUN (read-only): reports eligible counts + sample copy.
//   POST → APPLY: writes meta fields for one bounded batch.
//
// Optional ?limit=N (default 500, capped 5000) bounds rows scanned per run.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/cron/product-seo-template
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/cron/product-seo-template

function parseLimit(req: Request): number | undefined {
  const raw = new URL(req.url).searchParams.get('limit')
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function parseStatusScope(req: Request): 'published' | 'draft' | 'all' {
  const raw = new URL(req.url).searchParams.get('status')
  if (raw === 'draft' || raw === 'all') return raw
  return 'published'
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const result = await generateProductSeoTemplate({ apply: false, limit: parseLimit(req), statusScope: parseStatusScope(req) })
  return Response.json(result)
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const client = getAdminClient()
  const startedAt = Date.now()
  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'product_seo_template', status: 'running', triggered_by: 'cron' })
    .select('id').single()

  try {
    const result = await generateProductSeoTemplate({ apply: true, limit: parseLimit(req), statusScope: parseStatusScope(req) })
    await client.from('supplier_sync_log').update({
      status: result.ok ? 'completed' : 'failed',
      products_total: result.updated,
      error_details: {
        message: result.message, scanned: result.scanned, eligible: result.eligible,
        updated: result.updated, errors: result.errors, source: 'template',
        duration_ms: Date.now() - startedAt,
      },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return Response.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return Response.json({ ok: false, message: msg }, { status: 200 })
  }
}
