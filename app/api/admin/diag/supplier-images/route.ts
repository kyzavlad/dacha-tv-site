export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { extractSupplierImages } from '@/lib/catalog/pipeline'

// GET  /api/admin/diag/supplier-images
//   — Dry-run: counts supplier_products rows missing main_image_url whose raw_data
//     contains an https://images.zone/ URL. Reports samples.
//   ?apply=true  — backfills main_image_url from raw_data (never overwrites existing).
//   ?limit=N     — cap how many rows are processed (default: no cap).
//
// Protected by CRON_SECRET.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const url = new URL(req.url)
    const apply = url.searchParams.get('apply') === 'true'
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 10000) : undefined

    const result = await extractSupplierImages({ apply, limit })
    return Response.json(result)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
