// ─── Russian (RU) localized AI SEO pipeline (pull model) ──────────────────────
// Mirrors the Ukrainian product + category AI SEO pipelines, but reads Ukrainian
// source data as the base and writes ONLY into the per-locale translation tables
// (catalog_product_translations / catalog_category_translations, locale='ru').
// The Ukrainian columns on catalog_products / catalog_categories are NEVER
// touched. Russian SEO is fully independent of Ukrainian seo_status — a product
// whose UA SEO is 'ai'/'manual' can still need RU SEO.
//
// The app never calls an AI provider: n8n pulls candidates, generates Russian
// copy, and POSTs it back for validation + write.

import { getAdminClient } from '@/lib/supabase/admin'
import {
  bestProductName,
  displayProductName,
  isPublicListableProduct,
  formatCatalogPrice,
  getCatalogProductImage,
  categoryDisplayName,
  type NameBearingProduct,
} from '@/lib/supabase/catalog'
import type { CatalogProduct } from '@/types'
import { faqIsEmpty } from '@/lib/catalog/seo-ai-category'
import {
  validateMetaTitle,
  validateMetaDescription,
  validateKeywords,
  validateDescription,
  validateRussianText,
  bannedClaim,
  hasHtml,
  collapse,
  META_TITLE_SOFT_MIN,
  META_TITLE_SOFT_MAX,
  META_TITLE_HARD_MAX,
  META_DESC_SOFT_MIN,
  META_DESC_SOFT_MAX,
  META_DESC_HARD_MAX,
} from './seo-validate'

export const RU_LOCALE = 'ru'
export const RU_SEO_SOURCE = 'n8n-ai-ru'

const isBlank = (s: unknown) => !collapse(s)
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)
const up = (s: unknown) => String(s ?? '').trim().toUpperCase()

// Bounded-concurrency map, order-preserving.
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), items.length || 1) }, worker))
  return results
}

// Length/quality guidance forwarded to n8n. Same windows as UA; language is RU.
const RU_RULES = [
  'Только русский язык (без украинского, без букв і/ї/є/ґ).',
  'Без keyword stuffing.',
  'Без фейковых гарантий, «лучшая цена», «самая низкая цена», «100% гарантия».',
  'Без медицинских утверждений и преувеличенных превосходных степеней.',
  'Без HTML и технических slug (cat-NNN).',
]

export const RU_PRODUCT_TARGETS = {
  language: 'ru',
  meta_title: { soft_min: META_TITLE_SOFT_MIN, soft_max: META_TITLE_SOFT_MAX, hard_max: META_TITLE_HARD_MAX },
  meta_description: { soft_min: META_DESC_SOFT_MIN, soft_max: META_DESC_SOFT_MAX, hard_max: META_DESC_HARD_MAX },
  description: { min: 200, recommended: '400–1200' },
  rules: [...RU_RULES, 'Описание полезно покупателю и описывает именно этот товар.'],
} as const

export const RU_CATEGORY_TARGETS = {
  language: 'ru',
  meta_title: { soft_min: META_TITLE_SOFT_MIN, soft_max: META_TITLE_SOFT_MAX, hard_max: META_TITLE_HARD_MAX },
  meta_description: { soft_min: META_DESC_SOFT_MIN, soft_max: META_DESC_SOFT_MAX, hard_max: META_DESC_HARD_MAX },
  description: { min: 300, recommended: '700–1500' },
  h1: { recommended: 'короткое русское название категории' },
  faq: { recommended_items: '3–5', item: { question: 'string', answer: 'string' } },
  rules: [
    'Опирайся на sample_products, чтобы понять, ЧТО реально в категории — не выдумывай посторонние сценарии.',
    'Если название категории общее, определи смысл по sample_products.',
    ...RU_RULES,
    'Описание коммерчески полезно: что входит в категорию, как выбрать, совместимость, доставка по Украине, когда обращаться к менеджеру.',
    'FAQ — практичные вопросы покупателя на русском (3–5 пар вопрос/ответ).',
  ],
} as const

// ─── Translation-row shapes ───────────────────────────────────────────────────
type ProductTx = {
  product_id: string
  meta_title: string | null
  meta_description: string | null
  description: string | null
  seo_keywords: string | null
  seo_status: string | null
  seo_manual_lock: boolean | null
  // Used to rotate retry order (oldest attempt first) so a row whose copy keeps
  // failing validation never wedges the queue.
  seo_generated_at: string | null
}
type CategoryTx = ProductTx & { category_id: string; h1: string | null; faq_json: unknown }

const PRODUCT_TX_COLS = 'product_id, meta_title, meta_description, description, seo_keywords, seo_status, seo_manual_lock, seo_generated_at'
const CATEGORY_TX_COLS = 'category_id, meta_title, meta_description, description, h1, seo_keywords, faq_json, seo_status, seo_manual_lock, seo_generated_at'

async function fetchRuProductTx(client: ReturnType<typeof getAdminClient>, ids: string[]): Promise<Map<string, ProductTx>> {
  const map = new Map<string, ProductTx>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await client
      .from('catalog_product_translations')
      .select(PRODUCT_TX_COLS)
      .eq('locale', RU_LOCALE)
      .in('product_id', ids.slice(i, i + 300))
    for (const r of (data ?? []) as ProductTx[]) map.set(r.product_id, r)
  }
  return map
}

async function fetchRuCategoryTx(client: ReturnType<typeof getAdminClient>, ids: string[]): Promise<Map<string, CategoryTx>> {
  const map = new Map<string, CategoryTx>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await client
      .from('catalog_category_translations')
      .select(CATEGORY_TX_COLS)
      .eq('locale', RU_LOCALE)
      .in('category_id', ids.slice(i, i + 300))
    for (const r of (data ?? []) as CategoryTx[]) map.set(r.category_id, r)
  }
  return map
}

// RU product needs: missing RU row, or blank meta_title/meta_description/description.
function productRuNeeds(tx: ProductTx | undefined): string[] {
  const needs: string[] = []
  if (!tx || isBlank(tx.meta_title)) needs.push('meta_title')
  if (!tx || isBlank(tx.meta_description)) needs.push('meta_description')
  if (!tx || isBlank(tx.description)) needs.push('description')
  return needs
}

// RU category needs: missing RU row, or any blank field / empty FAQ.
function categoryRuNeeds(tx: CategoryTx | undefined): string[] {
  const needs: string[] = []
  if (!tx || isBlank(tx.meta_title)) needs.push('meta_title')
  if (!tx || isBlank(tx.meta_description)) needs.push('meta_description')
  if (!tx || isBlank(tx.description)) needs.push('description')
  if (!tx || isBlank(tx.h1)) needs.push('h1')
  if (!tx || isBlank(tx.seo_keywords)) needs.push('seo_keywords')
  if (!tx || faqIsEmpty(tx.faq_json)) needs.push('faq')
  return needs
}

// ─── Product RU candidates ────────────────────────────────────────────────────
export interface RuProductCandidate {
  id: string
  slug: string
  sku: string | null
  name: string
  category_slug: string | null
  category_name: string | null
  price: string | null
  image: string | null
  source_uk: { name_ua: string; meta_title: string | null; meta_description: string | null; description_ua: string | null }
  current_ru: { meta_title: string | null; meta_description: string | null; description: string | null; seo_keywords: string | null; seo_status: string | null }
  needs: string[]
  locale: 'ru'
  suggested_targets: typeof RU_PRODUCT_TARGETS
}

const RU_PRODUCT_SRC_COLS =
  'id, slug, supplier_sku, name_ua, name, category_slug, price_uah, price_prefix, unit_label, main_image_url, images, meta_title, meta_description, description_ua'

export interface RuCandidateDiagnostics {
  requested_limit: number
  returned: number
  scanned: number
  pages: number
  missing_translation_found: number // (a) products with NO RU translation row
  partial_found: number             // (b) RU row exists, incomplete, not seo_status='ai'
  invalid_found: number             // (c) RU row exists, incomplete, seo_status='ai' (regen)
  locked_skipped: number
  duplicate_skipped: number
  complete_skipped: number
  reached_end: boolean
  scan_capped: boolean
}

export async function getRuProductAiCandidates(limit = 100): Promise<{ ok: boolean; count: number; limit: number; candidates: RuProductCandidate[]; message: string; diagnostics: RuCandidateDiagnostics }> {
  // Requirement 1: `limit` is the requested result size, capped at a safe max 100.
  const requested = clamp(Math.floor(limit) || 100, 1, 100)
  const client = getAdminClient()
  const PAGE = 1000

  // ROOT-CAUSE FIX.
  // RU eligibility ("RU translation incomplete") lives in a SEPARATE table
  // (catalog_product_translations), so — unlike the UA endpoint, which filters
  // UA fields inline in the products query — it can only be checked per row in JS.
  // The previous implementation compounded that with two over-restrictions:
  //   (1) it required image + price>0 + category on the SOURCE product, which
  //       excludes most of the ~85k RU backlog (many need RU SEO but lack a price
  //       or image); and
  //   (2) it capped the blind scan at 20 pages and stopped as soon as `fresh`
  //       (never-attempted) filled, so a window full of already-complete rows
  //       returned only 4–16.
  // Now: eligibility matches the spec (published + safely matchable real name;
  // NOT image/price/category), and the scan continues until `requested` unique
  // candidates are collected or the eligible set is genuinely exhausted.
  const MAX_PAGES = 200 // safety ceiling (~200k rows); the loop early-stops when filled

  const fresh: { p: CatalogProduct; needs: string[] }[] = []
  const partial: { p: CatalogProduct; tx: ProductTx; needs: string[] }[] = []
  const invalid: { p: CatalogProduct; tx: ProductTx; needs: string[] }[] = []
  const seenIds = new Set<string>()
  const seenSkus = new Set<string>()
  let from = 0
  let scanned = 0
  let pages = 0
  let lockedSkipped = 0
  let completeSkipped = 0
  let duplicateSkipped = 0
  let reachedEnd = false

  const collected = () => fresh.length + partial.length + invalid.length

  try {
    while (collected() < requested && pages < MAX_PAGES) {
      const { data, error } = await client
        .from('catalog_products')
        .select(RU_PRODUCT_SRC_COLS)
        // Matchable, live source products only. Eligibility beyond this is the RU
        // translation state (checked below) — NOT image/price/category, which are
        // not part of the eligibility contract and hid most of the RU backlog.
        .eq('status', 'published')
        .not('name_ua', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)

      const rows = (data ?? []) as unknown as CatalogProduct[]
      pages++
      scanned += rows.length
      // isPublicListableProduct enforces a real, safe name → "cannot be matched
      // safely to a source product" (requirement 5) is the only extra exclusion.
      const listable = rows.filter(isPublicListableProduct)
      const txMap = await fetchRuProductTx(client, listable.map((p) => p.id))

      for (const p of listable) {
        const tx = txMap.get(p.id)
        if (tx?.seo_manual_lock === true) { lockedSkipped++; continue }   // exclude locked
        const needs = productRuNeeds(tx)
        if (needs.length === 0) { completeSkipped++; continue }           // exclude fully complete
        // Deduplicate by stable product id + SKU (requirement 8).
        const skuKey = up(p.supplier_sku)
        if (seenIds.has(p.id) || (skuKey && seenSkus.has(skuKey))) { duplicateSkipped++; continue }
        seenIds.add(p.id)
        if (skuKey) seenSkus.add(skuKey)
        // Bucket by priority: (a) missing row, (b) incomplete non-AI, (c) incomplete AI.
        if (!tx) fresh.push({ p, needs })
        else if (tx.seo_status === 'ai') invalid.push({ p, tx, needs })
        else partial.push({ p, tx, needs })
        if (collected() >= requested) break
      }
      if (rows.length < PAGE) { reachedEnd = true; break }
      from += PAGE
    }
  } catch (e) {
    return {
      ok: false, count: 0, limit: requested, candidates: [],
      message: e instanceof Error ? e.message : String(e),
      diagnostics: {
        requested_limit: requested, returned: 0, scanned, pages,
        missing_translation_found: fresh.length, partial_found: partial.length, invalid_found: invalid.length,
        locked_skipped: lockedSkipped, duplicate_skipped: duplicateSkipped, complete_skipped: completeSkipped,
        reached_end: reachedEnd, scan_capped: pages >= MAX_PAGES,
      },
    }
  }

  // Merge in priority order a → b → c. Within b and c, oldest attempt first so
  // repeated pulls rotate through the backlog and never starve a wedged row
  // (requirement 7); id is a stable tiebreaker.
  const byOldest = (a: { p: CatalogProduct; tx: ProductTx }, b: { p: CatalogProduct; tx: ProductTx }) =>
    (a.tx.seo_generated_at ?? '').localeCompare(b.tx.seo_generated_at ?? '') || a.p.id.localeCompare(b.p.id)
  partial.sort(byOldest)
  invalid.sort(byOldest)
  const ordered: { p: CatalogProduct; tx?: ProductTx; needs: string[] }[] = [
    ...fresh.map(({ p, needs }) => ({ p, needs })),
    ...partial.map(({ p, tx, needs }) => ({ p, tx, needs })),
    ...invalid.map(({ p, tx, needs }) => ({ p, tx, needs })),
  ]
  const picked = ordered.slice(0, requested)

  const scanCapped = pages >= MAX_PAGES && !reachedEnd && picked.length < requested

  // Resolve category display names (only for picked; category may be null now).
  const catSlugs = [...new Set(picked.map((x) => x.p.category_slug).filter(Boolean))] as string[]
  const catName = new Map<string, string>()
  for (let i = 0; i < catSlugs.length; i += 300) {
    const { data: cats } = await client.from('catalog_categories').select('slug, name_ua').in('slug', catSlugs.slice(i, i + 300))
    for (const c of cats ?? []) if (c.slug && c.name_ua) catName.set(c.slug as string, categoryDisplayName(c.name_ua as string))
  }

  const candidates: RuProductCandidate[] = picked.map(({ p, tx, needs }) => ({
    id: p.id,
    slug: p.slug,
    sku: p.supplier_sku ?? null,
    name: displayProductName(p),
    category_slug: p.category_slug ?? null,
    category_name: p.category_slug ? catName.get(p.category_slug) ?? null : null,
    price: formatCatalogPrice(p),
    image: getCatalogProductImage(p),
    source_uk: {
      name_ua: (p.name_ua ?? '').trim(),
      meta_title: p.meta_title ?? null,
      meta_description: p.meta_description ?? null,
      description_ua: p.description_ua ?? null,
    },
    current_ru: {
      meta_title: tx?.meta_title ?? null,
      meta_description: tx?.meta_description ?? null,
      description: tx?.description ?? null,
      seo_keywords: tx?.seo_keywords ?? null,
      seo_status: tx?.seo_status ?? null,
    },
    needs,
    locale: 'ru',
    suggested_targets: RU_PRODUCT_TARGETS,
  }))

  const diagnostics: RuCandidateDiagnostics = {
    requested_limit: requested,
    returned: candidates.length,
    scanned,
    pages,
    missing_translation_found: fresh.length,
    partial_found: partial.length,
    invalid_found: invalid.length,
    locked_skipped: lockedSkipped,
    duplicate_skipped: duplicateSkipped,
    complete_skipped: completeSkipped,
    reached_end: reachedEnd,
    scan_capped: scanCapped,
  }

  // Message + under-fill guard (requirement 11): only when we returned fewer than
  // requested do we spend the extra coverage counts to explain exactly why.
  let message: string
  if (candidates.length === 0) {
    message = reachedEnd
      ? 'Нет товаров, которым нужен RU SEO (все сопоставимые товары уже заполнены или заблокированы).'
      : `0 кандидатов после сканирования ${scanned} товаров.`
  } else {
    message = `Найдено ${candidates.length} кандидатов: ${fresh.length} без RU-строки, ${partial.length} частичных, ${invalid.length} невалидных AI.`
  }
  if (candidates.length < requested) {
    let backlog = 0
    try { backlog = (await localizedProductCoverage(RU_LOCALE)).backlog } catch { /* best-effort */ }
    if (backlog >= requested) {
      const why = scanCapped
        ? `окно сканирования (${MAX_PAGES}×${PAGE}) исчерпано до сбора ${requested}; подходящие товары разрежены или глубоко в каталоге`
        : reachedEnd
          ? `сопоставимых незаблокированных товаров с неполным RU меньше ${requested} — пропущено: заблокировано ${lockedSkipped}, полностью заполнено ${completeSkipped}; часть RU-бэклога (${backlog}) — товары без корректного имени или не в статусе published`
          : 'сканирование остановлено до заполнения'
      message += ` ⚠ RU-бэклог ≈ ${backlog} ≥ ${requested}, но возвращено ${candidates.length}: ${why}.`
    }
  }

  return { ok: true, count: candidates.length, limit: requested, candidates, message, diagnostics }
}

// ─── Category RU candidates (grounded + ranked by product count) ──────────────
export interface RuCategoryCandidate {
  id: string
  slug: string
  name: string
  source_uk: { name_ua: string; meta_title: string | null; meta_description: string | null; description_ua: string | null }
  current_ru: { meta_title: string | null; meta_description: string | null; description: string | null; h1: string | null; seo_keywords: string | null; has_faq: boolean; seo_status: string | null }
  needs: string[]
  products_count: number
  sample_products: string[]
  locale: 'ru'
  suggested_targets: typeof RU_CATEGORY_TARGETS
}

type CatSrcRow = {
  id: string
  slug: string
  name_ua: string | null
  meta_title: string | null
  meta_description: string | null
  description_ua: string | null
}

async function countPublishedInCategory(client: ReturnType<typeof getAdminClient>, slug: string): Promise<number> {
  const { count } = await client
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('category_slug', slug)
  return count ?? 0
}

async function sampleProductNames(client: ReturnType<typeof getAdminClient>, slug: string): Promise<string[]> {
  const { data } = await client
    .from('catalog_products')
    .select('name_ua, name, supplier_sku')
    .eq('status', 'published')
    .eq('category_slug', slug)
    .limit(20)
  const names: string[] = []
  const seen = new Set<string>()
  for (const p of (data ?? []) as unknown as NameBearingProduct[]) {
    if (!isPublicListableProduct(p)) continue
    const n = bestProductName(p)
    if (!n) continue
    const key = n.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(n)
    if (names.length >= 10) break
  }
  return names
}

// Fetch all published categories with a name (paged).
async function fetchPublishedCategories(client: ReturnType<typeof getAdminClient>): Promise<CatSrcRow[]> {
  const out: CatSrcRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('catalog_categories')
      .select('id, slug, name_ua, meta_title, meta_description, description_ua')
      .eq('is_published', true)
      .not('name_ua', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as CatSrcRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export async function getRuCategoryAiCandidates(limit = 100): Promise<{ ok: boolean; count: number; limit: number; candidates: RuCategoryCandidate[]; message: string }> {
  const capped = clamp(Math.floor(limit) || 100, 1, 1000)
  const client = getAdminClient()

  let cats: CatSrcRow[]
  let txMap: Map<string, CategoryTx>
  try {
    cats = await fetchPublishedCategories(client)
    txMap = await fetchRuCategoryTx(client, cats.map((c) => c.id))
  } catch (e) {
    return { ok: false, count: 0, limit: capped, candidates: [], message: e instanceof Error ? e.message : String(e) }
  }

  // Keep categories that need RU SEO (excluding RU manual-locked rows).
  const needing = cats
    .map((c) => ({ c, tx: txMap.get(c.id) }))
    .filter(({ tx }) => tx?.seo_manual_lock !== true)
    .map(({ c, tx }) => ({ c, tx, needs: categoryRuNeeds(tx) }))
    .filter((x) => x.needs.length > 0)

  // Product counts for ranking (bounded concurrency), then rank by count DESC.
  let counts: number[]
  try {
    counts = await mapPool(needing, 12, ({ c }) => countPublishedInCategory(client, c.slug))
  } catch (e) {
    return { ok: false, count: 0, limit: capped, candidates: [], message: e instanceof Error ? e.message : String(e) }
  }

  const ranked = needing
    .map((x, i) => ({ ...x, products_count: counts[i] }))
    .sort((a, b) => b.products_count - a.products_count || a.c.slug.localeCompare(b.c.slug))
    .slice(0, capped)

  const samples = await mapPool(ranked, 12, ({ c }) => sampleProductNames(client, c.slug)).catch(() => ranked.map(() => []))

  const candidates: RuCategoryCandidate[] = ranked.map(({ c, tx, needs, products_count }, i) => ({
    id: c.id,
    slug: c.slug,
    name: categoryDisplayName(c.name_ua),
    source_uk: {
      name_ua: (c.name_ua ?? '').trim(),
      meta_title: c.meta_title ?? null,
      meta_description: c.meta_description ?? null,
      description_ua: c.description_ua ?? null,
    },
    current_ru: {
      meta_title: tx?.meta_title ?? null,
      meta_description: tx?.meta_description ?? null,
      description: tx?.description ?? null,
      h1: tx?.h1 ?? null,
      seo_keywords: tx?.seo_keywords ?? null,
      has_faq: !faqIsEmpty(tx?.faq_json),
      seo_status: tx?.seo_status ?? null,
    },
    needs,
    products_count,
    sample_products: samples[i] ?? [],
    locale: 'ru',
    suggested_targets: RU_CATEGORY_TARGETS,
  }))

  return {
    ok: true,
    count: candidates.length,
    limit: capped,
    candidates,
    message: candidates.length === 0 ? 'Нет категорий, которым нужен RU SEO.' : `Найдено ${candidates.length} кандидатов.`,
  }
}

// ─── Shared apply plumbing ────────────────────────────────────────────────────
export interface ApplyItemOutcome { key: string; status: 'updated' | 'skipped' | 'error' | 'invalid'; fields: string[]; reasons: string[] }
export interface ApplyResult {
  ok: boolean
  dryRun: boolean
  locale: 'ru'
  received: number
  updated: number
  skipped: number
  invalid: number
  errors: number
  errorGroups: Record<string, number>
  results: ApplyItemOutcome[]
  message: string
}

function newResult(dryRun: boolean, received: number): ApplyResult {
  return { ok: true, dryRun, locale: 'ru', received, updated: 0, skipped: 0, invalid: 0, errors: 0, errorGroups: {}, results: [], message: '' }
}

// Validate a Russian text field: base validator (length/HTML/slug/banned) AND the
// Russian-language gate.
function validateRuField(
  kind: 'meta_title' | 'meta_description' | 'description' | 'keywords',
  value: unknown,
  groups: Record<string, number>,
): { value: string | null; reasons: string[] } {
  const reasons: string[] = []
  const record = (rs: string[]) => { for (const r of rs) { reasons.push(r); groups[r] = (groups[r] ?? 0) + 1 } }
  if (value == null || !collapse(value)) return { value: null, reasons }

  if (kind === 'keywords') {
    const v = validateKeywords(value as string)
    if (v.ok) return { value: collapse(value), reasons }
    record(v.reasons.map((r) => `keywords: ${r}`))
    return { value: null, reasons }
  }
  if (kind === 'description') {
    const v = validateDescription(value as string) // strips HTML, returns cleaned value
    const ru = validateRussianText(v.value)
    if (v.ok && ru.ok) return { value: v.value, reasons }
    record([...v.reasons, ...ru.reasons].map((r) => `description: ${r}`))
    return { value: null, reasons }
  }
  const v = kind === 'meta_title' ? validateMetaTitle(value as string) : validateMetaDescription(value as string)
  const ru = validateRussianText(value as string)
  if (v.ok && ru.ok) return { value: collapse(value), reasons }
  record([...v.reasons, ...ru.reasons].map((r) => `${kind}: ${r}`))
  return { value: null, reasons }
}

// FAQ validation (categories): array of { question, answer }, both non-empty
// Russian, no banned claims / HTML. Never passes the array into a text validator.
function validateRuFaq(faq: unknown): { ok: boolean; value: { question: string; answer: string }[]; reasons: string[] } {
  const reasons: string[] = []
  if (!Array.isArray(faq)) return { ok: false, value: [], reasons: ['faq не является массивом'] }
  if (faq.length === 0) return { ok: false, value: [], reasons: ['пустой faq'] }
  if (faq.length > 10) return { ok: false, value: [], reasons: ['слишком много faq-пар (>10)'] }
  const out: { question: string; answer: string }[] = []
  for (const raw of faq) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) { reasons.push('faq: элемент не объект {question, answer}'); continue }
    const rq = (raw as Record<string, unknown>).question
    const ra = (raw as Record<string, unknown>).answer
    if (typeof rq !== 'string' || typeof ra !== 'string') { reasons.push('faq: question и answer должны быть строками'); continue }
    const q = collapse(rq)
    const a = collapse(ra)
    if (!q || !a) { reasons.push('faq: пустой вопрос или ответ'); continue }
    for (const [field, text] of [['вопрос', q], ['ответ', a]] as const) {
      const ru = validateRussianText(text)
      if (!ru.ok) reasons.push(...ru.reasons.map((r) => `faq ${field}: ${r}`))
      if (hasHtml(text)) reasons.push(`faq ${field}: содержит HTML`)
      const claim = bannedClaim(text)
      if (claim) reasons.push(`faq ${field}: недопустимое утверждение: ${claim}`)
    }
    out.push({ question: q, answer: a })
  }
  return { ok: reasons.length === 0 && out.length > 0, value: out, reasons }
}

// ─── Product RU apply ─────────────────────────────────────────────────────────
export interface AiRuProductItem {
  id?: string
  sku?: string
  meta_title?: string | null
  meta_description?: string | null
  description?: string | null
  keywords?: string | string[] | null
}

function normalizeKeywords(kw: unknown): string {
  if (typeof kw === 'string') return kw
  if (Array.isArray(kw)) return kw.filter((k): k is string => typeof k === 'string').join(', ')
  return ''
}

export async function applyRuProductAiBatch(items: AiRuProductItem[], opts: { dryRun?: boolean } = {}): Promise<ApplyResult> {
  const dryRun = opts.dryRun === true
  const result = newResult(dryRun, items.length)
  if (items.length === 0) { result.message = 'Пустой список items.'; return result }

  const client = getAdminClient()
  // Resolve products by id or SKU (Ukrainian source table).
  const ids = [...new Set(items.map((i) => (i.id ?? '').trim()).filter(Boolean))]
  const skus = [...new Set(items.map((i) => (i.sku ?? '').trim()).filter(Boolean))]
  const byId = new Map<string, string>() // id -> id
  const bySku = new Map<string, string>() // UPPER(sku) -> product id
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await client.from('catalog_products').select('id').in('id', ids.slice(i, i + 300))
    for (const p of (data ?? []) as { id: string }[]) byId.set(p.id, p.id)
  }
  for (let i = 0; i < skus.length; i += 300) {
    const { data } = await client.from('catalog_products').select('id, supplier_sku').in('supplier_sku', skus.slice(i, i + 300))
    for (const p of (data ?? []) as { id: string; supplier_sku: string | null }[]) if (p.supplier_sku) bySku.set(up(p.supplier_sku), p.id)
  }

  const resolvedIds = [...new Set(items.map((it) => (it.id && byId.get(it.id.trim())) || (it.sku && bySku.get(up(it.sku))) || '').filter(Boolean))] as string[]
  const existing = await fetchRuProductTx(client, resolvedIds)
  const now = new Date().toISOString()

  for (const item of items) {
    const key = (item.id ?? item.sku ?? '(?)').toString()
    const productId = (item.id && byId.get(item.id.trim())) || (item.sku && bySku.get(up(item.sku))) || null
    if (!productId) { result.skipped++; result.results.push({ key, status: 'skipped', fields: [], reasons: ['товар не найден (id/sku)'] }); continue }

    const cur = existing.get(productId)
    if (cur?.seo_manual_lock === true) { result.skipped++; result.results.push({ key, status: 'skipped', fields: [], reasons: ['RU SEO заблокировано (manual_lock)'] }); continue }

    const payload: Record<string, unknown> = {}
    const fields: string[] = []
    const reasons: string[] = []
    for (const kind of ['meta_title', 'meta_description', 'description'] as const) {
      const { value, reasons: rs } = validateRuField(kind, item[kind], result.errorGroups)
      reasons.push(...rs)
      if (value != null) { payload[kind] = value; fields.push(kind) }
    }
    const kw = normalizeKeywords(item.keywords)
    if (collapse(kw)) {
      const { value, reasons: rs } = validateRuField('keywords', kw, result.errorGroups)
      reasons.push(...rs)
      if (value != null) { payload.seo_keywords = value; fields.push('seo_keywords') }
    }

    if (fields.length === 0) { result.invalid++; result.results.push({ key, status: 'invalid', fields: [], reasons: reasons.length ? reasons : ['нет валидных полей'] }); continue }
    if (dryRun) { result.updated++; result.results.push({ key, status: 'updated', fields, reasons }); continue }

    payload.product_id = productId
    payload.locale = RU_LOCALE
    payload.seo_status = 'ai'
    payload.seo_source = RU_SEO_SOURCE
    payload.seo_generated_at = now

    const { error } = await client.from('catalog_product_translations').upsert(payload, { onConflict: 'product_id,locale' })
    if (error) { result.errors++; result.results.push({ key, status: 'error', fields, reasons: [error.message] }) }
    else { result.updated++; result.results.push({ key, status: 'updated', fields, reasons }) }
  }

  result.ok = result.errors === 0
  result.message = `${dryRun ? 'DRY RUN — валидных' : 'Обновлено'}: ${result.updated}, пропущено: ${result.skipped}, невалидных: ${result.invalid}${result.errors ? `, ошибок БД: ${result.errors}` : ''}.`
  return result
}

// ─── Category RU apply ────────────────────────────────────────────────────────
export interface AiRuCategoryItem {
  id?: string
  slug?: string
  meta_title?: string | null
  meta_description?: string | null
  description?: string | null
  h1?: string | null
  keywords?: string | string[] | null
  faq?: unknown
}

export async function applyRuCategoryAiBatch(items: AiRuCategoryItem[], opts: { dryRun?: boolean } = {}): Promise<ApplyResult> {
  const dryRun = opts.dryRun === true
  const result = newResult(dryRun, items.length)
  if (items.length === 0) { result.message = 'Пустой список items.'; return result }

  const client = getAdminClient()
  const ids = [...new Set(items.map((i) => (i.id ?? '').trim()).filter(Boolean))]
  const slugs = [...new Set(items.map((i) => (i.slug ?? '').trim()).filter(Boolean))]
  const byId = new Map<string, string>()
  const bySlug = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await client.from('catalog_categories').select('id').in('id', ids.slice(i, i + 300))
    for (const c of (data ?? []) as { id: string }[]) byId.set(c.id, c.id)
  }
  for (let i = 0; i < slugs.length; i += 300) {
    const { data } = await client.from('catalog_categories').select('id, slug').in('slug', slugs.slice(i, i + 300))
    for (const c of (data ?? []) as { id: string; slug: string | null }[]) if (c.slug) bySlug.set(up(c.slug), c.id)
  }

  const resolvedIds = [...new Set(items.map((it) => (it.id && byId.get(it.id.trim())) || (it.slug && bySlug.get(up(it.slug))) || '').filter(Boolean))] as string[]
  const existing = await fetchRuCategoryTx(client, resolvedIds)
  const now = new Date().toISOString()

  for (const item of items) {
    const key = (item.id ?? item.slug ?? '(?)').toString()
    const categoryId = (item.id && byId.get(item.id.trim())) || (item.slug && bySlug.get(up(item.slug))) || null
    if (!categoryId) { result.skipped++; result.results.push({ key, status: 'skipped', fields: [], reasons: ['категория не найдена (id/slug)'] }); continue }

    const cur = existing.get(categoryId)
    if (cur?.seo_manual_lock === true) { result.skipped++; result.results.push({ key, status: 'skipped', fields: [], reasons: ['RU SEO заблокировано (manual_lock)'] }); continue }

    const payload: Record<string, unknown> = {}
    const fields: string[] = []
    const reasons: string[] = []
    for (const kind of ['meta_title', 'meta_description', 'description'] as const) {
      const { value, reasons: rs } = validateRuField(kind, item[kind], result.errorGroups)
      reasons.push(...rs)
      if (value != null) { payload[kind] = value; fields.push(kind) }
    }
    // h1 shares the meta-title guards + Russian gate.
    if (item.h1 != null && collapse(item.h1)) {
      const t = validateMetaTitle(item.h1)
      const ru = validateRussianText(item.h1)
      if (t.ok && ru.ok) { payload.h1 = collapse(item.h1); fields.push('h1') }
      else { for (const r of [...t.reasons, ...ru.reasons].map((r) => `h1: ${r}`)) { reasons.push(r); result.errorGroups[r] = (result.errorGroups[r] ?? 0) + 1 } }
    }
    const kw = normalizeKeywords(item.keywords)
    if (collapse(kw)) {
      const { value, reasons: rs } = validateRuField('keywords', kw, result.errorGroups)
      reasons.push(...rs)
      if (value != null) { payload.seo_keywords = value; fields.push('seo_keywords') }
    }
    if (item.faq != null) {
      const v = validateRuFaq(item.faq)
      if (v.ok) { payload.faq_json = v.value; fields.push('faq_json') }
      else { for (const r of v.reasons) { reasons.push(r); result.errorGroups[r] = (result.errorGroups[r] ?? 0) + 1 } }
    }

    if (fields.length === 0) { result.invalid++; result.results.push({ key, status: 'invalid', fields: [], reasons: reasons.length ? reasons : ['нет валидных полей'] }); continue }
    if (dryRun) { result.updated++; result.results.push({ key, status: 'updated', fields, reasons }); continue }

    payload.category_id = categoryId
    payload.locale = RU_LOCALE
    payload.seo_status = 'ai'
    payload.seo_source = RU_SEO_SOURCE
    payload.seo_generated_at = now

    const { error } = await client.from('catalog_category_translations').upsert(payload, { onConflict: 'category_id,locale' })
    if (error) { result.errors++; result.results.push({ key, status: 'error', fields, reasons: [error.message] }) }
    else { result.updated++; result.results.push({ key, status: 'updated', fields, reasons }) }
  }

  result.ok = result.errors === 0
  result.message = `${dryRun ? 'DRY RUN — валидных' : 'Обновлено'}: ${result.updated}, пропущено: ${result.skipped}, невалидных: ${result.invalid}${result.errors ? `, ошибок БД: ${result.errors}` : ''}.`
  return result
}

// ─── Localized coverage diagnostics ───────────────────────────────────────────
async function count(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try { const { count } = await build(); return count ?? 0 } catch { return 0 }
}

export async function localizedProductCoverage(locale: string = RU_LOCALE) {
  const client = getAdminClient()
  const P = () => client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published')
  const T = () => client.from('catalog_product_translations').select('id', { count: 'exact', head: true }).eq('locale', locale)
  const [total, ruRows, ruMetaTitle, ruMetaDesc, ruDesc, ruAi, ruLocked] = await Promise.all([
    count(P),
    count(T),
    count(() => T().not('meta_title', 'is', null).neq('meta_title', '')),
    count(() => T().not('meta_description', 'is', null).neq('meta_description', '')),
    count(() => T().not('description', 'is', null).neq('description', '')),
    count(() => T().eq('seo_status', 'ai')),
    count(() => T().eq('seo_manual_lock', true)),
  ])
  const complete = await count(() =>
    T().not('meta_title', 'is', null).neq('meta_title', '').not('meta_description', 'is', null).neq('meta_description', '').not('description', 'is', null).neq('description', ''))
  return { total, ruRows, ruMetaTitle, ruMetaDesc, ruDesc, ruAi, ruLocked, complete, backlog: Math.max(0, total - complete) }
}

export async function localizedCategoryCoverage(locale: string = RU_LOCALE) {
  const client = getAdminClient()
  const C = () => client.from('catalog_categories').select('id', { count: 'exact', head: true }).eq('is_published', true)
  const T = () => client.from('catalog_category_translations').select('id', { count: 'exact', head: true }).eq('locale', locale)
  const [total, ruRows, ruMetaTitle, ruMetaDesc, ruDesc, ruH1, ruFaq, ruAi, ruLocked] = await Promise.all([
    count(C),
    count(T),
    count(() => T().not('meta_title', 'is', null).neq('meta_title', '')),
    count(() => T().not('meta_description', 'is', null).neq('meta_description', '')),
    count(() => T().not('description', 'is', null).neq('description', '')),
    count(() => T().not('h1', 'is', null).neq('h1', '')),
    count(() => T().not('faq_json', 'is', null)),
    count(() => T().eq('seo_status', 'ai')),
    count(() => T().eq('seo_manual_lock', true)),
  ])
  const complete = await count(() =>
    T().not('meta_title', 'is', null).neq('meta_title', '').not('meta_description', 'is', null).neq('meta_description', '').not('description', 'is', null).neq('description', ''))
  return { total, ruRows, ruMetaTitle, ruMetaDesc, ruDesc, ruH1, ruFaq, ruAi, ruLocked, complete, backlog: Math.max(0, total - complete) }
}
