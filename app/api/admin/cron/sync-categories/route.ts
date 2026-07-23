export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { syncSupplierCategories } from '@/lib/supplier/sync'
import {
  syncCatalogCategories,
  publishAllCatalogCategories,
  backfillCategorySlugs,
  repairCategoryNamesFromProducts,
} from '@/lib/catalog/pipeline'
import { runCronStage } from '@/lib/catalog/cron-stage'

// Bounded, crash-safe category chain (01:00 UTC):
//   1. supplier_categories refresh — LIGHTWEIGHT ONLY. syncSupplierCategories()
//      tries the dedicated get_categories endpoint; if that returns nothing it
//      does NOT fall back to downloading get_products (JSON/YML/XML) — it
//      reports whatever supplier_categories already holds from the last
//      products sync (which extracts categories from the SAME response it
//      already downloads for products — see lib/supplier/sync.ts). This
//      endpoint therefore never downloads the ~112k-product feed, which used
//      to spike memory on the 3.7GB self-host box and get PM2-restarted
//      mid-request.
//   2. catalog_categories sync from supplier_categories (small table)
//   3. numeric-name repair, from data already in the DB — no feed re-download
//   4. publish eligible catalog categories (bounded — capped at 5000/run)
//   5. category_slug backfill — a single set-based SQL RPC call (already bounded)
//
// Every stage is isolated by runCronStage (lib/catalog/cron-stage.ts): a stage
// that throws is caught and recorded as a failed stage in the response — it
// does NOT stop the remaining stages or crash the Node process. `ok` is true
// only when every stage's own `ok` is true, but a non-critical stage issue
// (e.g. a positive `remaining` count) never prevents products/import/publish
// — those are entirely separate cron endpoints, called independently, and are
// never gated on this route's result.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const apiResult      = await runCronStage(() => syncSupplierCategories())
  const catResult      = await runCronStage(() => syncCatalogCategories())
  const repairResult   = await runCronStage(() => repairCategoryNamesFromProducts())
  const pubResult      = await runCronStage(() => publishAllCatalogCategories())
  const backfillResult = await runCronStage(() => backfillCategorySlugs())

  const ok = apiResult.ok && catResult.ok && repairResult.ok && pubResult.ok && backfillResult.ok

  return Response.json({
    ok,
    // Same top-level keys as before (api/catalog/repair/publish/backfill) —
    // preserved for any existing external caller — but each now carries the
    // full truthful per-stage contract: ok, processed/updated, remaining,
    // errors, durationMs.
    api:      apiResult,
    catalog:  catResult,
    repair:   repairResult,
    publish:  pubResult,
    backfill: backfillResult,
  })
}
