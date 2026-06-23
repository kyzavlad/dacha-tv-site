export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { backfillCatalogImages } from '@/lib/catalog/pipeline'

// ─── Catalog image backfill ───────────────────────────────────────────────────
// Copies main_image_url + images from supplier_products → catalog_products for
// catalog rows that are missing an image but whose supplier row has one.
//
// GET  → DRY RUN (read-only): reports exact affected counts + sample SKUs.
// POST → APPLY: writes image columns only (main_image_url, images, updated_at).
//
// Touches NOTHING else — no price, status, category, stock, orders, or checkout.
// Protected by CRON_SECRET.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/catalog/backfill-images
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/catalog/backfill-images

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const result = await backfillCatalogImages({ apply: false })
  return Response.json(result)
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const result = await backfillCatalogImages({ apply: true })
  return Response.json(result)
}
