export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { refreshExistingCatalogFromSupplier } from '@/lib/catalog/existing-product-refresh'
import { EXISTING_REFRESH_BATCH_SIZE } from '@/lib/catalog/automation-config'

function intParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key)
  if (!raw) return undefined
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

// Existing supplier-owned catalog rows are the large daily queue. Keep this
// stage separate from genuinely-new SKU discovery: import-products also scans
// for new rows and catalog slugs, work that is unnecessary on every 300-row
// existing refresh batch (especially once the new-product publication cap is
// already reached).
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const batchSize = intParam(url, 'batchSize') ?? EXISTING_REFRESH_BATCH_SIZE
  const result = await refreshExistingCatalogFromSupplier(getAdminClient(), batchSize)

  return Response.json({
    ok: result.ok,
    processed: result.processed,
    updated: result.updated,
    approved: result.approved,
    hasMore: result.hasMore,
    done: result.ok && !result.hasMore,
    message: result.message,
  }, { status: result.ok ? 200 : 500 })
}
