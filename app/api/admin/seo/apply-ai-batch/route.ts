export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { applyAiSeoBatch, type AiSeoItem } from '@/lib/catalog/seo-ai'

// ─── Apply validated AI SEO results (WRITE, guarded) ──────────────────────────
// Accepts a JSON batch of AI-generated SEO from n8n and writes ONLY allowed SEO
// fields to matching published products. Every field is validated (Ukrainian
// language, length windows, no forbidden phrases, no HTML/slug, non-empty
// description). Human-authored SEO (sheet/manual/locked) is NEVER overwritten.
// The run is logged to supplier_sync_log. Does NOT touch price/stock/images or
// any checkout/supplier data.
//
//   POST /api/admin/seo/apply-ai-batch
//   Body: { "items": [ { "sku"|"id": "...", "meta_title": "...",
//           "meta_description": "...", "description": "...", "keywords": "..." } ],
//           "dryRun": false }
//   ?dry=1 forces a dry run (validate + report, write nothing).
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
//     -d '{"dryRun":true,"items":[{"sku":"TEST-1","meta_title":"...","meta_description":"...","description":"..."}]}' \
//     "https://<site>/api/admin/seo/apply-ai-batch"
//
// Protected by CRON_SECRET.
export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  const b = (body ?? {}) as { items?: unknown; dryRun?: unknown }
  if (!Array.isArray(b.items)) {
    return Response.json({ ok: false, message: 'Body must be { items: [...] }' }, { status: 400 })
  }
  if (b.items.length > 500) {
    return Response.json({ ok: false, message: 'Максимум 500 items за один запит.' }, { status: 400 })
  }

  const url = new URL(req.url)
  const dryRun = b.dryRun === true || url.searchParams.get('dry') === '1'
  const items = b.items as AiSeoItem[]

  const client = getAdminClient()
  const startedAt = Date.now()

  // Log the run (dry runs are logged too, but clearly tagged and non-mutating).
  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: dryRun ? 'product_seo_ai_apply_dryrun' : 'product_seo_ai_apply', status: 'running', triggered_by: 'n8n' })
    .select('id')
    .single()

  try {
    const result = await applyAiSeoBatch(items, { dryRun })

    await client.from('supplier_sync_log').update({
      status: result.ok ? 'completed' : 'failed',
      products_total: result.received,
      products_updated: dryRun ? 0 : result.updated,
      products_errors: result.errors + result.invalid,
      error_details: {
        dry_run: dryRun,
        updated: result.updated,
        skipped: result.skipped,
        invalid: result.invalid,
        errors: result.errors,
        error_groups: result.errorGroups,
        message: result.message,
        duration_ms: Date.now() - startedAt,
      },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)

    return Response.json(result, { status: 200 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, dry_run: dryRun, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return Response.json({ ok: false, message: msg }, { status: 200 })
  }
}
