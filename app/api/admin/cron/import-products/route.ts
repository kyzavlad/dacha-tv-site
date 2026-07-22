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

  // Explicit, documented response contract: a 10,000-row existing-product
  // refresh now runs as one set-based RPC call (see
  // lib/catalog/existing-product-refresh.ts) instead of a sequential per-SKU
  // update loop, so this endpoint completes well within the serverless
  // timeout. Call repeatedly until `remaining` is 0. `remaining` is
  // ACTIONABLE-only (remainingExisting + remainingNew) — it deliberately
  // excludes `blockedManual` (supplier rows shadowed by a source='manual'
  // catalog row, which neither path may ever touch), so the loop actually
  // terminates once all real work is done. blockedManual is reported
  // separately for diagnostics.
  return Response.json({
    ok: result.ok,
    processed: result.processed ?? 0,
    inserted: result.inserted ?? result.imported ?? 0,
    updated: result.updated ?? 0,
    approved: result.approved ?? 0,
    skipped: result.insertsSkippedCap ?? 0,
    failed: result.failed ?? result.errors ?? 0,
    remaining: result.remaining ?? 0,
    remainingExisting: result.remainingExisting ?? 0,
    remainingNew: result.remainingNew ?? 0,
    blockedManual: result.blockedManual ?? 0,
    errorGroups: result.errorGroups ?? {},
    message: result.message,
  })
}
