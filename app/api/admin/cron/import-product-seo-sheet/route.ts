export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { importProductSeoFromSheet } from '@/lib/catalog/seo-sheet-import'

// ─── Google Sheets → catalog_products SEO importer (safe) ─────────────────────
// Matches by SKU. Writes ONLY meta_title, meta_description, seo_keywords and
// (when empty) description_ua. Never overwrites a manual lock, an AI/manual row
// (unless ?force=true), or any already-filled field (unless force). Every value
// is validated (length, no HTML, no cat-NNN, no spam, no fake claims) first.
// Touches nothing else — no price, stock, status, category, images, orders.
// Protected by CRON_SECRET.
//
// APPLY is triggered by ANY of: POST method, ?apply=true, or ?dryRun=false.
// Default (plain GET) stays a read-only DRY RUN.
//   GET                         → DRY RUN (read-only): counts + samples + validation errors.
//   GET  ?apply=true            → APPLY (also ?dryRun=false).
//   POST                        → APPLY.
//   POST ?apply=false|dryRun=true → forced DRY RUN even on POST.
//   ?force=true  → also overwrite AI/manual rows and non-empty fields (never the lock).
//   ?limit=N     → bound sheet rows processed (default 5000).
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/cron/import-product-seo-sheet
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/admin/cron/import-product-seo-sheet?apply=true"
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/admin/cron/import-product-seo-sheet?force=true"

function parseOpts(req: Request): { force: boolean; limit?: number } {
  const sp = new URL(req.url).searchParams
  const force = sp.get('force') === 'true' || sp.get('force') === '1'
  const rawLimit = sp.get('limit')
  const n = rawLimit ? Number(rawLimit) : NaN
  return { force, limit: Number.isFinite(n) && n > 0 ? n : undefined }
}

// Resolve apply vs dry-run from method + query. `methodImpliesApply` is true for
// POST. An explicit ?apply / ?dryRun query param always wins so callers can opt
// in on GET or opt out on POST.
function resolveApply(req: Request, methodImpliesApply: boolean): boolean {
  const sp = new URL(req.url).searchParams
  const applyParam = sp.get('apply')
  const dryRunParam = sp.get('dryRun') ?? sp.get('dryrun')
  if (applyParam === 'true' || applyParam === '1') return true
  if (applyParam === 'false' || applyParam === '0') return false
  if (dryRunParam === 'false' || dryRunParam === '0') return true
  if (dryRunParam === 'true' || dryRunParam === '1') return false
  return methodImpliesApply
}

async function runDry(req: Request): Promise<Response> {
  const { force, limit } = parseOpts(req)
  const result = await importProductSeoFromSheet({ apply: false, force, limit })
  return Response.json({ ...result, apply: false, mode: 'dry-run' })
}

async function runApply(req: Request): Promise<Response> {
  const { force, limit } = parseOpts(req)
  const client = getAdminClient()
  const startedAt = Date.now()
  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'product_seo_sheet', status: 'running', triggered_by: 'cron' })
    .select('id').single()

  try {
    const result = await importProductSeoFromSheet({ apply: true, force, limit })
    await client.from('supplier_sync_log').update({
      status: result.ok ? 'completed' : 'failed',
      products_total: result.updated,
      error_details: {
        message: result.message, rows: result.rows, matched: result.matched,
        eligible: result.eligible, updated: result.updated, errors: result.errors,
        validationErrors: result.validationErrors, unmatched: result.unmatched,
        source: 'sheet', force, duration_ms: Date.now() - startedAt,
      },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return Response.json({ ...result, apply: true, mode: 'apply' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return Response.json({ ok: false, apply: true, mode: 'apply', message: msg }, { status: 200 })
  }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  return resolveApply(req, false) ? runApply(req) : runDry(req)
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  return resolveApply(req, true) ? runApply(req) : runDry(req)
}
