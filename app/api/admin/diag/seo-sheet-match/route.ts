export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  fetchCsvText, parseCsv, normalizeHeaders, getCol, autoSlug,
} from '@/lib/catalog/csv-utils'

// ─── READ-ONLY diagnostic: why does the SEO sheet not match the catalog? ───────
// Fetches the product + category CSV URLs from env, parses the first N rows of
// each (default 20), and probes EVERY plausible match strategy independently so
// we can see exactly which key aligns the sheet with the catalog. Writes nothing.
//
//   GET /api/admin/diag/seo-sheet-match            → first 20 rows of each
//   GET /api/admin/diag/seo-sheet-match?limit=50   → first 50 rows of each
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<site>/api/admin/diag/seo-sheet-match?limit=20"
//
// Strategies probed
//   products:
//     • catalog_products.supplier_sku        == CSV SKU        (exact, case-insensitive)
//     • catalog_products.supplier_sku        == CSV ID         (sheet ID column, if present)
//     • catalog_products.supplier_sku        == CSV SKU w/o prefix (e.g. S-1875 → 1875)
//     • supplier_products.supplier_sku       == CSV SKU/ID → catalog_products.supplier_product_id
//   categories:
//     • catalog_categories.name_ua           == CSV category   (case-insensitive)
//     • catalog_categories.slug              == slug(CSV category)
//     • catalog_categories.slug              == autoSlug(CSV category)
//     • supplier_categories.name             == CSV category → linked catalog row
//     • supplier_categories.name_ua          == CSV category → linked catalog row

const U = (s: unknown) => String(s ?? '').trim().toUpperCase()
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

// "S-1875" → "1875", "C-25" → "25"; leaves plain values unchanged.
function stripPrefix(s: string): string {
  const m = s.trim().match(/^[A-Za-z]{1,4}[-_ ]?(\d.*)$/)
  return m ? m[1] : s.trim()
}

function parseLimit(req: Request): number {
  const raw = new URL(req.url).searchParams.get('limit')
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 20
}

// Find a raw column index by any of the given header aliases (case-insensitive).
function rawIdx(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(h.toLowerCase().trim()))
}

async function diagProducts(limit: number) {
  const csvUrl = (process.env.PRODUCT_SEO_CSV_URL ?? '').trim()
  if (!csvUrl) return { ok: false, message: 'PRODUCT_SEO_CSV_URL не встановлено в env vars.' }

  const fetched = await fetchCsvText(csvUrl)
  if (!fetched.ok) {
    return {
      ok: false, message: fetched.error, csvUrl: fetched.csvUrl,
      httpStatus: fetched.httpStatus, contentType: fetched.contentType, finalUrl: fetched.finalUrl,
    }
  }

  const allRows = parseCsv(fetched.text)
  if (allRows.length < 2) return { ok: false, message: 'Таблиця порожня.', csvUrl: fetched.csvUrl }

  const rawHeaders = allRows[0]
  const headers = normalizeHeaders(rawHeaders)
  const idIdx = rawIdx(rawHeaders, ['id', 'ід', 'product_id', 'productid'])
  const dataRows = allRows.slice(1, 1 + limit)

  // Per-row extracted keys.
  const rowKeys = dataRows.map((row) => {
    const sku = getCol(row, headers, 'sku')
    const id = idIdx >= 0 ? (row[idIdx] ?? '').trim() : ''
    return { sku, id, skuStripped: stripPrefix(sku), idStripped: stripPrefix(id) }
  })

  // Collect every candidate key (uppercased) to load only relevant rows.
  const candidates = new Set<string>()
  for (const k of rowKeys) {
    for (const v of [k.sku, k.id, k.skuStripped, k.idStripped]) if (v) candidates.add(U(v))
  }
  const candList = [...candidates]

  const client = getAdminClient()

  // catalog_products by supplier_sku
  type Cat = { id: string; supplier_sku: string | null; supplier_product_id: string | null }
  const catBySku = new Map<string, Cat>()        // upper(supplier_sku) → row
  const catByStripped = new Map<string, Cat>()    // upper(strip(supplier_sku)) → row
  for (let i = 0; i < candList.length; i += 300) {
    const { data } = await client
      .from('catalog_products')
      .select('id, supplier_sku, supplier_product_id')
      .in('supplier_sku', candList.slice(i, i + 300))
    for (const c of (data ?? []) as Cat[]) {
      if (c.supplier_sku) {
        catBySku.set(U(c.supplier_sku), c)
        catByStripped.set(U(stripPrefix(c.supplier_sku)), c)
      }
    }
  }

  // supplier_products by supplier_sku → its id → catalog_products.supplier_product_id
  type Sup = { id: string; supplier_sku: string | null }
  const supBySku = new Map<string, Sup>()
  for (let i = 0; i < candList.length; i += 300) {
    const { data } = await client
      .from('supplier_products')
      .select('id, supplier_sku')
      .in('supplier_sku', candList.slice(i, i + 300))
    for (const s of (data ?? []) as Sup[]) {
      if (s.supplier_sku) supBySku.set(U(s.supplier_sku), s)
    }
  }
  const supIds = [...new Set([...supBySku.values()].map((s) => s.id))]
  const catBySupplierProductId = new Map<string, Cat>()
  for (let i = 0; i < supIds.length; i += 300) {
    const { data } = await client
      .from('catalog_products')
      .select('id, supplier_sku, supplier_product_id')
      .in('supplier_product_id', supIds.slice(i, i + 300))
    for (const c of (data ?? []) as Cat[]) {
      if (c.supplier_product_id) catBySupplierProductId.set(c.supplier_product_id, c)
    }
  }

  const strategies = {
    catalog_supplier_sku__eq__csv_sku: 0,
    catalog_supplier_sku__eq__csv_id: 0,
    catalog_supplier_sku__eq__csv_sku_no_prefix: 0,
    via_supplier_products__by_sku_or_id: 0,
    any: 0,
  }
  const matchedSamples: Array<Record<string, string>> = []
  const unmatchedSamples: Array<Record<string, string>> = []

  for (const k of rowKeys) {
    const bySku = k.sku ? catBySku.get(U(k.sku)) : undefined
    const byId = k.id ? catBySku.get(U(k.id)) : undefined
    const byStripped = k.skuStripped ? catByStripped.get(U(k.skuStripped)) : undefined
    const viaSup = (() => {
      for (const key of [k.sku, k.id, k.skuStripped, k.idStripped]) {
        if (!key) continue
        const s = supBySku.get(U(key))
        if (s) { const c = catBySupplierProductId.get(s.id); if (c) return c }
      }
      return undefined
    })()

    if (bySku) strategies.catalog_supplier_sku__eq__csv_sku++
    if (byId) strategies.catalog_supplier_sku__eq__csv_id++
    if (byStripped) strategies.catalog_supplier_sku__eq__csv_sku_no_prefix++
    if (viaSup) strategies.via_supplier_products__by_sku_or_id++

    const hit = bySku ?? byId ?? byStripped ?? viaSup
    if (hit) {
      strategies.any++
      if (matchedSamples.length < 10) {
        matchedSamples.push({ csv_sku: k.sku, csv_id: k.id, matched_supplier_sku: hit.supplier_sku ?? '' })
      }
    } else if (unmatchedSamples.length < 10) {
      unmatchedSamples.push({ csv_sku: k.sku, csv_id: k.id })
    }
  }

  return {
    ok: true,
    csvUrl: fetched.csvUrl,
    rawHeaders,
    detectedColumns: { sku: getCol(dataRows[0] ?? [], headers, 'sku') ? 'present' : 'MISSING', id: idIdx >= 0 ? 'present' : 'absent' },
    rowsProbed: rowKeys.length,
    candidateKeysLoaded: candList.length,
    catalogRowsLoaded: catBySku.size,
    supplierRowsLoaded: supBySku.size,
    strategies,
    matchedSamples,
    unmatchedSamples,
  }
}

async function diagCategories(limit: number) {
  const csvUrl = (process.env.CATEGORY_SEO_CSV_URL ?? '').trim()
  if (!csvUrl) return { ok: false, message: 'CATEGORY_SEO_CSV_URL не встановлено в env vars.' }

  const fetched = await fetchCsvText(csvUrl)
  if (!fetched.ok) {
    return {
      ok: false, message: fetched.error, csvUrl: fetched.csvUrl,
      httpStatus: fetched.httpStatus, contentType: fetched.contentType, finalUrl: fetched.finalUrl,
    }
  }

  const allRows = parseCsv(fetched.text)
  if (allRows.length < 2) return { ok: false, message: 'Таблиця порожня.', csvUrl: fetched.csvUrl }

  const headers = allRows[0]
  const nameIdx = rawIdx(headers, ['category', 'категорія', 'категория', 'category name', 'назва категорії', 'назва', 'name'])
  if (nameIdx < 0) {
    return { ok: false, message: `Колонку "Category" не знайдено. Заголовки: ${headers.slice(0, 8).join(', ')}`, csvUrl: fetched.csvUrl, rawHeaders: headers }
  }
  const dataRows = allRows.slice(1, 1 + limit)
  const names = dataRows.map((row) => (row[nameIdx] ?? '').trim()).filter(Boolean)

  const client = getAdminClient()

  // Load ALL catalog categories (name_ua / slug only — name does NOT exist on this table).
  type Cat = { id: string; name_ua: string | null; slug: string | null; supplier_category_id: string | null }
  const cats: Cat[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from('catalog_categories')
      .select('id, name_ua, slug, supplier_category_id')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error || !data || data.length === 0) break
    cats.push(...(data as Cat[]))
    if (data.length < 1000) break
  }

  type Sup = { id: string; supplier_id: string | null; name: string | null; name_ua: string | null }
  const { data: supplierCats } = await client
    .from('supplier_categories')
    .select('id, supplier_id, name, name_ua')

  const byNameUa = new Map(cats.map((c) => [norm(c.name_ua), c]))
  const bySlug = new Map(cats.map((c) => [c.slug ?? '', c]))
  const byAutoSlug = new Map(cats.map((c) => [autoSlug(c.name_ua ?? ''), c]))

  // supplier name → catalog row (catalog_categories.supplier_category_id == supplier_categories.supplier_id)
  const catBySupplierId = new Map(cats.filter((c) => c.supplier_category_id).map((c) => [c.supplier_category_id as string, c]))
  const bySupplierName = new Map<string, Cat>()
  const bySupplierNameUa = new Map<string, Cat>()
  for (const sc of (supplierCats ?? []) as Sup[]) {
    const cat = (sc.supplier_id != null ? catBySupplierId.get(sc.supplier_id) : undefined) ?? catBySupplierId.get(sc.id)
    if (!cat) continue
    if (sc.name) bySupplierName.set(norm(sc.name), cat)
    if (sc.name_ua) bySupplierNameUa.set(norm(sc.name_ua), cat)
  }

  const strategies = {
    catalog_name_ua: 0,
    catalog_slug: 0,
    catalog_autoslug: 0,
    supplier_name: 0,
    supplier_name_ua: 0,
    any: 0,
  }
  const matchedSamples: Array<Record<string, string>> = []
  const unmatchedSamples: string[] = []

  for (const nameRaw of names) {
    const slugFromName = nameRaw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const byUa = byNameUa.get(norm(nameRaw))
    const bySl = bySlug.get(slugFromName)
    const byAuto = byAutoSlug.get(autoSlug(nameRaw))
    const bySupN = bySupplierName.get(norm(nameRaw))
    const bySupNUa = bySupplierNameUa.get(norm(nameRaw))

    if (byUa) strategies.catalog_name_ua++
    if (bySl) strategies.catalog_slug++
    if (byAuto) strategies.catalog_autoslug++
    if (bySupN) strategies.supplier_name++
    if (bySupNUa) strategies.supplier_name_ua++

    const hit = byUa ?? bySupN ?? bySupNUa ?? bySl ?? byAuto
    if (hit) {
      strategies.any++
      if (matchedSamples.length < 10) matchedSamples.push({ csv_category: nameRaw, matched_name_ua: hit.name_ua ?? '', matched_slug: hit.slug ?? '' })
    } else if (unmatchedSamples.length < 10) {
      unmatchedSamples.push(nameRaw)
    }
  }

  return {
    ok: true,
    csvUrl: fetched.csvUrl,
    rawHeaders: headers,
    categoryColumn: headers[nameIdx],
    rowsProbed: names.length,
    catalogCategoriesLoaded: cats.length,
    supplierCategoriesLoaded: (supplierCats ?? []).length,
    strategies,
    matchedSamples,
    unmatchedSamples,
  }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const limit = parseLimit(req)

  let products: unknown, categories: unknown
  try { products = await diagProducts(limit) } catch (e) { products = { ok: false, message: e instanceof Error ? e.message : String(e) } }
  try { categories = await diagCategories(limit) } catch (e) { categories = { ok: false, message: e instanceof Error ? e.message : String(e) } }

  return Response.json({ ok: true, limit, products, categories })
}
