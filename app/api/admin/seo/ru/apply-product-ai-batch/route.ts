export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { applyRuProductAiBatch, type AiRuProductItem } from '@/lib/catalog/seo-ai-ru'
import { summarizeApply } from '@/lib/catalog/seo-batch-report'

// ─── Apply validated RU product SEO (WRITE — translation table only) ──────────
// Writes ONLY to catalog_product_translations (locale='ru'); Ukrainian columns
// are never touched. Every field is validated (Russian language, length, no
// forbidden phrases/HTML/slug, non-empty description). RU-locked rows are never
// overwritten. seo_status='ai', seo_source='n8n-ai-ru'. Logged to
// supplier_sync_log. dryRun / ?dry=1 validates + reports without writing.
//
//   POST /api/admin/seo/ru/apply-product-ai-batch
//   Body: { "items": [ { "sku"|"id", "meta_title"?, "meta_description"?,
//           "description"?, "keywords"? } ], "dryRun": false }
export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  let body: unknown
  try { body = await req.json() } catch { return Response.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 }) }
  const b = (body ?? {}) as { items?: unknown; dryRun?: unknown }
  if (!Array.isArray(b.items)) return Response.json({ ok: false, message: 'Body must be { items: [...] }' }, { status: 400 })
  if (b.items.length > 500) return Response.json({ ok: false, message: 'Максимум 500 items за один запрос.' }, { status: 400 })

  const dryRun = b.dryRun === true || new URL(req.url).searchParams.get('dry') === '1'
  const items = b.items as AiRuProductItem[]
  const client = getAdminClient()
  const startedAt = Date.now()

  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: dryRun ? 'product_seo_ai_apply_ru_dryrun' : 'product_seo_ai_apply_ru', status: 'running', triggered_by: 'n8n' })
    .select('id').single()

  try {
    const r = await applyRuProductAiBatch(items, { dryRun })
    await client.from('supplier_sync_log').update({
      status: r.ok ? 'completed' : 'failed',
      products_total: r.received,
      products_updated: dryRun ? 0 : r.updated,
      products_errors: r.errors + r.invalid,
      error_details: { locale: 'ru', dry_run: dryRun, updated: r.updated, skipped: r.skipped, invalid: r.invalid, errors: r.errors, error_groups: r.errorGroups, message: r.message, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    const summary = summarizeApply(r)
    console.info(`[seo-ru-apply] processed=${summary.processed} applied=${summary.applied} skipped=${summary.skipped} failed=${summary.failed}${summary.topReasons.length ? ` reasons=${summary.topReasons.join(' | ')}` : ''}`)
    return Response.json({ ...r, summary }, { status: 200 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({ status: 'failed', error_details: { locale: 'ru', message: msg, dry_run: dryRun }, completed_at: new Date().toISOString() }).eq('id', log?.id)
    return Response.json({ ok: false, message: msg }, { status: 200 })
  }
}
