export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../../cron/_auth'
import { isSeoAutomationEnabled, seoAutomationDisabledResponse } from '@/lib/catalog/seo-automation-guard'
import { getAdminClient } from '@/lib/supabase/admin'
import { applyRuCategoryAiBatch, type AiRuCategoryItem } from '@/lib/catalog/seo-ai-ru'

// ─── Apply validated RU category SEO (WRITE — translation table only) ─────────
// Writes ONLY to catalog_category_translations (locale='ru'); Ukrainian columns
// are never touched. Every field is validated (Russian language, length, no
// forbidden phrases/HTML/slug, non-empty description; FAQ pairs Russian +
// non-empty). RU-locked rows are never overwritten. seo_status='ai',
// seo_source='n8n-ai-ru'. Logged to supplier_sync_log. dryRun / ?dry=1.
//
//   POST /api/admin/seo/ru/apply-category-ai-batch
//   Body: { "items": [ { "slug"|"id", "meta_title"?, "meta_description"?,
//           "description"?, "h1"?, "keywords"?,
//           "faq"?: [ { "question", "answer" } ] } ], "dryRun": false }
export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  if (!isSeoAutomationEnabled()) return seoAutomationDisabledResponse()

  let body: unknown
  try { body = await req.json() } catch { return Response.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 }) }
  const b = (body ?? {}) as { items?: unknown; dryRun?: unknown }
  if (!Array.isArray(b.items)) return Response.json({ ok: false, message: 'Body must be { items: [...] }' }, { status: 400 })
  if (b.items.length > 500) return Response.json({ ok: false, message: 'Максимум 500 items за один запрос.' }, { status: 400 })

  const dryRun = b.dryRun === true || new URL(req.url).searchParams.get('dry') === '1'
  const items = b.items as AiRuCategoryItem[]
  const client = getAdminClient()
  const startedAt = Date.now()

  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: dryRun ? 'category_seo_ai_apply_ru_dryrun' : 'category_seo_ai_apply_ru', status: 'running', triggered_by: 'n8n' })
    .select('id').single()

  try {
    const r = await applyRuCategoryAiBatch(items, { dryRun })
    await client.from('supplier_sync_log').update({
      status: r.ok ? 'completed' : 'failed',
      categories_total: r.received,
      products_errors: r.errors + r.invalid,
      error_details: { locale: 'ru', dry_run: dryRun, updated: r.updated, skipped: r.skipped, invalid: r.invalid, errors: r.errors, error_groups: r.errorGroups, message: r.message, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return Response.json(r, { status: 200 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({ status: 'failed', error_details: { locale: 'ru', message: msg, dry_run: dryRun }, completed_at: new Date().toISOString() }).eq('id', log?.id)
    return Response.json({ ok: false, message: msg }, { status: 200 })
  }
}
