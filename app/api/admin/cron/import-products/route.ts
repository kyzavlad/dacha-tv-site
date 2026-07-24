export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { importBatch } from '@/lib/catalog/automation'
import { syncProductsToCatalog } from '@/lib/catalog/pipeline'
import { getRefreshQueueCounts } from '@/lib/catalog/existing-product-refresh'
import { getAdminClient } from '@/lib/supabase/admin'
import { EXISTING_REFRESH_BATCH_SIZE } from '@/lib/catalog/automation-config'

// GET (no params) → apply with the default existing-row refresh batch (5000)
// GET ?dry=true   → dry-run: returns wouldInsert/wouldUpdate counts, writes nothing
// GET ?limit=N    → apply with a custom limit (manual bulk import, no cap check)
// GET ?counts=true → ALSO attach exact queue counts (a deliberate, separate
//                    diagnostic scan — never run on the normal batch loop)
//
// Loop contract: call repeatedly while `hasMore` is true (equivalently, while
// `remaining` > 0). The existing-row refresh is now one bounded, scan-free
// set-based RPC (v7 migration), and this endpoint no longer runs three exact
// whole-queue COUNT scans on every call — that was the statement-timeout cause.
// `remaining` is a PROGRESS proxy on the fast path (>0 while more work remains,
// 0 once drained), so an old runner looping "until remaining == 0" still
// terminates; `hasMore`/`done` are the explicit signals for a newer runner.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === 'true'
  const wantCounts = url.searchParams.get('counts') === 'true'
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw
    ? Math.min(Math.max(parseInt(limitRaw, 10) || EXISTING_REFRESH_BATCH_SIZE, 1), 10000)
    : EXISTING_REFRESH_BATCH_SIZE

  if (dry) {
    const result = await syncProductsToCatalog(limit, { dryRun: true })
    return Response.json({ ...result, dryRun: true })
  }

  // Custom limit implies a manual bulk run — bypass the published cap so large
  // imports are not silently skipped.
  const skipCap = !!limitRaw
  const result = await importBatch(limit, { skipCap })

  const hasMore = result.hasMore ?? ((result.remaining ?? 0) > 0)

  // Exact queue counts are OPT-IN only (requirement 6): a separate diagnostic
  // RPC that DOES scan the whole queue, run only when explicitly requested —
  // never on the normal per-batch loop.
  let queueCounts: Awaited<ReturnType<typeof getRefreshQueueCounts>> | undefined
  if (wantCounts) {
    queueCounts = await getRefreshQueueCounts(getAdminClient())
  }

  return Response.json({
    ok: result.ok,
    processed: result.processed ?? 0,
    inserted: result.inserted ?? result.imported ?? 0,
    updated: result.updated ?? 0,
    approved: result.approved ?? 0,
    skipped: result.insertsSkippedCap ?? 0,
    failed: result.failed ?? result.errors ?? 0,
    // Canonical loop signals derived from real batch progress (no full scans).
    hasMore,
    done: !hasMore,
    // Progress proxy for backward compatibility with "loop until remaining==0".
    remaining: result.remaining ?? (hasMore ? 1 : 0),
    errorGroups: result.errorGroups ?? {},
    message: result.message,
    // Only present with ?counts=true — the deliberate diagnostic scan.
    ...(queueCounts ? { queueCounts } : {}),
  })
}
