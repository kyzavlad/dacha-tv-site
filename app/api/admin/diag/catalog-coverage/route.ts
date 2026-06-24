export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { AUTOMATION_MAX_PUBLISHED, AUTOMATION_BATCH_SIZE } from '@/lib/catalog/automation-config'
import { fetchCsvText, parseCsv, normalizeHeaders, getCol } from '@/lib/catalog/csv-utils'

async function getCoverage() {
  const client = getAdminClient()

  const [
    spTotalRes,
    spApprovedRes,
    spImportableRes,
    spWithImageRes,
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
  const spWithImage = spWithImageRes.count ?? 0
  const spWithPrice = spWithPriceRes.count ?? 0
  const cpTotal = cpTotalRes.count ?? 0
  const cpPublished = cpPublishedRes.count ?? 0
  const cpDraft = cpDraftRes.count ?? 0
  const cpArchived = cpArchivedRes.count ?? 0
  const cpWithSpid = cpWithSpidRes.count ?? 0
  const cpWithImage = cpWithImageRes.count ?? 0
  const capActive = cpPublished >= AUTOMATION_MAX_PUBLISHED

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
              not_in_catalog: rows.filter((r) => r.in_supplier && !r.in_catalog).length,
            },
          }
        }
      }
    } catch (e) {
      seoSheetCheck = { configured: true, error: String(e) }
    }
  }

  return {
    supplier_products: {
      total: spTotal,
      approved: spApproved,
      unapproved: spTotal - spApproved,
      importable: spImportable,
      with_price: spWithPrice,
      with_image: spWithImage,
    },
    catalog_products: {
      total: cpTotal,
      published: cpPublished,
      draft: cpDraft,
      archived: cpArchived,
      with_supplier_product_id: cpWithSpid,
      without_supplier_product_id: cpTotal - cpWithSpid,
      with_image: cpWithImage,
      without_image: cpTotal - cpWithImage,
    },
    caps: {
      max_published: AUTOMATION_MAX_PUBLISHED,
      batch_size: AUTOMATION_BATCH_SIZE,
      cap_active: capActive,
      note: capActive ? `Ліміт ${AUTOMATION_MAX_PUBLISHED} опублікованих досягнуто — авто-імпорт призупинено` : null,
    },
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
