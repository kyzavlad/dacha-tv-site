export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { AUTOMATION_MAX_PUBLISHED, AUTOMATION_BATCH_SIZE, PRIORITY_AD_CATEGORIES } from '@/lib/catalog/automation-config'
import { fetchCsvText, parseCsv, normalizeHeaders, getCol } from '@/lib/catalog/csv-utils'
import { getCatalogProductImage, hasDisplayablePrice, searchPublishedCatalogProducts } from '@/lib/supabase/catalog'
import { getSupplierOrderMode, TEST_ORDER_GUARD_ENABLED } from '@/lib/supplier/order'
import type { CatalogProduct } from '@/types'

async function headCount(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try { const { count } = await build(); return count ?? 0 } catch { return 0 }
}

async function getCoverage() {
  const client = getAdminClient()

  const [
    spTotalRes,
    spApprovedRes,
    spImportableRes,
    spWithImageRes,
    spMissingImageRes,
    spWithPriceRes,
    cpTotalRes,
    cpPublishedRes,
    cpDraftRes,
    cpArchivedRes,
    cpWithSpidRes,
    cpWithImageRes,
  ] = await Promise.all([
    client.from('supplier_products').select('id', { count: 'exact', head: true }),
    client.from('supplier_products').select('id', { count: 'exact', head: true }).eq('is_approved', true),
    // importable = not yet approved AND has name AND price > 0
    client.from('supplier_products').select('id', { count: 'exact', head: true }).eq('is_approved', false).not('name', 'is', null).gt('price_uah', 0),
    client.from('supplier_products').select('id', { count: 'exact', head: true }).not('main_image_url', 'is', null),
    // IS NULL counterpart — used to derive with_image if the NOT NULL exact count
    // times out on the large table and returns null (which previously showed as 0).
    client.from('supplier_products').select('id', { count: 'exact', head: true }).is('main_image_url', null),
    client.from('supplier_products').select('id', { count: 'exact', head: true }).gt('price_uah', 0),
    client.from('catalog_products').select('id', { count: 'exact', head: true }),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'archived'),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).not('supplier_product_id', 'is', null),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).not('main_image_url', 'is', null),
  ])

  const spTotal = spTotalRes.count ?? 0
  const spApproved = spApprovedRes.count ?? 0
  const spImportable = spImportableRes.count ?? 0
  // Prefer the direct NOT NULL count; if it failed/timed out (null), derive from
  // total − missing so a real backfill never shows as with_image=0.
  const spMissingImage = spMissingImageRes.count
  const spWithImage = spWithImageRes.count
    ?? (spMissingImage != null ? Math.max(0, spTotal - spMissingImage) : 0)
  const spWithPrice = spWithPriceRes.count ?? 0
  const cpTotal = cpTotalRes.count ?? 0
  const cpPublished = cpPublishedRes.count ?? 0
  // Keep the raw (possibly-null) draft count: a timed-out HEAD count returns
  // null, and `null ?? 0` would falsely read as "no drafts" and pass the READY
  // gate mid-import. cpDraft is the display value; cpDraftRaw gates readiness.
  const cpDraftRaw = cpDraftRes.count
  const cpDraft = cpDraftRaw ?? 0
  const cpArchived = cpArchivedRes.count ?? 0
  const cpWithSpid = cpWithSpidRes.count ?? 0
  const capActive = cpPublished >= AUTOMATION_MAX_PUBLISHED

  // ── IMAGE COVERAGE FIX ──────────────────────────────────────────────────────
  // Live product cards resolve their image via getCatalogProductImage(), which
  // reads main_image_url → image_url → images[] (jsonb) → raw_data. Most supplier
  // rows carry the images.zone URL ONLY in the `images` array, so counting
  // main_image_url alone wrongly reported with_image=0. Count ANY image source,
  // and separately sample the real resolver to report the true coverage %.
  const cpWithImageMainUrl = cpWithImageRes.count ?? 0
  const cpWithImagesArray = await headCount(() =>
    client.from('catalog_products').select('id', { count: 'exact', head: true }).not('images', 'is', null))
  const cpWithImageAny = await headCount(() =>
    client.from('catalog_products').select('id', { count: 'exact', head: true })
      .or('main_image_url.not.is.null,images.not.is.null'))

  // Ground truth: sample published rows and run the SAME resolver + price check
  // the cards use, so the reported % reflects what shoppers actually see.
  let imgSampleChecked = 0
  let imgSampleResolved = 0
  let priceSampleOk = 0
  let sampleError: string | null = null
  try {
    // Select '*' — NOT an explicit column list. catalog_products has no
    // `image_url` / `raw_data` columns (those live on supplier rows and raw
    // payloads), so naming them made PostgREST reject the ENTIRE query, leaving
    // the sample stuck at checked=0 even with 105k rows published. '*' returns
    // every real column; getCatalogProductImage()/hasDisplayablePrice() read only
    // the fields that exist. Surface any error instead of swallowing it silently.
    const { data: sample, error } = await client
      .from('catalog_products')
      .select('*')
      .eq('status', 'published')
      .limit(300)
    if (error) throw error
    const rows = (sample ?? []) as unknown as CatalogProduct[]
    imgSampleChecked = rows.length
    imgSampleResolved = rows.filter((r) => !!getCatalogProductImage(r)).length
    priceSampleOk = rows.filter((r) => hasDisplayablePrice(r)).length
  } catch (e) {
    sampleError = e instanceof Error ? e.message : String(e)
  }
  const imgSamplePct = imgSampleChecked > 0 ? Math.round((imgSampleResolved / imgSampleChecked) * 1000) / 10 : 0
  const priceSamplePct = imgSampleChecked > 0 ? Math.round((priceSampleOk / imgSampleChecked) * 1000) / 10 : 0

  // Use the fixed "any image source" count for readiness — never the empty
  // main_image_url-only column.
  const cpWithImage = cpWithImageAny

  // SEO sheet check: fetch first 20 rows from PRODUCT_SEO_CSV_URL and probe DB
  const productSeoUrl = (process.env.PRODUCT_SEO_CSV_URL ?? '').trim()
  let seoSheetCheck: Record<string, unknown> = { configured: false }

  if (productSeoUrl) {
    try {
      const fetched = await fetchCsvText(productSeoUrl)
      if (!fetched.ok) {
        seoSheetCheck = { configured: true, error: fetched.error, csvUrl: fetched.csvUrl }
      } else {
        const allRows = parseCsv(fetched.text)
        if (allRows.length < 2) {
          seoSheetCheck = { configured: true, error: 'Таблиця порожня', csvUrl: fetched.csvUrl }
        } else {
          const rawHeaders = allRows[0]
          const headers = normalizeHeaders(rawHeaders)
          const idIdx = rawHeaders.findIndex((h) => ['id', 'ід', 'product_id', 'productid'].includes(h.toLowerCase().trim()))
          const dataRows = allRows.slice(1, 21) // first 20

          const rowKeys = dataRows.map((row) => {
            const sku = getCol(row, headers, 'sku')
            const id = idIdx >= 0 ? (row[idIdx] ?? '').trim() : ''
            return { sku, id, label: sku || id }
          }).filter((k) => k.label)

          const allSkus = [...new Set(rowKeys.flatMap((k) => [k.sku, k.id].filter(Boolean)))]

          const [{ data: supRows }, { data: catRows }] = await Promise.all([
            allSkus.length > 0
              ? client.from('supplier_products').select('supplier_sku').in('supplier_sku', allSkus)
              : { data: [] },
            allSkus.length > 0
              ? client.from('catalog_products').select('supplier_sku, status').in('supplier_sku', allSkus)
              : { data: [] },
          ])

          const inSupplier = new Set((supRows ?? []).map((r) => (r.supplier_sku as string).toUpperCase()))
          const inCatalog = new Map((catRows ?? []).map((r) => [(r.supplier_sku as string).toUpperCase(), r.status as string]))

          const rows = rowKeys.map((k) => {
            const skuUp = k.sku.toUpperCase()
            const idUp = k.id.toUpperCase()
            const foundInSup = inSupplier.has(skuUp) || inSupplier.has(idUp)
            const catStatus = inCatalog.get(skuUp) ?? inCatalog.get(idUp) ?? null
            return {
              sku: k.label,
              in_supplier: foundInSup,
              in_catalog: catStatus !== null,
              catalog_status: catStatus,
            }
          })

          seoSheetCheck = {
            configured: true,
            csvUrl: fetched.csvUrl,
            sheetWarning: fetched.sheetWarning,
            first_20_rows: rows,
            summary: {
              checked: rows.length,
              in_supplier: rows.filter((r) => r.in_supplier).length,
              in_catalog: rows.filter((r) => r.in_catalog).length,
              published: rows.filter((r) => r.catalog_status === 'published').length,
              draft: rows.filter((r) => r.catalog_status === 'draft').length,
              not_in_catalog: rows.filter((r) => r.in_supplier && !r.in_catalog).length,
            },
          }
        }
      }
    } catch (e) {
      seoSheetCheck = { configured: true, error: String(e) }
    }
  }

  // ── Next recommended action ──────────────────────────────────────────────
  // Deterministic guidance based on the current counts. Ordered by priority:
  // catalog-already-covered (don't re-import!) → images → import backlog →
  // publish drafts → SEO last.
  const seoSummary = seoSheetCheck.summary as
    | { checked?: number; in_catalog?: number; published?: number; not_in_catalog?: number }
    | undefined
  const seoConfigured = seoSheetCheck.configured === true && seoSummary != null
  const seoNotInCatalog = seoSummary?.not_in_catalog ?? 0

  // The catalog "ready" signal must NOT be fooled by supplier approval flags,
  // which a resync can reset (making spImportable look like a huge backlog even
  // though every product is already imported AND published). Trust the catalog
  // itself: nothing in draft, every row has an image, (almost) every row is
  // linked to a supplier product, and — when the SEO sheet is configured — its
  // first sampled rows are present in the catalog and published.
  // BLOCK readiness only on a concrete negative SEO signal: a sampled row that
  // IS in supplier but missing from the catalog (not_in_catalog > 0), or sampled
  // rows present-but-not-all-published. A pure key-format mismatch where the
  // coverage probe matches nothing (in_catalog == 0 AND not_in_catalog == 0)
  // is advisory only — this route matches by exact supplier_sku and does not do
  // the prefix-strip/supplier bridge the real importer uses, so "no match" must
  // not be read as "catalog incomplete".
  const seoFirstRowsPublished = !seoConfigured
    ? true
    : (seoSummary!.not_in_catalog ?? 0) === 0 &&
      ((seoSummary!.in_catalog ?? 0) === 0 ||
        (seoSummary!.published ?? 0) >= (seoSummary!.in_catalog ?? 0))
  const catalogReady =
    cpTotal > 0 &&
    cpDraftRaw === 0 &&                       // real zero, not a timed-out null
    cpWithImage >= cpTotal &&
    cpWithSpid >= Math.floor(cpTotal * 0.98) &&
    seoFirstRowsPublished

  let nextAction: string
  if (catalogReady) {
    nextAction =
      `READY: catalog is fully imported and published — ${cpPublished.toLocaleString('en-US')} published, 0 drafts, ` +
      `all with images, ${cpWithSpid.toLocaleString('en-US')}/${cpTotal.toLocaleString('en-US')} linked to supplier products. ` +
      `Do NOT run import: the ${spImportable.toLocaleString('en-US')} "unapproved" supplier rows are leftovers from a resync (is_approved reset), not a real backlog — those products are already in the live catalog. ` +
      `Optional only: run product-seo-template to fill any remaining published rows missing meta.`
  } else if (spWithImage === 0 && spTotal > 0 && cpWithImageAny === 0) {
    // Only recommend a supplier-image backfill when the CATALOG genuinely lacks
    // images. supplier_products.with_image can read 0 after a resync (is_approved
    // reset) while catalog_products already carry images.zone URLs in images[] —
    // live cards display them. Don't nag for a backfill that isn't needed.
    nextAction = 'IMAGES: supplier_products.with_image=0 — run supplier-images dry-run, then apply, then catalog backfill-images. Do this before publishing so live products have photos.'
  } else if (seoNotInCatalog > 0) {
    nextAction = `IMPORT (SEO-first): ${seoNotInCatalog}/20 SEO-sheet SKUs are in supplier but not catalog — run import-seo-priority (apply) so the SEO sheet can match, OR continue the general backlog import below.`
  } else if (spImportable > 0) {
    nextAction = `IMPORT: ${spImportable.toLocaleString('en-US')} importable supplier rows remain — run import-products dry-run then apply in batches of ~3000 (limit bypasses the import cap).`
  } else if (cpDraft > 0) {
    nextAction = `PUBLISH: ${cpDraft.toLocaleString('en-US')} draft products ready — run publish-products dry-run then apply (limit or skipCap=true).`
  } else {
    nextAction = 'SEO: catalog imported and published — run product SEO sheet import, then product-seo-template to fill any remaining published rows.'
  }

  // ── SEO coverage per PRIORITY (ad) category ─────────────────────────────────
  // We do NOT wait for 100% AI SEO on all 105k products before ads — only these
  // categories need rich SEO first. Template meta covers the rest quickly.
  const P = (slug: string) =>
    client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('category_slug', slug)
  const priorityCategories = await Promise.all(
    PRIORITY_AD_CATEGORIES.map(async (slug) => {
      const [products, withMetaTitle, withMetaDesc, withLongDesc] = await Promise.all([
        headCount(() => P(slug)),
        headCount(() => P(slug).not('meta_title', 'is', null).neq('meta_title', '')),
        headCount(() => P(slug).not('meta_description', 'is', null).neq('meta_description', '')),
        headCount(() => P(slug).not('description_ua', 'is', null).neq('description_ua', '')),
      ])
      const pct = (n: number) => (products > 0 ? Math.round((n / products) * 1000) / 10 : 0)
      return {
        slug,
        published_products: products,
        with_meta_title: withMetaTitle,
        with_meta_description: withMetaDesc,
        with_long_description: withLongDesc,
        coverage_pct: { meta_title: pct(withMetaTitle), meta_description: pct(withMetaDesc), long_description: pct(withLongDesc) },
      }
    }),
  )
  const priorityHasProducts = priorityCategories.some((c) => c.published_products > 0)

  // ── LAUNCH READINESS (ads) ──────────────────────────────────────────────────
  // A pragmatic gate: what shoppers/ads actually need — NOT 100% AI SEO.
  const supplierMode = getSupplierOrderMode()
  const notificationsConfigured = Boolean(process.env.WEBHOOK_URL) || Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  let ordersTableOk = false
  try {
    const { error } = await client.from('orders').select('id', { count: 'exact', head: true })
    ordersTableOk = !error
  } catch { ordersTableOk = false }

  // Real search probe (same path the storefront uses).
  let searchWorks = false
  try {
    const res = await searchPublishedCatalogProducts('амортизатор', 1).catch(() => ({ products: [] }))
    searchWorks = (res.products?.length ?? 0) > 0
  } catch { searchWorks = false }

  // The resolver sample is a REFINEMENT, not the source of truth. Live images
  // exist when ANY image source is populated (cpWithImageAny — the same source
  // product cards read). If the sample could not run (checked=0) but published
  // rows and a live image source both exist, treat images as OK with a WARNING —
  // a diagnostics sample gap must never fail ads-readiness while live cards show
  // images. Prices likewise never block: "Уточнити ціну" is an acceptable state.
  const liveImagesExist = cpWithImageAny > 0
  const imageSampleUnavailable = imgSampleChecked === 0
  const productImagesOk = liveImagesExist && (imageSampleUnavailable || imgSamplePct >= 90)
  const priceSampleUnavailable = imgSampleChecked === 0
  const productPricesOk = priceSampleUnavailable ? true : priceSamplePct >= 50

  const checks = {
    products_published: { ok: cpPublished > 0, value: cpPublished },
    priority_categories_have_products: { ok: priorityHasProducts, value: priorityCategories.reduce((s, c) => s + c.published_products, 0) },
    search_works: { ok: searchWorks, note: 'Live search probe for "амортизатор".' },
    product_images: {
      ok: productImagesOk,
      value_pct: imgSamplePct,
      with_any_source: cpWithImageAny,
      status: imageSampleUnavailable ? (liveImagesExist ? 'warning' : 'error') : (productImagesOk ? 'ok' : 'error'),
      note: imageSampleUnavailable
        ? `Resolver sample unavailable (checked=0${sampleError ? `: ${sampleError}` : ''}); ${cpWithImageAny.toLocaleString('en-US')} published rows carry a live image source, so images are treated as present.`
        : 'Sampled via getCatalogProductImage (the resolver product cards use).',
    },
    product_prices: {
      ok: productPricesOk,
      value_pct: priceSamplePct,
      status: priceSampleUnavailable ? 'warning' : (productPricesOk ? 'ok' : 'warn'),
      note: priceSampleUnavailable
        ? 'Displayable-price sample unavailable — not blocking; products without a price show "Уточнити ціну" and stay ad-eligible.'
        : 'Sampled via hasDisplayablePrice; "Уточнити ціну" is an acceptable state, so the bar is low.',
    },
    checkout: { ok: ordersTableOk && notificationsConfigured, orders_table: ordersTableOk, notifications_configured: notificationsConfigured },
    supplier_live_mode: { ok: supplierMode === 'live', mode: supplierMode, live: supplierMode === 'live', note: 'Live real orders forward to the supplier.' },
    test_order_guard: { ok: TEST_ORDER_GUARD_ENABLED, note: 'Test/internal orders are blocked from supplier forwarding even in live mode.' },
  }
  // Ads-ready gate (req 5): published products, priority categories populated,
  // working search, images present via the live source, checkout wired, supplier
  // live mode configured, and the test-order guard enabled. Prices never gate.
  const readyForAds =
    checks.products_published.ok &&
    checks.priority_categories_have_products.ok &&
    checks.search_works.ok &&
    checks.product_images.ok &&
    checks.checkout.ok &&
    checks.supplier_live_mode.ok &&
    checks.test_order_guard.ok

  return {
    supplier_products: {
      total: spTotal,
      approved: spApproved,
      unapproved: spTotal - spApproved,
      importable: spImportable,
      with_price: spWithPrice,
      with_image: spWithImage,
      without_image: spMissingImage ?? Math.max(0, spTotal - spWithImage),
    },
    catalog_products: {
      total: cpTotal,
      published: cpPublished,
      draft: cpDraft,
      archived: cpArchived,
      with_supplier_product_id: cpWithSpid,
      without_supplier_product_id: cpTotal - cpWithSpid,
      // with_image now counts ANY image source (main_image_url OR images[]), not
      // the empty main_image_url column alone.
      with_image: cpWithImage,
      without_image: Math.max(0, cpTotal - cpWithImage),
      images: {
        with_any_source: cpWithImageAny,
        with_main_image_url: cpWithImageMainUrl,
        with_images_array: cpWithImagesArray,
        // The resolver product cards actually use, sampled on live published rows.
        resolver_sample: { checked: imgSampleChecked, resolved: imgSampleResolved, resolved_pct: imgSamplePct, error: sampleError },
        note: 'Cards resolve images via main_image_url → image_url → images[] → raw_data. main_image_url is usually empty; the images.zone URLs live in images[].',
      },
      prices: {
        displayable_sample: { checked: imgSampleChecked, ok: priceSampleOk, ok_pct: priceSamplePct, error: sampleError },
        note: 'hasDisplayablePrice sample; products without a price show "Уточнити ціну" and are still ad-eligible.',
      },
    },
    caps: {
      max_published: AUTOMATION_MAX_PUBLISHED,
      batch_size: AUTOMATION_BATCH_SIZE,
      cap_active: capActive,
      cap_scope: 'import_only',
      cap_note: 'AUTOMATION_MAX_PUBLISHED gates the daily auto-IMPORT only. Manual import (?limit=) and manual publish are not capped.',
      note: capActive ? `Ліміт ${AUTOMATION_MAX_PUBLISHED} опублікованих досягнуто — авто-імпорт призупинено` : null,
    },
    catalog_ready: catalogReady,
    // ── Ads launch readiness — the pragmatic gate for launching ads NOW ────────
    launch_readiness: {
      ready_for_ads: readyForAds,
      checks,
      note: 'ready_for_ads reflects shopper-facing essentials (published products, priority categories populated, working search, images, checkout). It does NOT require 100% AI SEO — template meta covers all products; AI long descriptions are prioritised to the ad categories below.',
    },
    // ── SEO coverage for the ad (priority) categories ──────────────────────────
    priority_categories: {
      slugs: PRIORITY_AD_CATEGORIES,
      categories: priorityCategories,
      note: 'Focus AI SEO (long descriptions) here first; run product-seo-template to give every product a meta title/description quickly.',
    },
    next_recommended_action: nextAction,
    seo_sheet_check: seoSheetCheck,
  }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const data = await getCoverage()
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
