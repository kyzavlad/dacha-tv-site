// ─── AI-ready CATEGORY SEO pipeline (pull model) ──────────────────────────────
// The category counterpart to lib/catalog/seo-ai.ts. Same safe, PULL-based loop:
//
//   1. GET  /api/admin/seo/category-ai-candidates → categories needing SEO
//   2. n8n calls the AI, produces validated Ukrainian JSON
//   3. POST /api/admin/seo/apply-category-ai-batch → validate + write
//
// The app never calls an AI provider. Only allowed SEO columns are written,
// human-authored SEO (sheet/manual/locked) is NEVER overwritten, and nothing
// here touches products, checkout, supplier data, import, sitemap, or schema.

import { getAdminClient } from '@/lib/supabase/admin'
import { categoryDisplayName } from '@/lib/supabase/catalog'
import {
  validateMetaTitle,
  validateMetaDescription,
  validateKeywords,
  validateDescription,
  validateUkrainianText,
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

// Human-authored SEO that AI must NEVER overwrite (Sheets import or manual edit).
export const PROTECTED_CATEGORY_SEO_STATUSES = ['sheet', 'manual'] as const

const CANDIDATE_COLS =
  'id, slug, name_ua, description, description_ua, h1, meta_title, meta_description, seo_keywords, faq_json, seo_status, seo_source, seo_manual_lock'

// Target windows + commercial guidance forwarded to n8n/AI so the prompt matches
// what the apply endpoint will accept. Category copy must be genuinely useful:
// what the category includes, how to choose, compatibility, delivery in Ukraine,
// and when to contact a manager.
export const SEO_CATEGORY_TARGETS = {
  language: 'uk',
  meta_title: { soft_min: META_TITLE_SOFT_MIN, soft_max: META_TITLE_SOFT_MAX, hard_max: META_TITLE_HARD_MAX },
  meta_description: { soft_min: META_DESC_SOFT_MIN, soft_max: META_DESC_SOFT_MAX, hard_max: META_DESC_HARD_MAX },
  description: { min: 300, recommended: '700–1500' },
  h1: { recommended: 'коротка українська назва категорії' },
  faq: { recommended_items: '3–5', item: { question: 'string', answer: 'string' } },
  rules: [
    'Тільки українська мова (без російської, без літер ы/э/ъ/ё).',
    'Без keyword stuffing.',
    'Без фейкових гарантій, «найкраща ціна», медичних чи суперлятивних тверджень.',
    'Без HTML та технічних slug (cat-NNN).',
    'Опис має бути комерційно корисним: що входить у категорію, як обрати товар, сумісність/різновиди, доставка по Україні, коли звертатися до менеджера.',
    'FAQ — практичні запитання покупця українською (3–5 пар питання/відповідь).',
  ],
} as const

export interface FaqPair { question: string; answer: string }

export interface CategorySeoCandidate {
  id: string
  slug: string
  name: string
  current: {
    meta_title: string | null
    meta_description: string | null
    description_ua: string | null
    h1: string | null
    seo_keywords: string | null
    has_faq: boolean
    seo_status: string | null
    seo_source: string | null
  }
  needs: string[] // 'meta_title' | 'meta_description' | 'description' | 'faq'
  suggested_targets: typeof SEO_CATEGORY_TARGETS
}

export interface CategoryCandidatesResult {
  ok: boolean
  count: number
  limit: number
  candidates: CategorySeoCandidate[]
  message: string
}

// A text field counts as "missing" when it is null, empty, OR whitespace-only.
// collapse() trims + type-guards, so this is true for null/undefined/'' /'   '.
const isBlank = (s: unknown) => !collapse(s)

// FAQ is "missing" when it is not an array or is an empty array.
export function faqIsEmpty(faq: unknown): boolean {
  return !Array.isArray(faq) || faq.length === 0
}

// ── SINGLE SOURCE OF TRUTH: which SEO fields a category still needs ────────────
// Used by BOTH the candidates endpoint and the diagnostic backlog so they can
// never diverge. Every tracked field is "needed" when blank (null/empty/
// whitespace); FAQ when absent or empty.
export function categorySeoNeeds(c: {
  meta_title?: string | null
  meta_description?: string | null
  description_ua?: string | null
  h1?: string | null
  seo_keywords?: string | null
  faq_json?: unknown
}): string[] {
  const needs: string[] = []
  if (isBlank(c.meta_title)) needs.push('meta_title')
  if (isBlank(c.meta_description)) needs.push('meta_description')
  if (isBlank(c.description_ua)) needs.push('description')
  if (isBlank(c.h1)) needs.push('h1')
  if (isBlank(c.seo_keywords)) needs.push('seo_keywords')
  if (faqIsEmpty(c.faq_json)) needs.push('faq')
  return needs
}

export function categoryNeedsSeo(c: Parameters<typeof categorySeoNeeds>[0]): boolean {
  return categorySeoNeeds(c).length > 0
}

type CatRow = {
  id: string
  slug: string
  name_ua: string | null
  description: string | null
  description_ua: string | null
  h1: string | null
  meta_title: string | null
  meta_description: string | null
  seo_keywords: string | null
  faq_json: unknown
  seo_status: string | null
  seo_source: string | null
  seo_manual_lock: boolean | null
}

// A category is AI-eligible unless its SEO is human-authored. Evaluated in JS (not
// via `.neq` in SQL) so NULL/'' seo_status is correctly ALLOWED — a SQL
// `seo_status <> 'sheet'` filter drops NULL rows, which would silently exclude the
// exact categories that still need SEO.
function isAiEligibleCategory(c: { seo_status: string | null; seo_manual_lock: boolean | null }): boolean {
  if (c.seo_manual_lock === true) return false
  if (c.seo_status === 'sheet' || c.seo_status === 'manual') return false
  return true
}

// Shared fetch: published categories (with a name) that are AI-eligible AND still
// need SEO, using the shared helper. Pages the table; stops once `limit` matches
// are collected. NO unusable-name exclusion — the diagnostic backlog counts those
// too and categoryDisplayName gives them a real fallback name, so excluding them
// here is exactly what made candidates return 0 while the backlog reported 500.
async function fetchCategoriesNeedingSeo(opts: { limit?: number } = {}): Promise<CatRow[]> {
  const client = getAdminClient()
  const PAGE = 1000
  const out: CatRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('catalog_categories')
      .select(CANDIDATE_COLS)
      .eq('is_published', true)
      .not('name_ua', 'is', null)
      // Oldest-generated first so repeated pulls rotate through the backlog.
      .order('seo_generated_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as CatRow[]
    for (const c of rows) {
      if (isAiEligibleCategory(c) && categoryNeedsSeo(c)) {
        out.push(c)
        if (opts.limit && out.length >= opts.limit) return out
      }
    }
    if (rows.length < PAGE) break
  }
  return out
}

// Count of AI-eligible categories that still need SEO — the diagnostic backlog.
// Shares the exact selection logic of getCategorySeoAiCandidates.
export async function countCategoriesNeedingSeo(): Promise<number> {
  return (await fetchCategoriesNeedingSeo()).length
}

// Select published categories that need SEO improvement, excluding human-authored
// SEO (sheet/manual) or a manual lock. Selection is identical to the diagnostic
// backlog (same shared helper), so a non-zero backlog always yields candidates.
export async function getCategorySeoAiCandidates(limit = 100): Promise<CategoryCandidatesResult> {
  const capped = Math.min(Math.max(limit, 1), 1000)

  let rows: CatRow[]
  try {
    rows = await fetchCategoriesNeedingSeo({ limit: capped })
  } catch (e) {
    return { ok: false, count: 0, limit: capped, candidates: [], message: e instanceof Error ? e.message : String(e) }
  }

  const candidates: CategorySeoCandidate[] = rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: categoryDisplayName(c.name_ua),
    current: {
      meta_title: c.meta_title ?? null,
      meta_description: c.meta_description ?? null,
      description_ua: c.description_ua ?? null,
      h1: c.h1 ?? null,
      seo_keywords: c.seo_keywords ?? null,
      has_faq: !faqIsEmpty(c.faq_json),
      seo_status: c.seo_status ?? null,
      seo_source: c.seo_source ?? null,
    },
    needs: categorySeoNeeds(c),
    suggested_targets: SEO_CATEGORY_TARGETS,
  }))

  return {
    ok: true,
    count: candidates.length,
    limit: capped,
    candidates,
    message: candidates.length === 0 ? 'Немає категорій, що потребують SEO.' : `Знайдено ${candidates.length} кандидатів.`,
  }
}

// ─── Apply validated AI results ───────────────────────────────────────────────

export interface AiCategorySeoItem {
  id?: string
  slug?: string
  meta_title?: string | null
  meta_description?: string | null
  description?: string | null // → description_ua
  h1?: string | null
  keywords?: string | string[] | null // → seo_keywords (CSV or array)
  faq?: unknown // → faq_json, expected [{ question, answer }]
}

export interface ApplyCategoryItemOutcome {
  key: string
  status: 'updated' | 'skipped' | 'error' | 'invalid'
  fields: string[]
  reasons: string[]
}

export interface ApplyCategoryResult {
  ok: boolean
  dryRun: boolean
  received: number
  updated: number
  skipped: number
  invalid: number
  errors: number
  errorGroups: Record<string, number>
  results: ApplyCategoryItemOutcome[]
  message: string
}

type ApplyRow = {
  id: string
  slug: string
  meta_title: string | null
  meta_description: string | null
  description_ua: string | null
  h1: string | null
  seo_keywords: string | null
  faq_json: unknown
  seo_status: string | null
  seo_manual_lock: boolean | null
}

// Validate an FAQ array WITHOUT ever passing the array/object into a generic text
// validator. Each item must be a plain object with STRING question + answer; both
// are validated as Ukrainian text and checked for forbidden phrases / HTML only
// (no min-length rule — a real FAQ question is often short). Returns cleaned pairs
// or reasons; never throws on malformed input.
function validateFaq(faq: unknown): { ok: boolean; value: FaqPair[]; reasons: string[] } {
  const reasons: string[] = []
  if (!Array.isArray(faq)) return { ok: false, value: [], reasons: ['faq не є масивом'] }
  if (faq.length === 0) return { ok: false, value: [], reasons: ['порожній faq'] }
  if (faq.length > 10) return { ok: false, value: [], reasons: ['забагато faq-пар (>10)'] }

  const out: FaqPair[] = []
  for (const raw of faq) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      reasons.push('faq: елемент не є обʼєктом {question, answer}')
      continue
    }
    const rawQ = (raw as Record<string, unknown>).question
    const rawA = (raw as Record<string, unknown>).answer
    if (typeof rawQ !== 'string' || typeof rawA !== 'string') {
      reasons.push('faq: question та answer мають бути рядками')
      continue
    }
    const q = collapse(rawQ)
    const a = collapse(rawA)
    if (!q || !a) { reasons.push('faq: порожнє питання або відповідь'); continue }

    for (const [field, text] of [['питання', q], ['відповідь', a]] as const) {
      const ua = validateUkrainianText(text)
      if (!ua.ok) reasons.push(...ua.reasons.map((r) => `faq ${field}: ${r}`))
      if (hasHtml(text)) reasons.push(`faq ${field}: містить HTML`)
      const claim = bannedClaim(text)
      if (claim) reasons.push(`faq ${field}: недопустиме твердження: ${claim}`)
    }
    out.push({ question: q, answer: a })
  }
  return { ok: reasons.length === 0 && out.length > 0, value: out, reasons }
}

// Keywords may arrive as a CSV string OR a string[] (n8n/AI often emits an array).
// Normalise to a clean CSV string; anything else (object/number) → ''. Never
// passes a non-string into a validator.
function normalizeKeywords(kw: unknown): string {
  if (typeof kw === 'string') return kw
  if (Array.isArray(kw)) return kw.filter((k): k is string => typeof k === 'string').join(', ')
  return ''
}

function buildValidatedPayload(
  item: AiCategorySeoItem,
  groups: Record<string, number>,
): { payload: Record<string, unknown>; fields: string[]; reasons: string[] } {
  const payload: Record<string, unknown> = {}
  const fields: string[] = []
  const reasons: string[] = []
  const record = (rs: string[]) => {
    for (const r of rs) { reasons.push(r); groups[r] = (groups[r] ?? 0) + 1 }
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

  if (item.h1 != null && collapse(item.h1)) {
    const ua = validateUkrainianText(item.h1)
    // h1 shares the meta-title guards (length/HTML/slug/banned claims).
    const v = validateMetaTitle(item.h1)
    if (ua.ok && v.ok) { payload.h1 = collapse(item.h1); fields.push('h1') }
    else record([...ua.reasons, ...v.reasons].map((r) => `h1: ${r}`))
  }

  const keywordsStr = normalizeKeywords(item.keywords)
  if (collapse(keywordsStr)) {
    const v = validateKeywords(keywordsStr)
    if (v.ok) { payload.seo_keywords = collapse(keywordsStr); fields.push('seo_keywords') }
    else record(v.reasons.map((r) => `keywords: ${r}`))
  }

  if (item.faq != null) {
    const v = validateFaq(item.faq)
    if (v.ok) { payload.faq_json = v.value; fields.push('faq_json') }
    else record(v.reasons)
  }

  return { payload, fields, reasons }
}

const up = (s: unknown) => String(s ?? '').trim().toUpperCase()

// Apply a batch of AI-generated category SEO. Matches by id (preferred) or slug,
// validates every field, writes ONLY allowed SEO columns — never on a locked or
// sheet/manual row. dryRun validates + reports without writing.
export async function applyCategoryAiSeoBatch(
  items: AiCategorySeoItem[],
  opts: { dryRun?: boolean } = {},
): Promise<ApplyCategoryResult> {
  const dryRun = opts.dryRun === true
  const result: ApplyCategoryResult = {
    ok: true, dryRun, received: items.length,
    updated: 0, skipped: 0, invalid: 0, errors: 0,
    errorGroups: {}, results: [], message: '',
  }
  if (items.length === 0) { result.message = 'Порожній список items.'; return result }

  const client = getAdminClient()
  const COLS = 'id, slug, meta_title, meta_description, description_ua, h1, seo_keywords, faq_json, seo_status, seo_manual_lock'
  const ids = [...new Set(items.map((i) => (i.id ?? '').trim()).filter(Boolean))]
  const slugs = [...new Set(items.map((i) => (i.slug ?? '').trim()).filter(Boolean))]
  const byId = new Map<string, ApplyRow>()
  const bySlug = new Map<string, ApplyRow>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await client.from('catalog_categories').select(COLS).in('id', ids.slice(i, i + 300))
    for (const c of (data ?? []) as ApplyRow[]) byId.set(c.id, c)
  }
  for (let i = 0; i < slugs.length; i += 300) {
    const { data } = await client.from('catalog_categories').select(COLS).in('slug', slugs.slice(i, i + 300))
    for (const c of (data ?? []) as ApplyRow[]) if (c.slug) bySlug.set(up(c.slug), c)
  }

  const now = new Date().toISOString()

  for (const item of items) {
    const key = (item.id ?? item.slug ?? '(?)').toString()
    const cat = (item.id && byId.get(item.id.trim())) || (item.slug && bySlug.get(up(item.slug))) || null

    if (!cat) {
      result.skipped++
      result.results.push({ key, status: 'skipped', fields: [], reasons: ['категорію не знайдено (id/slug)'] })
      continue
    }

    if (cat.seo_manual_lock || cat.seo_status === 'sheet' || cat.seo_status === 'manual') {
      result.skipped++
      result.results.push({ key, status: 'skipped', fields: [], reasons: [`захищене SEO (${cat.seo_manual_lock ? 'lock' : cat.seo_status})`] })
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

    const { error } = await client
      .from('catalog_categories')
      .update(payload)
      .eq('id', cat.id)
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
