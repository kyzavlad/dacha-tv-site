export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { extractSupplierImages } from '@/lib/catalog/pipeline'

// ─── Supplier image extraction (batch-safe) ────────────────────────────────────
// Reads raw_data on supplier_products and writes valid https://images.zone/ URLs
// into main_image_url + images for rows that are currently missing an image.
//
// GET  → DRY RUN (read-only): reports total/missing/extractable counts + samples.
//        Samples up to 500 rows to estimate the extraction rate. No writes.
// POST → APPLY: writes main_image_url + images + updated_at for at most `limit`
//        rows (default 1000, max 1000). Run repeatedly to drain the backlog.
//        ?limit=N  — cap rows processed this call (clamped to 1000).
//
// Never overwrites an existing main_image_url.
// Protected by CRON_SECRET.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/diag/supplier-images
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/admin/diag/supplier-images?limit=1000"

const APPLY_MAX_LIMIT = 1000

function parseLimit(req: Request): number {
  const raw = new URL(req.url).searchParams.get('limit')
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, APPLY_MAX_LIMIT) : APPLY_MAX_LIMIT
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const result = await extractSupplierImages({ apply: false, limit: parseLimit(req) })
    return Response.json(result)
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const result = await extractSupplierImages({ apply: true, limit: parseLimit(req) })
    return Response.json(result)
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
