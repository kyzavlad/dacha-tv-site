// ─── AI-ready SEO pipeline (pull model) ───────────────────────────────────────
// A safe, PULL-based counterpart to lib/catalog/seo-generate.ts (which PUSHes
// batches to n8n). Here n8n/AI drives the loop:
//
//   1. GET  /api/admin/seo/ai-candidates  → this module picks products needing SEO
//   2. n8n calls the AI, produces validated Ukrainian JSON
//   3. POST /api/admin/seo/apply-ai-batch → this module validates + writes
//
// The app itself NEVER calls an AI provider. Everything is defensive and
// non-destructive: only allowed SEO fields are written, human-authored SEO
// (Google Sheets `sheet`, `manual`, or a manual lock) is NEVER overwritten, and
// nothing here touches price/stock/images/checkout/supplier data.

import { getAdminClient } from '@/lib/supabase/admin'
import {
  isPublicListableProduct,
  formatCatalogPrice,
  getCatalogProductImage,
  categoryDisplayName,
} from '@/lib/supabase/catalog'
import type { CatalogProduct } from '@/types'
import {
  validateMetaTitle,
  validateMetaDescription,
  validateKeywords,
  validateDescription,
  validateUkrainianText,
  collapse,
  META_TITLE_SOFT_MIN,
  META_TITLE_SOFT_MAX,
  META_TITLE_HARD_MAX,
  META_DESC_SOFT_MIN,
  META_DESC_SOFT_MAX,
  META_DESC_HARD_MAX,
} from './seo-validate'

// Human-authored SEO that AI must NEVER overwrite (Sheets import or manual edit).
// Kept as higher priority than any generated copy, per the pipeline contract.
export const PROTECTED_SEO_STATUSES = ['sheet', 'manual'] as const

// Columns loaded for both candidate selection and public-listability filtering.
const CANDIDATE_COLS =
  'id, slug, supplier_sku, name_ua, name, category_slug, price_uah, price_prefix, unit_label, main_image_url, images, meta_title, meta_description, description_ua, seo_keywords, seo_status, seo_source, seo_manual_lock'

// Target windows forwarded to n8n/AI so the prompt matches what apply will accept.
export const SEO_TARGETS = {
  language: 'uk',
  meta_title: { soft_min: META_TITLE_SOFT_MIN, soft_max: META_TITLE_SOFT_MAX, hard_max: META_TITLE_HARD_MAX },
  meta_description: { soft_min: META_DESC_SOFT_MIN, soft_max: META_DESC_SOFT_MAX, hard_max: META_DESC_HARD_MAX },
  description: { min: 200, recommended: '400–1200' },
  rules: [
    'Тільки українська мова (без російської).',
    'Без keyword stuffing (не повторювати те саме слово 5+ разів).',
    'Без фейкових гарантій, медичних чи суперлятивних тверджень.',
    'Без HTML та технічних slug (cat-NNN).',
    'Опис має бути корисним для покупця та описувати саме цей товар.',
  ],
} as const

export interface SeoCandidate {
  id: string
  slug: string
  sku: string | null
  name: string
  category_slug: string | null
  category_name: string | null
  price: string | null
  image: string | null
  current: {
    meta_title: string | null
    meta_description: string | null
    description_ua: string | null
    seo_keywords: string | null
    seo_status: string | null
    seo_source: string | null
  }
  needs: string[] // which fields are missing/weak: 'meta_title' | 'meta_description' | 'description'
  suggested_targets: typeof SEO_TARGETS
}

export interface CandidatesResult {
  ok: boolean
  count: number
  limit: number
  candidates: SeoCandidate[]
  message: string
}

const isBlank = (s: string | null | undefined) => !collapse(s)

// Which fields a product still needs. A description shorter than 200 chars counts
// as "weak" so thin supplier text is upgraded, not treated as complete.
function computeNeeds(p: {
  meta_title: string | null
  meta_description: string | null
  description_ua: string | null
}): string[] {
  const needs: string[] = []
  if (isBlank(p.meta_title)) needs.push('meta_title')
  if (isBlank(p.meta_description)) needs.push('meta_description')
  if (collapse(p.description_ua).length < 200) needs.push('description')
  return needs
}

// Select published, public-listable products that need SEO improvement, ranked to
// prefer real sellable products (image + price + category + real name). Rows with
// human-authored SEO (sheet/manual) or a manual lock are excluded up front.
export async function getSeoAiCandidates(limit = 100): Promise<CandidatesResult> {
  const capped = Math.min(Math.max(limit, 1), 500)
  const client = getAdminClient()

  const { data, error } = await client
    .from('catalog_products')
    .select(CANDIDATE_COLS)
    .eq('status', 'published')
    .neq('seo_manual_lock', true)
    .neq('seo_status', 'sheet')
    .neq('seo_status', 'manual')
    // Only rows that actually need work: no long description, or missing a meta field.
    .or('description_ua.is.null,meta_title.is.null,meta_description.is.null')
    // Prefer real, sellable products (image + valid price + category + name).
    .not('main_image_url', 'is', null)
    .gt('price_uah', 0)
    .not('category_slug', 'is', null)
    .not('name_ua', 'is', null)
    // Oldest-generated first so repeated pulls rotate through the backlog.
    .order('seo_generated_at', { ascending: true, nullsFirst: true })
    // Over-fetch: the public-listability filter drops garbage-named rows in JS.
    .limit(capped * 3)

  if (error) {
    return { ok: false, count: 0, limit: capped, candidates: [], message: error.message }
  }

  const rows = (data ?? []) as unknown as CatalogProduct[]
  const catSlugs = [...new Set(rows.map((r) => r.category_slug).filter(Boolean))] as string[]
  const catName = new Map<string, string>()
  for (let i = 0; i < catSlugs.length; i += 300) {
    const { data: cats } = await client
      .from('catalog_categories')
      .select('slug, name_ua')
      .in('slug', catSlugs.slice(i, i + 300))
    for (const c of cats ?? []) {
      if (c.slug && c.name_ua) catName.set(c.slug as string, categoryDisplayName(c.name_ua as string))
    }
  }

  const candidates: SeoCandidate[] = rows
    .filter(isPublicListableProduct)
    .slice(0, capped)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      sku: p.supplier_sku ?? null,
      name: (p.name_ua ?? '').trim(),
      category_slug: p.category_slug ?? null,
      category_name: p.category_slug ? catName.get(p.category_slug) ?? null : null,
      price: formatCatalogPrice(p),
      image: getCatalogProductImage(p),
      current: {
        meta_title: p.meta_title ?? null,
        meta_description: p.meta_description ?? null,
        description_ua: p.description_ua ?? null,
        seo_keywords: p.seo_keywords ?? null,
        seo_status: p.seo_status ?? null,
        seo_source: p.seo_source ?? null,
      },
      needs: computeNeeds({
        meta_title: p.meta_title ?? null,
        meta_description: p.meta_description ?? null,
        description_ua: p.description_ua ?? null,
      }),
      suggested_targets: SEO_TARGETS,
    }))

  return {
    ok: true,
    count: candidates.length,
    limit: capped,
    candidates,
    message: candidates.length === 0 ? 'Немає товарів, що потребують SEO.' : `Знайдено ${candidates.length} кандидатів.`,
  }
}

// ─── Apply validated AI results ───────────────────────────────────────────────

export interface AiSeoItem {
  id?: string
  sku?: string
  meta_title?: string | null
  meta_description?: string | null
  description?: string | null // → description_ua
  keywords?: string | null // → seo_keywords
}

export interface ApplyItemOutcome {
  key: string
  status: 'updated' | 'skipped' | 'error' | 'invalid'
  fields: string[]
  reasons: string[]
}

export interface ApplyResult {
  ok: boolean
  dryRun: boolean
  received: number
  updated: number
  skipped: number
  invalid: number
  errors: number
  errorGroups: Record<string, number>
  results: ApplyItemOutcome[]
  message: string
}

type ProdRow = {
  id: string
  supplier_sku: string | null
  meta_title: string | null
  meta_description: string | null
  description_ua: string | null
  seo_keywords: string | null
  seo_status: string | null
  seo_manual_lock: boolean | null
}

const up = (s: unknown) => String(s ?? '').trim().toUpperCase()

// Validate one AI item's fields and return the write payload + reasons. Only
// fields present on the item are considered; every value must pass its validator
// AND the Ukrainian-language gate. `description` is required to be non-empty when
// provided (the whole point of the AI pass is long descriptions).
function buildValidatedPayload(
  item: AiSeoItem,
  groups: Record<string, number>,
): { payload: Record<string, unknown>; fields: string[]; reasons: string[] } {
  const payload: Record<string, unknown> = {}
  const fields: string[] = []
  const reasons: string[] = []
  const record = (rs: string[]) => {
    for (const r of rs) {
      reasons.push(r)
      groups[r] = (groups[r] ?? 0) + 1
    }
  }

  if (item.meta_title != null && collapse(item.meta_title)) {
    const v = validateMetaTitle(item.meta_title)
    const ua = validateUkrainianText(item.meta_title)
    if (v.ok && ua.ok) { payload.meta_title = collapse(item.meta_title); fields.push('meta_title') }
    else record([...v.reasons, ...ua.reasons].map((r) => `meta_title: ${r}`))
  }

  if (item.meta_description != null && collapse(item.meta_description)) {
    const v = validateMetaDescription(item.meta_description)
    const ua = validateUkrainianText(item.meta_description)
    if (v.ok && ua.ok) { payload.meta_description = collapse(item.meta_description); fields.push('meta_description') }
    else record([...v.reasons, ...ua.reasons].map((r) => `meta_description: ${r}`))
  }

  if (item.description != null && collapse(item.description)) {
    const v = validateDescription(item.description) // strips HTML, returns cleaned value
    const ua = validateUkrainianText(v.value)
    if (v.ok && ua.ok) { payload.description_ua = v.value; fields.push('description_ua') }
    else record([...v.reasons, ...ua.reasons].map((r) => `description: ${r}`))
  }

  if (item.keywords != null && collapse(item.keywords)) {
    const v = validateKeywords(item.keywords)
    if (v.ok) { payload.seo_keywords = collapse(item.keywords); fields.push('seo_keywords') }
    else record(v.reasons.map((r) => `keywords: ${r}`))
  }

  return { payload, fields, reasons }
}

// Apply a batch of AI-generated SEO. Matches each item by id (preferred) or SKU,
// validates every field, and writes ONLY allowed SEO columns — never on a
// manual-locked or sheet/manual row. dryRun validates + reports without writing.
export async function applyAiSeoBatch(
  items: AiSeoItem[],
  opts: { dryRun?: boolean } = {},
): Promise<ApplyResult> {
  const dryRun = opts.dryRun === true
  const result: ApplyResult = {
    ok: true, dryRun, received: items.length,
    updated: 0, skipped: 0, invalid: 0, errors: 0,
    errorGroups: {}, results: [], message: '',
  }
  if (items.length === 0) {
    result.message = 'Порожній список items.'
    return result
  }

  const client = getAdminClient()

  // Resolve rows by id and by SKU in bounded chunks.
  const ids = [...new Set(items.map((i) => (i.id ?? '').trim()).filter(Boolean))]
  const skus = [...new Set(items.map((i) => (i.sku ?? '').trim()).filter(Boolean))]
  const byId = new Map<string, ProdRow>()
  const bySku = new Map<string, ProdRow>()
  const COLS = 'id, supplier_sku, meta_title, meta_description, description_ua, seo_keywords, seo_status, seo_manual_lock'
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await client.from('catalog_products').select(COLS).in('id', ids.slice(i, i + 300))
    for (const p of (data ?? []) as ProdRow[]) byId.set(p.id, p)
  }
  for (let i = 0; i < skus.length; i += 300) {
    const { data } = await client.from('catalog_products').select(COLS).in('supplier_sku', skus.slice(i, i + 300))
    for (const p of (data ?? []) as ProdRow[]) if (p.supplier_sku) bySku.set(up(p.supplier_sku), p)
  }

  const now = new Date().toISOString()

  for (const item of items) {
    const key = (item.id ?? item.sku ?? '(?)').toString()
    const prod = (item.id && byId.get(item.id.trim())) || (item.sku && bySku.get(up(item.sku))) || null

    if (!prod) {
      result.skipped++
      result.results.push({ key, status: 'skipped', fields: [], reasons: ['товар не знайдено (id/sku)'] })
      continue
    }

    // Never overwrite human-authored SEO.
    if (prod.seo_manual_lock || prod.seo_status === 'sheet' || prod.seo_status === 'manual') {
      result.skipped++
      result.results.push({ key, status: 'skipped', fields: [], reasons: [`захищене SEO (${prod.seo_manual_lock ? 'lock' : prod.seo_status})`] })
      continue
    }

    const { payload, fields, reasons } = buildValidatedPayload(item, result.errorGroups)
    if (fields.length === 0) {
      result.invalid++
      result.results.push({ key, status: 'invalid', fields: [], reasons: reasons.length ? reasons : ['немає валідних полів'] })
      continue
    }

    if (dryRun) {
      result.updated++ // "would update"
      result.results.push({ key, status: 'updated', fields, reasons })
      continue
    }

    payload.seo_source = 'ai'
    payload.seo_status = 'ai'
    payload.seo_generated_at = now
    payload.updated_at = now

    // Re-assert guards at write time so a row that became sheet/manual/locked
    // between select and update is never clobbered.
    const { error } = await client
      .from('catalog_products')
      .update(payload)
      .eq('id', prod.id)
      .neq('seo_manual_lock', true)
      .neq('seo_status', 'sheet')
      .neq('seo_status', 'manual')

    if (error) {
      result.errors++
      result.results.push({ key, status: 'error', fields, reasons: [error.message] })
    } else {
      result.updated++
      result.results.push({ key, status: 'updated', fields, reasons })
    }
  }

  result.ok = result.errors === 0
  const verb = dryRun ? 'DRY RUN — валідних' : 'Оновлено'
  result.message = `${verb}: ${result.updated}, пропущено: ${result.skipped}, невалідних: ${result.invalid}${result.errors ? `, DB-помилок: ${result.errors}` : ''}.`
  return result
}
