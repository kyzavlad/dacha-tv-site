// ─── Google Sheets SEO importer (safe, dry-run-first) ─────────────────────────
// Merges human-authored SEO from the two Google Sheets into the catalog WITHOUT
// ever clobbering good content. This is the deliberate, gated counterpart to the
// legacy lib/catalog/seo.ts importer:
//
//   • dry-run by default — GET routes preview counts + samples, write nothing;
//   • never overwrites a manual lock, a manual/AI-authored row (unless force),
//     or any already-filled field (unless force);
//   • every value passes lib/catalog/seo-validate (length, no HTML, no cat-NNN
//     slug, no spam, no fake/medical claims) before it can be written;
//   • imported rows are tagged seo_source='sheet' (+ seo_status='sheet' when the
//     row gains sheet meta) so provenance is explicit and auditable.
//
// Source URLs come ONLY from env (PRODUCT_SEO_CSV_URL / CATEGORY_SEO_CSV_URL),
// never from UI input — same contract as the rest of the SEO pipeline.

import { getAdminClient } from '@/lib/supabase/admin'
import {
  fetchCsvText, parseCsv, normalizeHeaders, getCol, autoSlug,
} from './csv-utils'
import {
  validateMetaTitle, validateMetaDescription, validateKeywords, validateDescription,
  collapse,
} from './seo-validate'

export interface SheetImportResult {
  ok: boolean
  apply: boolean
  message: string
  // counts
  rows: number               // data rows in the sheet (excl. header)
  matched: number            // sheet rows matched to a catalog row
  eligible: number           // matched rows that would get ≥1 field written
  updated: number            // rows actually written (0 on dry run)
  skippedLocked: number      // matched but seo_manual_lock=true
  skippedExistingSeo: number // matched but seo_status ai/manual (and not force)
  skippedNoChange: number    // matched but nothing left to fill (all present / no good field)
  unmatched: number          // sheet rows with no catalog match
  validationErrors: number   // individual field values rejected by validation
  errors: number             // DB write errors (apply only)
  // display extras (consumed by the pipeline Banner)
  unmatchedSample: string[]
  errorGroups: Record<string, number> // validation reason → count
  samples: Array<{ key: string; meta_title?: string; meta_description?: string; fields: string[] }>
  // HTTP fetch diagnostics (populated when the sheet fetch fails)
  csvUrl?: string
  httpStatus?: number
  contentType?: string
  bodyPreview?: string
  finalUrl?: string
  // Language / column warnings surfaced in the Banner
  sheetWarning?: string
}

function emptyResult(apply: boolean): SheetImportResult {
  return {
    ok: false, apply, message: '', rows: 0, matched: 0, eligible: 0, updated: 0,
    skippedLocked: 0, skippedExistingSeo: 0, skippedNoChange: 0, unmatched: 0,
    validationErrors: 0, errors: 0, unmatchedSample: [], errorGroups: {}, samples: [],
  }
}

const isEmpty = (s: unknown) => !collapse(s as string | null | undefined)

// Case-insensitive key for SKU/ID matching.
const up = (s: unknown) => String(s ?? '').trim().toUpperCase()

// "S-1875" → "1875", "C-25" → "25"; leaves plain codes unchanged. Handles the
// common case where the sheet prefixes a supplier code that the catalog stores raw.
function stripSkuPrefix(s: string): string {
  const m = (s ?? '').trim().match(/^[A-Za-z]{1,4}[-_ ]?(\d.*)$/)
  return m ? m[1] : (s ?? '').trim()
}

// Build the summary line shared by both importers.
function summarise(kind: 'товарів' | 'категорій', r: SheetImportResult): string {
  const head = r.apply ? 'ЗАСТОСОВАНО' : 'DRY RUN'
  const parts = [
    `рядків: ${r.rows}`,
    `збіг: ${r.matched}`,
    `придатні: ${r.eligible}`,
    r.apply ? `записано: ${r.updated}` : null,
    r.skippedLocked ? `замок: ${r.skippedLocked}` : null,
    r.skippedExistingSeo ? `AI/manual: ${r.skippedExistingSeo}` : null,
    r.skippedNoChange ? `без змін: ${r.skippedNoChange}` : null,
    r.unmatched ? `не знайдено: ${r.unmatched}` : null,
    r.validationErrors ? `помилки валідації: ${r.validationErrors}` : null,
    r.errors ? `DB-помилок: ${r.errors}` : null,
  ].filter(Boolean)
  let msg = `${head} — SEO ${kind}. ${parts.join(', ')}.`
  if (r.samples.length) {
    const lines = r.samples.slice(0, 5).map((s) => {
      const t = s.meta_title ? `T(${s.meta_title.length}): «${s.meta_title}»` : ''
      const d = s.meta_description ? `D(${s.meta_description.length}): «${s.meta_description}»` : ''
      return `• ${s.key} → ${[t, d].filter(Boolean).join(' · ') || s.fields.join(', ')}`
    })
    msg += `\nЗразки:\n${lines.join('\n')}`
  }
  return msg
}

function recordValidationErrors(r: SheetImportResult, reasons: string[]): void {
  for (const reason of reasons) {
    r.validationErrors++
    r.errorGroups[reason] = (r.errorGroups[reason] ?? 0) + 1
  }
}

// ─── Product SEO importer ─────────────────────────────────────────────────────
// Match by SKU. Writes meta_title / meta_description / seo_keywords and, only
// when the catalog field is empty, description_ua. Price / stock / images are
// NEVER touched here (those come from the supplier API).
export async function importProductSeoFromSheet(
  opts: { apply?: boolean; force?: boolean; limit?: number } = {},
): Promise<SheetImportResult> {
  const apply = opts.apply === true
  const force = opts.force === true
  const limit = Math.min(Math.max(opts.limit ?? 5000, 1), 50000)
  const r = emptyResult(apply)

  const csvUrl = (process.env.PRODUCT_SEO_CSV_URL ?? '').trim()
  if (!csvUrl) {
    r.message = 'PRODUCT_SEO_CSV_URL не встановлено в env vars.'
    return r
  }

  const fetched = await fetchCsvText(csvUrl)
  if (!fetched.ok) {
    return {
      ...r, message: fetched.error, csvUrl: fetched.csvUrl,
      httpStatus: fetched.httpStatus, contentType: fetched.contentType,
      bodyPreview: fetched.bodyPreview, finalUrl: fetched.finalUrl,
    }
  }

  const allRows = parseCsv(fetched.text)
  if (allRows.length < 2) {
    r.message = 'Таблиця порожня або не має рядків даних.'
    r.csvUrl = fetched.csvUrl
    return r
  }

  const headers = normalizeHeaders(allRows[0])
  const hasSku = headers.some((h) => {
    const n = h.toLowerCase().trim()
    return n === 'sku' || n === 'артикул' || n === 'article' || n === 'supplier_sku' || n === 'код'
  })
  if (!hasSku) {
    r.message = `Колонку SKU не знайдено. Заголовки: ${headers.slice(0, 8).join(', ')}`
    r.csvUrl = fetched.csvUrl
    return r
  }

  const dataRows = allRows.slice(1, 1 + limit)
  r.rows = dataRows.length

  // The sheet may carry both an SKU column (e.g. "S-1875") and a raw supplier ID
  // column. catalog_products.supplier_sku is whatever the supplier feed used as
  // its primary code (vendor_code ?? sku ?? article ?? id), so we match by SKU
  // first, then by the raw ID, then by a prefix-stripped variant, and finally
  // bridge through supplier_products (supplier_sku → id → supplier_product_id).
  const idIdx = allRows[0].findIndex((h) => {
    const n = h.toLowerCase().trim()
    return n === 'id' || n === 'ід' || n === 'product_id' || n === 'productid'
  })

  const client = getAdminClient()
  type ProdRow = {
    id: string; supplier_sku: string | null; supplier_product_id: string | null
    meta_title: string | null; meta_description: string | null; seo_keywords: string | null
    description_ua: string | null; seo_status: string | null; seo_manual_lock: boolean | null
  }

  // Per-row keys, plus the global candidate set used to load only relevant rows.
  const rowKeys = dataRows.map((row) => {
    const sku = getCol(row, headers, 'sku')
    const id = idIdx >= 0 ? (row[idIdx] ?? '').trim() : ''
    return { sku, id, skuStripped: stripSkuPrefix(sku), idStripped: stripSkuPrefix(id) }
  })
  const candidates = new Set<string>()
  for (const k of rowKeys) {
    for (const v of [k.sku, k.id, k.skuStripped, k.idStripped]) if (v) candidates.add(up(v))
  }
  const candList = [...candidates]

  // catalog_products by supplier_sku (case-insensitive + prefix-stripped index)
  const PROD_COLS = 'id, supplier_sku, supplier_product_id, meta_title, meta_description, seo_keywords, description_ua, seo_status, seo_manual_lock'
  const catBySku = new Map<string, ProdRow>()
  const catByStripped = new Map<string, ProdRow>()
  for (let i = 0; i < candList.length; i += 300) {
    const { data } = await client.from('catalog_products').select(PROD_COLS).in('supplier_sku', candList.slice(i, i + 300))
    for (const p of (data ?? []) as ProdRow[]) {
      if (!p.supplier_sku) continue
      catBySku.set(up(p.supplier_sku), p)
      catByStripped.set(up(stripSkuPrefix(p.supplier_sku)), p)
    }
  }

  // Bridge through supplier_products: supplier_sku → id → catalog.supplier_product_id
  const supBySku = new Map<string, string>() // upper(supplier_sku) → supplier id
  for (let i = 0; i < candList.length; i += 300) {
    const { data } = await client.from('supplier_products').select('id, supplier_sku').in('supplier_sku', candList.slice(i, i + 300))
    for (const s of (data ?? []) as { id: string; supplier_sku: string | null }[]) {
      if (s.supplier_sku) supBySku.set(up(s.supplier_sku), s.id)
    }
  }
  const supIds = [...new Set(supBySku.values())]
  const catBySupplierProductId = new Map<string, ProdRow>()
  for (let i = 0; i < supIds.length; i += 300) {
    const { data } = await client.from('catalog_products').select(PROD_COLS).in('supplier_product_id', supIds.slice(i, i + 300))
    for (const p of (data ?? []) as ProdRow[]) {
      if (p.supplier_product_id) catBySupplierProductId.set(p.supplier_product_id, p)
    }
  }

  const resolveProd = (k: { sku: string; id: string; skuStripped: string; idStripped: string }): ProdRow | undefined => {
    const direct =
      (k.sku && catBySku.get(up(k.sku))) ||
      (k.id && catBySku.get(up(k.id))) ||
      (k.skuStripped && catByStripped.get(up(k.skuStripped))) ||
      (k.idStripped && catByStripped.get(up(k.idStripped)))
    if (direct) return direct
    for (const key of [k.sku, k.id, k.skuStripped, k.idStripped]) {
      if (!key) continue
      const supId = supBySku.get(up(key))
      if (supId) { const c = catBySupplierProductId.get(supId); if (c) return c }
    }
    return undefined
  }

  const now = new Date().toISOString()

  for (let ri = 0; ri < dataRows.length; ri++) {
    const row = dataRows[ri]
    const k = rowKeys[ri]
    const sku = k.sku || k.id
    if (!sku) { continue }

    const prod = resolveProd(k)
    if (!prod) {
      r.unmatched++
      if (r.unmatchedSample.length < 20) r.unmatchedSample.push(sku)
      continue
    }
    r.matched++

    if (prod.seo_manual_lock) { r.skippedLocked++; continue }
    if (!force && (prod.seo_status === 'manual' || prod.seo_status === 'ai')) { r.skippedExistingSeo++; continue }

    const payload: Record<string, unknown> = {}
    const writtenFields: string[] = []
    let wroteMeta = false

    // meta_title
    const sheetTitle = getCol(row, headers, 'meta_title')
    if (sheetTitle && (force || isEmpty(prod.meta_title))) {
      const v = validateMetaTitle(sheetTitle)
      if (v.ok) { payload.meta_title = collapse(sheetTitle); writtenFields.push('meta_title'); wroteMeta = true }
      else recordValidationErrors(r, v.reasons)
    }

    // meta_description
    const sheetDesc = getCol(row, headers, 'meta_description')
    if (sheetDesc && (force || isEmpty(prod.meta_description))) {
      const v = validateMetaDescription(sheetDesc)
      if (v.ok) { payload.meta_description = collapse(sheetDesc); writtenFields.push('meta_description'); wroteMeta = true }
      else recordValidationErrors(r, v.reasons)
    }

    // seo_keywords
    const sheetKw = getCol(row, headers, 'meta_keywords')
    if (sheetKw && (force || isEmpty(prod.seo_keywords))) {
      const v = validateKeywords(sheetKw)
      if (v.ok) { payload.seo_keywords = collapse(sheetKw); writtenFields.push('seo_keywords') }
      else recordValidationErrors(r, v.reasons)
    }

    // description_ua — only fill when empty (long-form, HTML stripped on the way in)
    const sheetLongDesc = getCol(row, headers, 'description')
    if (sheetLongDesc && (force || isEmpty(prod.description_ua))) {
      const v = validateDescription(sheetLongDesc)
      if (v.ok) { payload.description_ua = v.value; writtenFields.push('description_ua') }
      else recordValidationErrors(r, v.reasons)
    }

    if (Object.keys(payload).length === 0) { r.skippedNoChange++; continue }

    r.eligible++
    if (r.samples.length < 12) {
      r.samples.push({
        key: sku,
        meta_title: payload.meta_title as string | undefined,
        meta_description: payload.meta_description as string | undefined,
        fields: writtenFields,
      })
    }

    if (apply) {
      payload.seo_source = 'sheet'
      if (wroteMeta) payload.seo_status = 'sheet'
      payload.seo_generated_at = now
      payload.updated_at = now

      // Re-assert the guards at write time so a row that changed since SELECT is
      // never clobbered. force relaxes the status guard but never the lock.
      let q = client.from('catalog_products').update(payload).eq('id', prod.id).neq('seo_manual_lock', true)
      if (!force) q = q.neq('seo_status', 'ai').neq('seo_status', 'manual')
      const { error } = await q
      if (error) r.errors++
      else r.updated++
    }
  }

  r.ok = r.errors === 0
  r.csvUrl = fetched.csvUrl
  r.message = summarise('товарів', r)
  return r
}

// ─── Category SEO importer ────────────────────────────────────────────────────
// Match by category name (catalog name_ua / name / autoSlug, with a supplier
// name fallback). Writes meta_description / description_ua (and meta_title /
// seo_keywords when present) only into empty fields. Unmatched names are
// reported so the human can reconcile the sheet.
export async function importCategorySeoFromSheet(
  opts: { apply?: boolean; force?: boolean; limit?: number } = {},
): Promise<SheetImportResult> {
  const apply = opts.apply === true
  const force = opts.force === true
  const limit = Math.min(Math.max(opts.limit ?? 5000, 1), 50000)
  const r = emptyResult(apply)

  const csvUrl = (process.env.CATEGORY_SEO_CSV_URL ?? '').trim()
  if (!csvUrl) {
    r.message = 'CATEGORY_SEO_CSV_URL не встановлено в env vars.'
    return r
  }

  const fetched = await fetchCsvText(csvUrl)
  if (!fetched.ok) {
    return {
      ...r, message: fetched.error, csvUrl: fetched.csvUrl,
      httpStatus: fetched.httpStatus, contentType: fetched.contentType,
      bodyPreview: fetched.bodyPreview, finalUrl: fetched.finalUrl,
    }
  }

  const allRows = parseCsv(fetched.text)
  if (allRows.length < 2) {
    r.message = 'Таблиця порожня або не має рядків даних.'
    r.csvUrl = fetched.csvUrl
    return r
  }

  const headers = allRows[0]
  const idxOf = (names: string[]) => headers.findIndex((h) => names.includes(h.toLowerCase().trim()))
  const nameIdx = idxOf(['category', 'категорія', 'категория', 'category name', 'назва категорії', 'назва'])
  // Only an EXPLICITLY named description_ua column writes to the visible Ukrainian description.
  // Generic 'description' / 'описание' columns are likely Russian supplier text — writing
  // them to description_ua would corrupt the public Ukrainian category description.
  const descUaIdx   = idxOf(['description_ua'])
  const descGenIdx  = idxOf(['description', 'опис', 'описание'])
  const metaTitleIdx = idxOf(['meta_title', 'meta title', 'seo title'])
  const metaDescIdx = idxOf(['meta_description', 'meta description', 'seo description'])
  const kwIdx = idxOf(['meta_keywords', 'keywords'])

  if (nameIdx < 0) {
    r.message = `Колонку "Category" не знайдено. Заголовки: ${headers.slice(0, 8).join(', ')}`
    r.csvUrl = fetched.csvUrl
    return r
  }

  const client = getAdminClient()
  // NOTE: catalog_categories has NO `name` column — only `name_ua` (migration 039).
  // Selecting a non-existent column makes PostgREST error the whole query, which
  // previously left `cats` empty and reported every row as unmatched.
  type CatRow = {
    id: string; name_ua: string | null; slug: string | null
    supplier_category_id: string | null
    meta_title: string | null; meta_description: string | null; seo_keywords: string | null
    description_ua: string | null; description: string | null
    seo_status: string | null; seo_manual_lock: boolean | null
  }

  // Load ALL catalog categories (paginated) + supplier categories for fuzzy matching.
  const cats: CatRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from('catalog_categories')
      .select('id, name_ua, slug, supplier_category_id, meta_title, meta_description, seo_keywords, description_ua, description, seo_status, seo_manual_lock')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error || !data || data.length === 0) break
    cats.push(...(data as CatRow[]))
    if (data.length < 1000) break
  }
  const { data: supplierCats } = await client
    .from('supplier_categories')
    .select('id, supplier_id, name, name_ua')

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const byNameUa = new Map(cats.map((c) => [norm(c.name_ua ?? ''), c]))
  const bySlug = new Map(cats.map((c) => [c.slug ?? '', c]))
  const byAutoSlug = new Map(cats.map((c) => [autoSlug(c.name_ua ?? ''), c]))

  // Supplier-side names → catalog row. catalog_categories.supplier_category_id
  // matches supplier_categories.supplier_id (text), per migration 039. The sheet
  // often uses the supplier's source-language name (e.g. "SDS-Max", "Акб"), which
  // is exactly what supplier_categories.name carries — so this is the primary
  // bridge when name_ua (Ukrainian) does not line up with the sheet.
  const catBySupplierId = new Map(cats.filter((c) => c.supplier_category_id).map((c) => [c.supplier_category_id as string, c]))
  const bySupplierName = new Map<string, CatRow>()
  for (const sc of supplierCats ?? []) {
    const cat = (sc.supplier_id != null ? catBySupplierId.get(sc.supplier_id as string) : undefined) ?? catBySupplierId.get(sc.id as string)
    if (!cat) continue
    if (sc.name) bySupplierName.set(norm(sc.name as string), cat)
    if (sc.name_ua) bySupplierName.set(norm(sc.name_ua as string), cat)
  }

  const dataRows = allRows.slice(1, 1 + limit)
  r.rows = dataRows.length
  const now = new Date().toISOString()

  // Warn when a generic description column is present but we deliberately skip it.
  // This prevents accidentally overwriting the visible Ukrainian description with Russian text.
  if (descGenIdx >= 0 && descUaIdx < 0) {
    const colName = headers[descGenIdx] ?? 'description'
    r.sheetWarning = `Колонка «${colName}» пропущена — мова невідома (може бути російська). Щоб писати до description_ua, назвіть колонку «description_ua».`
  }

  for (const row of dataRows) {
    const nameRaw = (row[nameIdx] ?? '').trim()
    if (!nameRaw) continue

    const slugFromName = nameRaw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const cat =
      byNameUa.get(norm(nameRaw)) ??
      bySupplierName.get(norm(nameRaw)) ??
      bySlug.get(slugFromName) ??
      byAutoSlug.get(autoSlug(nameRaw))

    if (!cat) {
      r.unmatched++
      if (r.unmatchedSample.length < 20) r.unmatchedSample.push(nameRaw)
      continue
    }
    r.matched++

    if (cat.seo_manual_lock) { r.skippedLocked++; continue }
    if (!force && (cat.seo_status === 'manual' || cat.seo_status === 'ai')) { r.skippedExistingSeo++; continue }

    const payload: Record<string, unknown> = {}
    const writtenFields: string[] = []
    let wroteMeta = false

    const sheetTitle = metaTitleIdx >= 0 ? (row[metaTitleIdx] ?? '').trim() : ''
    if (sheetTitle && (force || isEmpty(cat.meta_title))) {
      const v = validateMetaTitle(sheetTitle)
      if (v.ok) { payload.meta_title = collapse(sheetTitle); writtenFields.push('meta_title'); wroteMeta = true }
      else recordValidationErrors(r, v.reasons)
    }

    const sheetMetaDesc = metaDescIdx >= 0 ? (row[metaDescIdx] ?? '').trim() : ''
    if (sheetMetaDesc && (force || isEmpty(cat.meta_description))) {
      const v = validateMetaDescription(sheetMetaDesc)
      if (v.ok) { payload.meta_description = collapse(sheetMetaDesc); writtenFields.push('meta_description'); wroteMeta = true }
      else recordValidationErrors(r, v.reasons)
    }

    const sheetKw = kwIdx >= 0 ? (row[kwIdx] ?? '').trim() : ''
    if (sheetKw && (force || isEmpty(cat.seo_keywords))) {
      const v = validateKeywords(sheetKw)
      if (v.ok) { payload.seo_keywords = collapse(sheetKw); writtenFields.push('seo_keywords') }
      else recordValidationErrors(r, v.reasons)
    }

    // Long-form category description → description_ua ONLY from explicit description_ua column.
    // Generic 'description'/'описание' columns are skipped to avoid writing Russian supplier
    // text into the visible Ukrainian category description.
    const sheetLongDesc = descUaIdx >= 0 ? (row[descUaIdx] ?? '').trim() : ''
    if (sheetLongDesc && (force || isEmpty(cat.description_ua))) {
      const v = validateDescription(sheetLongDesc)
      if (v.ok) { payload.description_ua = v.value; writtenFields.push('description_ua') }
      else recordValidationErrors(r, v.reasons)
    }

    if (Object.keys(payload).length === 0) { r.skippedNoChange++; continue }

    r.eligible++
    if (r.samples.length < 12) {
      r.samples.push({
        key: nameRaw,
        meta_title: payload.meta_title as string | undefined,
        meta_description: payload.meta_description as string | undefined,
        fields: writtenFields,
      })
    }

    if (apply) {
      payload.seo_source = 'sheet'
      if (wroteMeta) payload.seo_status = 'sheet'
      payload.seo_generated_at = now
      payload.updated_at = now

      let q = client.from('catalog_categories').update(payload).eq('id', cat.id).neq('seo_manual_lock', true)
      if (!force) q = q.neq('seo_status', 'ai').neq('seo_status', 'manual')
      const { error } = await q
      if (error) r.errors++
      else r.updated++
    }
  }

  r.ok = r.errors === 0
  r.csvUrl = fetched.csvUrl
  r.message = summarise('категорій', r)
  return r
}
