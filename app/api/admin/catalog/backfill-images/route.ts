export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { backfillCatalogImages } from '@/lib/catalog/pipeline'

// ─── Catalog image backfill (batch-safe) ──────────────────────────────────────
// Copies main_image_url + images from supplier_products → catalog_products for
// catalog rows that are missing an image but whose supplier row has one.
//
// GET  → DRY RUN (read-only): reports affected counts + sample SKUs. No writes.
// POST → APPLY: writes image columns only (main_image_url, images, updated_at)
//        for at most `limit` rows (default 1000, max 1000). Run repeatedly to
//        drain the backlog — each call reports remainingMissing.
//        ?limit=N  — cap rows processed this call (clamped to 1000).
//
// Touches NOTHING else — no price, status, category, stock, orders, or checkout.
// Never overwrites a catalog row that already has main_image_url.
// Protected by CRON_SECRET.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/catalog/backfill-images
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/admin/catalog/backfill-images?limit=1000"

const APPLY_MAX_LIMIT = 1000

function parseLimit(req: Request): number {
  const raw = new URL(req.url).searchParams.get('limit')
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, APPLY_MAX_LIMIT) : APPLY_MAX_LIMIT
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const result = await backfillCatalogImages({ apply: false, limit: parseLimit(req) })
    return Response.json(result)
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const result = await backfillCatalogImages({ apply: true, limit: parseLimit(req) })
    return Response.json(result)
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
