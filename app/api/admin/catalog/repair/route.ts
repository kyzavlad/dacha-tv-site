export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { inspectSupplierFeeds, syncSupplierCategories } from '@/lib/supplier/sync'
import {
  syncCatalogCategories,
  repairCategoryNamesFromProducts,
  publishAllCatalogCategories,
  backfillCategorySlugs,
  normalizeAndFinalizeCategories,
} from '@/lib/catalog/pipeline'

// ─── Full catalog repair + proof report ──────────────────────────────────────
// GET  → current state only (read-only diagnostic)
// POST → runs full repair chain, returns before/after proof report
//
// Protected by CRON_SECRET.
// curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/catalog/repair

async function getSnapshot(client: ReturnType<typeof getAdminClient>) {
  const [
    { count: supplierCatsTotal },
    { count: supplierCatsNumeric },
    { count: catalogCatsTotal },
    { count: catalogCatsPublished },
    { count: catalogCatsNumeric },
    { count: productsTotal },
    { count: productsPublished },
    { count: productsCategoryNull },
  ] = await Promise.all([
    client.from('supplier_categories').select('id', { count: 'exact', head: true }),
    client.from('supplier_categories').select('id', { count: 'exact', head: true }).filter('name', 'ilike', '0%').or('name.ilike.1%,name.ilike.2%,name.ilike.3%,name.ilike.4%,name.ilike.5%,name.ilike.6%,name.ilike.7%,name.ilike.8%,name.ilike.9%'),
    client.from('catalog_categories').select('id', { count: 'exact', head: true }),
    client.from('catalog_categories').select('id', { count: 'exact', head: true }).eq('is_published', true),
    client.from('catalog_categories').select('id', { count: 'exact', head: true }).filter('name_ua', 'ilike', '0%').or('name_ua.ilike.1%,name_ua.ilike.2%,name_ua.ilike.3%,name_ua.ilike.4%,name_ua.ilike.5%,name_ua.ilike.6%,name_ua.ilike.7%,name_ua.ilike.8%,name_ua.ilike.9%'),
    client.from('catalog_products').select('id', { count: 'exact', head: true }),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).is('category_slug', null),
  ])

  // Price-trace + suspicious-price metrics (HEAD counts — no row transfer).
  const [
    { count: supplierWinNull },
    { count: supplierWinNone },
    { count: supplierCurrencyNull },
    { count: catalogSuspicious },
    { count: catalogNoPrice },
    { count: catalogPublishedInNumeric },
  ] = await Promise.all([
    client.from('supplier_products').select('id', { count: 'exact', head: true }).is('price_win_field', null),
    client.from('supplier_products').select('id', { count: 'exact', head: true }).eq('price_win_field', 'none'),
    client.from('supplier_products').select('id', { count: 'exact', head: true }).is('supplier_price_currency', null),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('is_price_suspicious', true),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).lt('price_uah', 10),
    // published products whose category_slug points at a numeric-named category
    (async () => {
      const { data } = await client.from('catalog_categories').select('slug, name_ua').limit(2000)
      const numSlugs = (data ?? []).filter(r => /^\d+$/.test(String(r.name_ua ?? ''))).map(r => r.slug as string).filter(Boolean)
      if (numSlugs.length === 0) return { count: 0 }
      let total = 0
      for (let i = 0; i < numSlugs.length; i += 100) {
        const { count } = await client.from('catalog_products')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published').in('category_slug', numSlugs.slice(i, i + 100))
        total += count ?? 0
      }
      return { count: total }
    })(),
  ])

  // Exact count of numeric names (the ilike trick above over-counts — do a JS filter instead)
  const { data: allSupCats } = await client.from('supplier_categories').select('supplier_id, name, name_ua').order('supplier_id').limit(2000)
  const { data: allCatCats } = await client.from('catalog_categories').select('id, slug, name_ua, is_published').order('name_ua').limit(2000)

  const numericSupplier = (allSupCats ?? []).filter(r => /^\d+$/.test(String(r.name ?? '')))
  const numericCatalog  = (allCatCats ?? []).filter(r => /^\d+$/.test(String(r.name_ua ?? '')))
  const publishedCatalog = (allCatCats ?? []).filter(r => r.is_published)

  // Price samples — cheapest 5 + winField distribution
  const { data: priceSamples } = await client
    .from('supplier_products')
    .select('supplier_sku, price_uah, supplier_price_usd, supplier_price_rate, price_win_field, supplier_price_currency')
    .not('price_uah', 'is', null)
    .order('price_uah', { ascending: true })
    .limit(10)

  const { data: suspiciousProducts } = await client
    .from('catalog_products')
    .select('supplier_sku, price_uah, is_price_suspicious')
    .eq('is_price_suspicious', true)
    .order('price_uah', { ascending: true })
    .limit(5)

  // Category → product count (for after-state)
  const { data: catProductCounts } = await client
    .from('catalog_products')
    .select('category_slug')
    .eq('status', 'published')
    .not('category_slug', 'is', null)
    .limit(5000)

  const countByCat: Record<string, number> = {}
  for (const row of catProductCounts ?? []) {
    const slug = row.category_slug as string
    countByCat[slug] = (countByCat[slug] ?? 0) + 1
  }
  const topCategories = Object.entries(countByCat)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([slug, count]) => ({ slug, count }))

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.dachatv.com'
  const sampleUrls = topCategories.slice(0, 3).map(c => `${siteUrl}/catalog/${c.slug}`)

  return {
    counts: {
      supplier_categories: supplierCatsTotal ?? 0,
      supplier_categories_numeric: numericSupplier.length,
      catalog_categories: catalogCatsTotal ?? 0,
      catalog_categories_published: publishedCatalog.length,
      catalog_categories_numeric: numericCatalog.length,
      catalog_products: productsTotal ?? 0,
      catalog_products_published: productsPublished ?? 0,
      catalog_products_category_null: productsCategoryNull ?? 0,
      catalog_products_published_in_numeric: catalogPublishedInNumeric ?? 0,
    },
    price_trace: {
      supplier_win_field_null: supplierWinNull ?? 0,
      supplier_win_field_none: supplierWinNone ?? 0,
      supplier_currency_null: supplierCurrencyNull ?? 0,
      catalog_suspicious: catalogSuspicious ?? 0,
      catalog_no_price: catalogNoPrice ?? 0,
    },
    supplier_category_samples: numericSupplier.slice(0, 5).map(r => ({ id: r.supplier_id, name: r.name, name_ua: r.name_ua })),
    catalog_category_samples: (allCatCats ?? []).slice(0, 8).map(r => ({ slug: r.slug, name: r.name_ua, published: r.is_published })),
    price_samples: (priceSamples ?? []).map(r => ({
      sku: r.supplier_sku,
      price_uah: r.price_uah,
      supplier_price_usd: r.supplier_price_usd,
      fx_rate: r.supplier_price_rate,
      win_field: r.price_win_field,
      currency: r.supplier_price_currency,
    })),
    suspicious_products: (suspiciousProducts ?? []).map(r => ({
      sku: r.supplier_sku,
      price_uah: r.price_uah,
    })),
    top_category_product_counts: topCategories,
    sample_urls: sampleUrls,
  }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const client = getAdminClient()
  const snapshot = await getSnapshot(client)

  // Also run feed diagnostic (read-only)
  let feedDiag: Record<string, unknown> = {}
  try {
    feedDiag = (await inspectSupplierFeeds()) as unknown as Record<string, unknown>
  } catch (e) {
    feedDiag = { error: e instanceof Error ? e.message : String(e) }
  }

  return Response.json({ ok: true, snapshot, feed_diagnostic: feedDiag })
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const client = getAdminClient()

  const before = await getSnapshot(client)

  // Run feed diagnostic first to understand the source
  let feedDiag: Record<string, unknown> = {}
  try {
    feedDiag = (await inspectSupplierFeeds()) as unknown as Record<string, unknown>
  } catch (e) {
    feedDiag = { error: e instanceof Error ? e.message : String(e) }
  }

  // Full repair chain
  const t0 = Date.now()
  const apiResult      = await syncSupplierCategories().catch((e: unknown) => ({ ok: false, message: String(e), synced: 0, errors: 1 }))
  const catResult      = await syncCatalogCategories().catch((e: unknown) => ({ ok: false, message: String(e), inserted: 0, skipped: 0, numericFixed: 0 }))
  const repairResult   = await repairCategoryNamesFromProducts().catch((e: unknown) => ({ ok: false, message: String(e), supplierFixed: 0, catalogFixed: 0, remaining: 999 }))
  const pubResult      = await publishAllCatalogCategories().catch((e: unknown) => ({ ok: false, message: String(e), updated: 0 }))
  const backfillResult = await backfillCategorySlugs().catch((e: unknown) => ({ ok: false, message: String(e), updated: 0, skipped: 0 }))
  // Final pass: weak-name cleanup, duplicate merge, and numeric finalisation so
  // the public numeric-category count and published-in-numeric count both hit 0.
  const finalizeResult = await normalizeAndFinalizeCategories().catch((e: unknown) => ({
    ok: false, message: String(e), renamed: 0, merged: 0, productsMoved: 0,
    numericNeutralized: 0, productsRelinked: 0, numericRemaining: 999, publishedInNumeric: 999,
  }))

  const after = await getSnapshot(client)
  const duration_ms = Date.now() - t0

  // SQL summary for the proof report
  const sql_used = [
    '-- Step 1: syncSupplierCategories (upsert to supplier_categories from API)',
    "SELECT supplier_id, name, name_ua FROM supplier_categories ORDER BY supplier_id LIMIT 10;",
    '',
    '-- Step 2: syncCatalogCategories (insert/fix catalog_categories from supplier_categories)',
    "SELECT slug, name_ua, is_published FROM catalog_categories ORDER BY name_ua LIMIT 10;",
    '',
    '-- Step 3: repairCategoryNamesFromProducts (YML/XML source → fix numeric names)',
    "UPDATE catalog_categories SET name_ua = $name, slug = $slug WHERE name_ua ~ '^\\d+$';",
    '',
    '-- Step 4: publishAllCatalogCategories',
    "UPDATE catalog_categories SET is_published = true WHERE is_published = false;",
    '',
    '-- Step 5: backfillCategorySlugs (fix catalog_products.category_slug via supplier chain)',
    "UPDATE catalog_products SET category_slug = $slug WHERE id = ANY($ids);",
    '',
    '-- Diagnostic counts',
    "SELECT COUNT(*) FROM catalog_categories WHERE is_published = true;",
    "SELECT COUNT(*) FROM catalog_products WHERE status = 'published' AND category_slug IS NULL;",
    "SELECT category_slug, COUNT(*) FROM catalog_products WHERE status='published' GROUP BY category_slug ORDER BY COUNT(*) DESC LIMIT 10;",
  ].join('\n')

  return Response.json({
    ok: true,
    duration_ms,
    sql_used,
    feed_diagnostic: feedDiag,
    repair_steps: {
      syncSupplierCategories: { synced: apiResult.synced, errors: apiResult.errors, message: apiResult.message },
      syncCatalogCategories: { inserted: catResult.inserted, skipped: catResult.skipped, numericFixed: catResult.numericFixed, message: catResult.message },
      repairCategoryNames: { supplierFixed: repairResult.supplierFixed, catalogFixed: repairResult.catalogFixed, remaining: repairResult.remaining, message: repairResult.message },
      publishCategories: { updated: pubResult.updated, message: pubResult.message },
      backfillSlugs: { updated: backfillResult.updated, skipped: backfillResult.skipped, message: backfillResult.message },
      normalizeFinalize: {
        renamed: finalizeResult.renamed, merged: finalizeResult.merged,
        productsMoved: finalizeResult.productsMoved, numericNeutralized: finalizeResult.numericNeutralized,
        numericRemaining: finalizeResult.numericRemaining, publishedInNumeric: finalizeResult.publishedInNumeric,
        message: finalizeResult.message,
      },
    },
    before,
    after,
    diff: {
      catalog_categories_published:     (after.counts.catalog_categories_published ?? 0) - (before.counts.catalog_categories_published ?? 0),
      numeric_categories_before_after:  [before.counts.catalog_categories_numeric ?? 0, after.counts.catalog_categories_numeric ?? 0],
      published_in_numeric_before_after:[before.counts.catalog_products_published_in_numeric ?? 0, after.counts.catalog_products_published_in_numeric ?? 0],
      suspicious_before_after:          [before.price_trace.catalog_suspicious, after.price_trace.catalog_suspicious],
      no_price_before_after:            [before.price_trace.catalog_no_price, after.price_trace.catalog_no_price],
      supplier_win_field_null_before_after: [before.price_trace.supplier_win_field_null, after.price_trace.supplier_win_field_null],
      products_with_null_category:      (before.counts.catalog_products_category_null ?? 0) - (after.counts.catalog_products_category_null ?? 0),
    },
  })
}
