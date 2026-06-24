export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { extractSupplierImages } from '@/lib/catalog/pipeline'

// GET  /api/admin/diag/supplier-images
//   — Dry-run (no params): counts supplier_products rows missing main_image_url
//     whose raw_data contains an https://images.zone/ URL. Reports rate estimate.
//   ?apply=true&limit=N — backfills at most N rows (default 1000, max 5000).
//     Never overwrites existing main_image_url.
//
// Protected by CRON_SECRET.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const url = new URL(req.url)
    const apply = url.searchParams.get('apply') === 'true'

    let limit: number | undefined
    if (apply) {
      const limitRaw = url.searchParams.get('limit')
      const parsed = limitRaw ? parseInt(limitRaw, 10) : NaN
      limit = Number.isFinite(parsed) && parsed > 0
        ? Math.min(parsed, 5000)
        : 1000
    }

    const result = await extractSupplierImages({ apply, limit })
    return Response.json(result)
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
