export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { importCategorySeoFromSheet } from '@/lib/catalog/seo-sheet-import'

// ─── Google Sheets → catalog_categories SEO importer (safe) ───────────────────
// Matches by category name (name_ua / name / autoSlug, with a supplier-name
// fallback). Writes ONLY meta_description / description_ua (and meta_title /
// seo_keywords when present in the sheet) into empty fields. Never overwrites a
// manual lock, an AI/manual row (unless ?force=true), or any already-filled
// field (unless force). Every value is validated first. Unmatched category
// names are reported for reconciliation. Protected by CRON_SECRET.
//
//   GET  → DRY RUN (read-only): counts + samples + unmatched + validation errors.
//   POST → APPLY: writes the eligible fields.
//   ?force=true / ?limit=N as in the product importer.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/cron/import-category-seo-sheet
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/cron/import-category-seo-sheet

function parseOpts(req: Request): { force: boolean; limit?: number } {
  const sp = new URL(req.url).searchParams
  const force = sp.get('force') === 'true' || sp.get('force') === '1'
  const rawLimit = sp.get('limit')
  const n = rawLimit ? Number(rawLimit) : NaN
  return { force, limit: Number.isFinite(n) && n > 0 ? n : undefined }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const { force, limit } = parseOpts(req)
  const result = await importCategorySeoFromSheet({ apply: false, force, limit })
  return Response.json(result)
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const { force, limit } = parseOpts(req)

  const client = getAdminClient()
  const startedAt = Date.now()
  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'category_seo_sheet', status: 'running', triggered_by: 'cron' })
    .select('id').single()

  try {
    const result = await importCategorySeoFromSheet({ apply: true, force, limit })
    await client.from('supplier_sync_log').update({
      status: result.ok ? 'completed' : 'failed',
      categories_total: result.updated,
      error_details: {
        message: result.message, rows: result.rows, matched: result.matched,
        eligible: result.eligible, updated: result.updated, errors: result.errors,
        validationErrors: result.validationErrors, unmatched: result.unmatched,
        source: 'sheet', force, duration_ms: Date.now() - startedAt,
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
