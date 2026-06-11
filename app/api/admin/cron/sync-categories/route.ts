export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { syncSupplierCategories } from '@/lib/supplier/sync'
import {
  syncCatalogCategories,
  publishAllCatalogCategories,
  backfillCategorySlugs,
  repairCategoryNamesFromProducts,
} from '@/lib/catalog/pipeline'

// Full category chain in one cron run (01:00 UTC):
//   1. Sync supplier categories from API
//   2. Create / update catalog_categories from supplier_categories
//   3. Repair any numeric category names deterministically from the real
//      supplier YML/XML <categories> source (so production self-heals daily
//      without anyone clicking the admin button)
//   4. Publish any unpublished catalog categories
//   5. Backfill category_slug on catalog_products imported before categories existed
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const apiResult      = await syncSupplierCategories()
  const catResult      = await syncCatalogCategories()
  const repairResult   = await repairCategoryNamesFromProducts()
  const pubResult      = await publishAllCatalogCategories()
  const backfillResult = await backfillCategorySlugs()

  return Response.json({
    ok: apiResult.ok && catResult.ok,
    api:      { synced: apiResult.synced, errors: apiResult.errors, message: apiResult.message },
    catalog:  { inserted: catResult.inserted, numericFixed: catResult.numericFixed, message: catResult.message },
    repair:   { supplierFixed: repairResult.supplierFixed, catalogFixed: repairResult.catalogFixed, remaining: repairResult.remaining, message: repairResult.message },
    publish:  { updated: pubResult.updated, message: pubResult.message },
    backfill: { updated: backfillResult.updated, skipped: backfillResult.skipped, message: backfillResult.message },
  })
}
