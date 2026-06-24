export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { findOrphanedApprovedProducts, recoverOrphanedProducts } from '@/lib/catalog/pipeline'

// GET  /api/admin/diag/approved-missing
//   — Dry-run: lists supplier_products that are is_approved=true but absent from catalog_products.
//   ?apply=true — resets is_approved=false for those rows so they re-enter the import queue.
//
// Protected by CRON_SECRET (same as other admin diag routes).
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const url = new URL(req.url)
    const apply = url.searchParams.get('apply') === 'true'

    if (apply) {
      const result = await recoverOrphanedProducts({ apply: true })
      return Response.json({ ...result, applied: true })
    }

    const result = await findOrphanedApprovedProducts()
    return Response.json({ ...result, applied: false })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
