export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { importSeoSheetPriorityProducts } from '@/lib/catalog/pipeline'

// GET  /api/admin/cron/import-seo-priority
//   — Dry-run: shows how many SEO-sheet SKUs are in supplier_products but not yet
//     in catalog_products, and which ones would be imported.
//   ?apply=true  — imports those SKUs first (before the full backlog).
//   ?limit=N     — cap (default 5000).
//
// Protected by CRON_SECRET.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const url = new URL(req.url)
    const apply = url.searchParams.get('apply') === 'true'
    const limitRaw = url.searchParams.get('limit')
    const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 5000) : undefined

    const result = await importSeoSheetPriorityProducts({ apply, limit })
    return Response.json({ ...result, dryRun: !apply })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
