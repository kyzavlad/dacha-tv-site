export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { isSeoAutomationEnabled, seoAutomationDisabledResponse } from '@/lib/catalog/seo-automation-guard'
import { getAdminClient } from '@/lib/supabase/admin'
import { applyCategoryAiSeoBatch, type AiCategorySeoItem } from '@/lib/catalog/seo-ai-category'

// ─── Apply validated AI CATEGORY SEO results (WRITE, guarded) ─────────────────
// Accepts a JSON batch of AI-generated category SEO from n8n and writes ONLY
// allowed SEO fields to matching published categories. Every field is validated
// (Ukrainian language, length windows, no forbidden phrases, no HTML/slug,
// non-empty description; FAQ pairs Ukrainian + non-empty). Human-authored SEO
// (sheet/manual/locked) is NEVER overwritten. Logged to supplier_sync_log. Does
// NOT touch products, checkout, supplier data, import, sitemap, or schema.
//
//   POST /api/admin/seo/apply-category-ai-batch
//   Body: { "items": [ { "slug"|"id": "...", "meta_title": "...",
//           "meta_description": "...", "description": "...", "h1": "...",
//           "keywords": "...", "faq": [ { "question": "...", "answer": "..." } ] } ],
//           "dryRun": false }
//   ?dry=1 forces a dry run (validate + report, write nothing).
//
// Protected by CRON_SECRET.
export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  if (!isSeoAutomationEnabled()) return seoAutomationDisabledResponse()

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
  const items = b.items as AiCategorySeoItem[]

  const client = getAdminClient()
  const startedAt = Date.now()

  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: dryRun ? 'category_seo_ai_apply_dryrun' : 'category_seo_ai_apply', status: 'running', triggered_by: 'n8n' })
    .select('id')
    .single()

  try {
    const result = await applyCategoryAiSeoBatch(items, { dryRun })

    await client.from('supplier_sync_log').update({
      status: result.ok ? 'completed' : 'failed',
      categories_total: result.received,
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
