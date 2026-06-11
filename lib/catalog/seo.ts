// Shared SEO application logic for catalog_categories and catalog_products.
// Both the cron routes and the pipeline/setup server actions call these functions.
// URLs are read exclusively from environment variables — never from UI inputs.

import { getAdminClient } from '@/lib/supabase/admin'
import { fetchCsvText, parseCsv, normalizeHeaders, getCol, autoSlug } from './csv-utils'

export interface SeoResult {
  ok: boolean
  updated: number
  skipped: number
  notFound: number
  message: string
  csvUrl?: string
  unmatchedSample?: string[]
  matchSources?: Record<string, number>
  sheetWarning?: string
  // HTTP fetch diagnostics (populated when fetch fails)
  httpStatus?: number
  contentType?: string
  bodyPreview?: string
  finalUrl?: string
}

// ─── Category SEO ─────────────────────────────────────────────────────────────

export async function applyCategorySeoFromEnv(): Promise<SeoResult> {
  const csvUrl = (process.env.CATEGORY_SEO_CSV_URL ?? '').trim()
  if (!csvUrl) {
    return { ok: false, updated: 0, skipped: 0, notFound: 0, message: 'CATEGORY_SEO_CSV_URL не встановлено в env vars' }
  }
  return applyCategorySeoFromUrl(csvUrl)
}

export async function applyCategorySeoFromUrl(csvUrl: string): Promise<SeoResult> {
  const fetched = await fetchCsvText(csvUrl)
  if (!fetched.ok) {
    return {
      ok: false, updated: 0, skipped: 0, notFound: 0,
      message: fetched.error, csvUrl: fetched.csvUrl,
      httpStatus: fetched.httpStatus, contentType: fetched.contentType,
      bodyPreview: fetched.bodyPreview, finalUrl: fetched.finalUrl,
    }
  }

  const allRows = parseCsv(fetched.text)
  if (allRows.length < 2) {
    return { ok: false, updated: 0, skipped: 0, notFound: 0, message: 'Таблиця порожня або не має рядків даних', csvUrl: fetched.csvUrl }
  }

  const headers = allRows[0]

  const nameIdx = headers.findIndex((h) => {
    const n = h.toLowerCase().trim()
    return n === 'category' || n === 'категорія' || n === 'категория' || n === 'category name' || n === 'назва категорії' || n === 'назва'
  })
  const descIdx = headers.findIndex((h) => {
    const n = h.toLowerCase().trim()
    return n === 'description' || n === 'опис' || n === 'описание' || n === 'description_ua'
  })
  const metaTitleIdx = headers.findIndex((h) => {
    const n = h.toLowerCase().trim()
    return n === 'meta_title' || n === 'meta title' || n === 'seo title'
  })
  const metaDescIdx = headers.findIndex((h) => {
    const n = h.toLowerCase().trim()
    return n === 'meta_description' || n === 'meta description' || n === 'seo description'
  })

  if (nameIdx < 0) {
    return {
      ok: false, updated: 0, skipped: 0, notFound: 0,
      message: `Колонку "Category" не знайдено. Заголовки: ${headers.slice(0, 8).join(', ')}`,
      csvUrl: fetched.csvUrl,
    }
  }

  const client = getAdminClient()

  const [{ data: cats }, { data: supplierCats }] = await Promise.all([
    client.from('catalog_categories').select('id, name_ua, slug, supplier_category_id, description, meta_title, meta_description'),
    client.from('supplier_categories').select('id, supplier_id, name, name_ua'),
  ])

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  type CatRow = NonNullable<typeof cats>[number]

  const catBySupplierStrId = new Map((cats ?? []).filter(c => c.supplier_category_id).map(c => [c.supplier_category_id as string, c]))
  const bySupplierName   = new Map<string, CatRow>()
  const bySupplierNameUa = new Map<string, CatRow>()
  for (const sc of supplierCats ?? []) {
    const cat = catBySupplierStrId.get(sc.supplier_id as string) ?? catBySupplierStrId.get(sc.id as string)
    if (!cat) continue
    if (sc.name)    bySupplierName.set(norm(sc.name as string), cat)
    if (sc.name_ua) bySupplierNameUa.set(norm(sc.name_ua as string), cat)
  }

  const byNameUa   = new Map((cats ?? []).map((c) => [norm(c.name_ua ?? ''), c]))
  const bySlug     = new Map((cats ?? []).map((c) => [c.slug ?? '', c]))
  const byAutoSlug = new Map((cats ?? []).map((c) => [autoSlug(c.name_ua ?? ''), c]))

  let updated = 0, skipped = 0, notFound = 0
  const unmatchedSample: string[] = []
  const matchSources: Record<string, number> = {}

  for (const r of allRows.slice(1)) {
    const nameRaw = (r[nameIdx] ?? '').trim()
    if (!nameRaw) { skipped++; continue }

    const description = descIdx >= 0 ? (r[descIdx] ?? '').trim() || null : null
    const metaTitleSh = metaTitleIdx >= 0 ? (r[metaTitleIdx] ?? '').trim() || null : null
    const metaDescSh  = metaDescIdx >= 0 ? (r[metaDescIdx] ?? '').trim() || null : null

    const slugFromName = nameRaw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    let cat: CatRow | undefined
    let matchSrc = ''
    if ((cat = byNameUa.get(norm(nameRaw))))              matchSrc = 'catalog.name_ua'
    else if ((cat = bySupplierName.get(norm(nameRaw))))   matchSrc = 'supplier.name'
    else if ((cat = bySupplierNameUa.get(norm(nameRaw)))) matchSrc = 'supplier.name_ua'
    else if ((cat = bySlug.get(slugFromName)))            matchSrc = 'catalog.slug'
    else if ((cat = byAutoSlug.get(autoSlug(nameRaw))))   matchSrc = 'catalog.autoSlug'

    if (!cat) {
      notFound++
      if (unmatchedSample.length < 20) unmatchedSample.push(nameRaw)
      continue
    }
    matchSources[matchSrc] = (matchSources[matchSrc] ?? 0) + 1

    const payload: Record<string, unknown> = {}
    if (description && !cat.description) payload.description = description
    if (description && !cat.meta_description) payload.meta_description = metaDescSh ?? description.slice(0, 160)
    if (!cat.meta_title) payload.meta_title = metaTitleSh ?? nameRaw
    if (metaTitleSh && !payload.meta_title) payload.meta_title = metaTitleSh
    if (metaDescSh && !payload.meta_description) payload.meta_description = metaDescSh

    if (Object.keys(payload).length === 0) { skipped++; continue }

    const { error } = await client.from('catalog_categories').update(payload).eq('id', cat.id)
    if (error) skipped++; else updated++
  }

  const notFoundNote = notFound > 0
    ? `, не знайдено ${notFound}${unmatchedSample.length ? `: "${unmatchedSample.slice(0, 3).join('", "')}"…` : ''}`
    : ''

  return {
    ok: true, updated, skipped, notFound,
    message: `SEO категорій: оновлено ${updated}, вже є ${skipped}${notFoundNote}`,
    csvUrl: fetched.csvUrl,
    unmatchedSample,
    matchSources,
    sheetWarning: fetched.sheetWarning,
  }
}

// ─── Product SEO ──────────────────────────────────────────────────────────────

export async function applyProductSeoFromEnv(): Promise<SeoResult> {
  const csvUrl = (process.env.PRODUCT_SEO_CSV_URL ?? '').trim()
  if (!csvUrl) {
    return { ok: false, updated: 0, skipped: 0, notFound: 0, message: 'PRODUCT_SEO_CSV_URL не встановлено в env vars' }
  }
  return applyProductSeoFromUrl(csvUrl)
}

export async function applyProductSeoFromUrl(csvUrl: string): Promise<SeoResult> {
  const fetched = await fetchCsvText(csvUrl)
  if (!fetched.ok) {
    return {
      ok: false, updated: 0, skipped: 0, notFound: 0,
      message: fetched.error, csvUrl: fetched.csvUrl,
      httpStatus: fetched.httpStatus, contentType: fetched.contentType,
      bodyPreview: fetched.bodyPreview, finalUrl: fetched.finalUrl,
    }
  }

  const allRows = parseCsv(fetched.text)
  if (allRows.length < 2) {
    return { ok: false, updated: 0, skipped: 0, notFound: 0, message: 'Таблиця порожня або не має рядків даних', csvUrl: fetched.csvUrl }
  }

  const headers = normalizeHeaders(allRows[0])
  const hasSku = headers.some((h) => {
    const n = h.toLowerCase().trim()
    return n === 'sku' || n === 'артикул' || n === 'article' || n === 'supplier_sku' || n === 'код'
  })
  if (!hasSku) {
    return {
      ok: false, updated: 0, skipped: 0, notFound: 0,
      message: `Колонку SKU не знайдено. Заголовки: ${headers.slice(0, 8).join(', ')}`,
      csvUrl: fetched.csvUrl,
    }
  }

  const client = getAdminClient()
  const { data: prods } = await client
    .from('catalog_products')
    .select('id, supplier_sku, description, meta_title, meta_description')

  const prodMap = new Map((prods ?? []).map((p) => [p.supplier_sku as string, p]))
  let updated = 0, skipped = 0, notFound = 0
  const unmatchedSample: string[] = []

  for (const r of allRows.slice(1)) {
    const sku = getCol(r, headers, 'sku')
    if (!sku) { skipped++; continue }

    const description = getCol(r, headers, 'description') || null
    const metaTitle   = getCol(r, headers, 'meta_title')   || null
    const metaDesc    = getCol(r, headers, 'meta_description') || null

    const prod = prodMap.get(sku)
    if (!prod) {
      notFound++
      if (unmatchedSample.length < 20) unmatchedSample.push(sku)
      continue
    }

    const payload: Record<string, unknown> = {}
    if (description && !prod.description) payload.description = description
    if (metaTitle   && !prod.meta_title)  payload.meta_title  = metaTitle
    if (metaDesc    && !prod.meta_description) payload.meta_description = metaDesc
    if (Object.keys(payload).length === 0) { skipped++; continue }

    const { error } = await client.from('catalog_products').update(payload).eq('id', prod.id)
    if (error) skipped++; else updated++
  }

  const notFoundNote = notFound > 0
    ? `, не в каталозі ${notFound}${unmatchedSample.length ? `: "${unmatchedSample.slice(0, 3).join('", "')}"…` : ''}`
    : ''

  return {
    ok: true, updated, skipped, notFound,
    message: `SEO товарів: оновлено ${updated}, вже є ${skipped}${notFoundNote}`,
    csvUrl: fetched.csvUrl,
    unmatchedSample,
    sheetWarning: fetched.sheetWarning,
  }
}
