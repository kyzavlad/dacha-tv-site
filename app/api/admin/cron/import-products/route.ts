export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { importBatch } from '@/lib/catalog/automation'
import { syncProductsToCatalog } from '@/lib/catalog/pipeline'
import { AUTOMATION_BATCH_SIZE } from '@/lib/catalog/automation-config'

// GET (no params) → apply with default batch size (cron-compatible)
// GET ?dry=true   → dry-run: returns wouldInsert/wouldUpdate counts, writes nothing
// GET ?limit=N    → apply with custom limit (manual bulk import, no cap check)
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === 'true'
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw
    ? Math.min(Math.max(parseInt(limitRaw, 10) || AUTOMATION_BATCH_SIZE, 1), 10000)
    : AUTOMATION_BATCH_SIZE

  if (dry) {
    const result = await syncProductsToCatalog(limit, { dryRun: true })
    return Response.json({ ...result, dryRun: true })
  }

  // Custom limit implies a manual bulk run — bypass the published cap so large
  // imports are not silently skipped.
  const skipCap = !!limitRaw
  const result = await importBatch(limit, { skipCap })
  return Response.json(result)
}
