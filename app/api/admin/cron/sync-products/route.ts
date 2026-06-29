export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { syncSupplierProducts } from '@/lib/supplier/sync'

// Supplier product sync — BOUNDED + RESUMABLE.
//
// The personal.cab feed returns the whole catalog (~112k rows) in one response
// with no server-side limit/offset, so the previous code (which always processed
// the first 1000 rows from offset 0) could never grow supplier_products past
// 1000. This endpoint downloads the feed once and processes a window
// [offset, offset+limit), possibly several windows per call until a wall-clock
// budget is hit, then returns nextOffset/done so it can be resumed.
//
// Query params (all optional):
//   limit     window size, rows per page        (default 1000, max 5000)
//   offset    resume point into the feed          (default 0)
//   page      0-based page → offset = page*limit  (alternative to offset)
//   maxPages  windows processed in this call      (default 1; ?mode=full → 1000)
//   maxMillis wall-clock budget per call (ms)      (default 45000, max 55000)
//   mode=full convenience: process as many windows as fit in maxMillis
//
// maxMillis is capped under maxDuration (60s) so the platform never kills the
// function mid-loop (which would strand the sync_log row and lose nextOffset).
//
// Safe default (no params): one window of 1000 — identical to the old behaviour.
//
// Loop the FULL sync from a terminal (see docs/production-recovery.md). The loop
// ABORTS if a call returns no nextOffset (e.g. a 504), instead of silently
// restarting from offset 0:
//   off=0; while :; do
//     r=$(curl -s -H "Authorization: Bearer $CRON_SECRET" \
//       "$SITE/api/admin/cron/sync-products?mode=full&offset=$off")
//     echo "$r" | jq '{totalInFeed,processed,inserted,updated,nextOffset,done,errors}'
//     done=$(echo "$r" | jq -r '.done'); off=$(echo "$r" | jq -r '.nextOffset')
//     [ "$done" = "true" ] && break
//     [ -z "$off" ] || [ "$off" = "null" ] && { echo "no nextOffset (possible timeout) — aborting"; break; }
//   done
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const intParam = (k: string): number | undefined => {
    const v = url.searchParams.get(k)
    if (v == null || v === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  const full = url.searchParams.get('mode') === 'full' || url.searchParams.get('full') === 'true'
  const limit = intParam('limit') ?? 1000
  const pageParam = intParam('page')
  const offset = intParam('offset') ?? (pageParam != null ? pageParam * limit : 0)
  // In full mode, allow many windows per call (still bounded by maxMillis); a
  // plain call stays at one window for safety/back-compat.
  const maxPages = intParam('maxPages') ?? (full ? 1000 : 1)
  // Hard-cap under the function's maxDuration (60s); sync.ts also clamps, this
  // keeps the route honest about its own advertised maximum.
  const maxMillis = Math.min(intParam('maxMillis') ?? 45000, 55000)

  const result = await syncSupplierProducts({ limit, offset, maxPages, maxMillis })

  return Response.json({
    ok: result.ok,
    totalInFeed: result.totalInFeed ?? null,
    processed: result.processed ?? result.synced,
    inserted: result.inserted ?? null,
    updated: result.updated ?? null,
    synced: result.synced,
    nextOffset: result.nextOffset ?? null,
    done: result.done ?? null,
    errors: result.errors,
    message: result.message,
    priceWarning: result.priceWarning,
  })
}
