import { getAdminClient } from '@/lib/supabase/admin'

// ─── Deterministic, in-app SEO template generator ─────────────────────────────
// Writes a guaranteed Ukrainian baseline for meta_title + meta_description from
// data already in the catalog (name, category, price) plus an optional supplier
// short description. NO external dependency — unlike the n8n/AI path
// (lib/catalog/seo-generate.ts), this always runs and never no-ops on a missing
// webhook. Template rows are tagged seo_source='template' / seo_status='template'
// and stay eligible for the n8n batch, so AI can later UPGRADE them with richer
// copy. Manual-locked rows and rows already carrying ai/manual SEO are never
// touched, and a non-empty meta field is never overwritten.
//
// Everything here is defensive: it only fills genuinely empty fields and writes
// ONLY meta_title, meta_description, seo_source, seo_status, seo_generated_at.

const BRAND = 'Дача TV'
const TITLE_MAX = 60
const DESC_MIN = 140
const DESC_MAX = 160

// Neutral, factual clauses appended to short descriptions to reach the target
// length. None make superlative, medical, or guarantee claims ("no fake claims").
// Mixed lengths (18–43 chars) so the greedy fill can always top up the final
// gap and land inside the 140–160 window without trailing off mid-sentence.
const FILLER_CLAUSES = [
  'Доставка по всій Україні.',
  'Телефонуйте для консультації та замовлення.',
  'Швидке оформлення замовлення.',
  'Зручні способи оплати.',
  'Оплата при отриманні.',
  'Замовляйте онлайн.',
  'Широкий вибір у каталозі.',
  'Уточнюйте наявність у менеджера.',
  'Доставка Новою Поштою.',
  'Відправляємо по всій Україні.',
]

// Collapse whitespace, strip any HTML, and trim. Supplier descriptions can carry
// markup — we never want tags leaking into a meta field.
function clean(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Returns true when the string contains Ukrainian-specific letters (і, ї, є, ґ).
// Used to reject Russian lead text from supplier sheets before it reaches meta copy.
function isLikelyUkrainian(s: string): boolean {
  return /[іїєґІЇЄҐ]/.test(s)
}

// Strip trailing whitespace + dangling punctuation / opening brackets so a title
// never ends on a comma, dash, slash, colon, semicolon, period, or an opening
// bracket. A closing ')' is intentionally KEPT — a balanced parenthetical is a
// legitimate, clean ending.
function stripTrailingJunk(s: string): string {
  return s.replace(/[\s,;:.\-–—\/\\|«»"'(\[{]+$/, '').trim()
}

// Remove any unfinished "(…" parenthetical. When a trim cuts off the closing
// ')', the dangling open bracket (and everything after the last unmatched '(')
// is dropped so the title never carries an unclosed parenthesis. Handles names
// with several parentheses by repeatedly closing the imbalance from the right.
function dropUnclosedParen(s: string): string {
  let out = s
  let guard = 0
  while (
    (out.match(/\(/g)?.length ?? 0) > (out.match(/\)/g)?.length ?? 0) &&
    guard++ < 50
  ) {
    const idx = out.lastIndexOf('(')
    if (idx === -1) break
    out = out.slice(0, idx)
  }
  return out
}

// Clean a title fragment: drop a dangling unclosed parenthetical, then strip any
// trailing junk. Used both for the full (untrimmed) name and the trimmed result.
function sanitizeTitlePart(s: string): string {
  return stripTrailingJunk(dropUnclosedParen(s))
}

// Trim to maxLen on a word boundary (never mid-word). If the cut lands inside a
// parenthetical, the whole unfinished "(…" part is removed (never a stray '('),
// and the result never ends on trailing punctuation or an opening bracket.
export function trimToWord(s: string, maxLen: number): string {
  const c = clean(s)
  if (c.length <= maxLen) return sanitizeTitlePart(c)
  const slice = c.slice(0, maxLen)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice
  return sanitizeTitlePart(cut)
}

// Returns the cleaned name if it looks like a real human-readable label, or
// null if it looks like an auto-generated technical slug (e.g. 'cat-38853',
// 'cat-185', purely numeric IDs). This prevents raw slugs from leaking into
// published meta copy.
function resolveHumanCatName(raw: string | null | undefined): string | null {
  const s = clean(raw)
  if (!s) return null
  // Auto-generated numeric patterns: cat-NNN, cat_NNN, catNNN, or bare integers
  if (/^cat[-_]?\d+$/i.test(s)) return null
  if (/^\d+$/.test(s)) return null
  // Very short all-ASCII tokens without any Cyrillic letters are likely slug IDs
  if (s.length <= 6 && !/[а-яіїєґА-ЯІЇЄҐ]/.test(s)) return null
  return s
}

// meta_title: "{name} — {category} | Дача TV", trimmed to ~60 chars. Drops the
// category, then trims the name, to keep the brand suffix intact.
export function buildMetaTitle(name: string, category: string | null): string {
  // Sanitize the full name/category up front so a source-level unclosed
  // parenthesis or trailing punctuation can never leak into the untrimmed paths.
  let n = sanitizeTitlePart(clean(name))
  // Pathological: the whole name was an unclosed parenthetical (sanitize emptied
  // it). Recover a real label by stripping brackets rather than emitting a title
  // that is just the brand with a leading space.
  if (!n) n = clean(name).replace(/[()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim()
  const cat = sanitizeTitlePart(clean(category))
  const suffix = ` | ${BRAND}`

  if (cat) {
    const full = `${n} — ${cat}${suffix}`
    if (full.length <= TITLE_MAX) return full
  }
  const nameBrand = `${n}${suffix}`
  if (nameBrand.length <= TITLE_MAX) return nameBrand

  const room = Math.max(12, TITLE_MAX - suffix.length)
  let head = trimToWord(n, room)
  if (!head) {
    // Pathological: the name was essentially one unclosed parenthetical. Fall
    // back to a bracket-stripped truncation so we still emit a real title.
    head = stripTrailingJunk(clean(name).replace(/[()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, room))
  }
  return `${head}${suffix}`
}

// meta_description: 140–160 chars, natural Ukrainian. Prefers a clean supplier
// short description as the opener; otherwise composes from name/category/price.
// Pads with neutral clauses (greedy best-fit) to land inside the window.
//
// category        — human-readable Ukrainian name (used with «» quotes)
// categoryPhrase  — pre-composed phrase like 'у каталозі Дача TV' used when
//                   the human category name is unknown (no «» quotes)
export function buildMetaDescription(opts: {
  name: string
  category: string | null
  categoryPhrase?: string | null
  price: string | null   // pre-formatted, e.g. "1 200 грн" or "від 100 грн/м²"
  lead?: string | null    // optional supplier short description
}): string {
  const n = clean(opts.name)
  const cat = clean(opts.category)
  const lead = clean(opts.lead)

  let base: string
  if (lead && lead.length >= 40 && isLikelyUkrainian(lead)) {
    base = trimToWord(lead, DESC_MAX).replace(/[.!?]+$/, '') + '.'
  } else {
    let opener: string
    if (cat) {
      opener = `${n} у категорії «${cat}».`
    } else if (opts.categoryPhrase) {
      opener = `${n} ${opts.categoryPhrase}.`
    } else {
      opener = `${n}.`
    }
    const parts = [opener]
    if (opts.price) parts.push(`Ціна ${opts.price}.`)
    base = parts.join(' ')
  }

  let desc = clean(base)
  const pool = [...FILLER_CLAUSES]
  while (desc.length < DESC_MIN) {
    // Pick the LONGEST remaining clause that still keeps us within DESC_MAX, so
    // we never trail off mid-sentence and land as close to 160 as possible.
    let bestIdx = -1
    let bestLen = -1
    for (let i = 0; i < pool.length; i++) {
      const candidate = `${desc} ${pool[i]}`
      if (candidate.length <= DESC_MAX && pool[i].length > bestLen) {
        bestIdx = i
        bestLen = pool[i].length
      }
    }
    if (bestIdx === -1) break // nothing else fits
    desc = `${desc} ${pool[bestIdx]}`.trim()
    pool.splice(bestIdx, 1)
  }

  if (desc.length > DESC_MAX) desc = trimToWord(desc, DESC_MAX)
  return desc
}

// Format a UAH price the same way the storefront does, honouring prefix + unit.
function formatPrice(row: {
  price_uah: number | null
  price_prefix: string | null
  unit_label: string | null
}): string | null {
  if (row.price_uah == null || !(row.price_uah > 0)) return null
  const amount = row.price_uah.toLocaleString('uk-UA')
  const unit = row.unit_label && row.unit_label.trim() ? row.unit_label.trim() : 'грн'
  const prefix = row.price_prefix && row.price_prefix.trim() ? `${row.price_prefix.trim()} ` : ''
  return `${prefix}${amount} ${unit}`
}

export interface TemplateSeoSample {
  sku: string | null
  meta_title?: string
  meta_description?: string
  title_len?: number
  desc_len?: number
}

export interface TemplateSeoResult {
  ok: boolean
  apply: boolean
  scanned: number     // rows examined
  eligible: number    // rows that need (and would get) a template field
  updated: number     // rows actually written (0 on dry run)
  errors: number
  samples: TemplateSeoSample[]
  message: string
}

interface CandidateRow {
  id: string
  supplier_sku: string | null
  name_ua: string | null
  category_slug: string | null
  price_uah: number | null
  price_prefix: string | null
  unit_label: string | null
  meta_title: string | null
  meta_description: string | null
  seo_status: string | null
}

// Generate template SEO for published catalog products that still lack meta copy.
// apply=false (default) is a pure dry run: it computes and samples nothing-written.
export async function generateProductSeoTemplate(opts?: {
  apply?: boolean
  limit?: number
}): Promise<TemplateSeoResult> {
  const apply = opts?.apply === true
  const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 5000)
  const client = getAdminClient()

  // Candidates: published, not manual-locked, not already AI/manual SEO, AND
  // missing at least one meta field. The `.or(... is.null)` is the key to making
  // repeated runs PROGRESS: without it the query returned rows that already had
  // both meta fields filled (just because their seo_generated_at sorted first),
  // the JS guard then dropped them all, and the limit window produced eligible=0
  // forever. By excluding fully-filled rows at the DB level, every limited window
  // is populated with rows that genuinely need work, so successive calls advance
  // through the backlog. The JS non-empty guard below still protects against the
  // rare empty-string (non-null) case and never overwrites a filled field.
  // Oldest-generated first → runs rotate.
  const { data, error } = await client
    .from('catalog_products')
    .select('id, supplier_sku, name_ua, category_slug, price_uah, price_prefix, unit_label, meta_title, meta_description, seo_status')
    .eq('status', 'published')
    .neq('seo_manual_lock', true)
    .neq('seo_status', 'ai')
    .neq('seo_status', 'manual')
    .not('name_ua', 'is', null)
    .or('meta_title.is.null,meta_description.is.null')
    .order('seo_generated_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (error) {
    return { ok: false, apply, scanned: 0, eligible: 0, updated: 0, errors: 1, samples: [], message: `products: ${error.message}` }
  }

  const rows = (data ?? []) as CandidateRow[]
  if (rows.length === 0) {
    return { ok: true, apply, scanned: 0, eligible: 0, updated: 0, errors: 0, samples: [], message: 'Немає опублікованих товарів без SEO.' }
  }

  // Resolve category slug → human display name for titles/descriptions.
  // Prefer name_ua → name → nothing. Reject names that are slug-like
  // (e.g. 'cat-38853', 'cat-185') — they're auto-generated IDs, not
  // human-readable Ukrainian labels.
  const slugs = [...new Set(rows.map((r) => r.category_slug).filter(Boolean))] as string[]
  const catName = new Map<string, string>()
  for (let i = 0; i < slugs.length; i += 300) {
    const { data: cats } = await client
      .from('catalog_categories')
      .select('slug, name_ua, name')
      .in('slug', slugs.slice(i, i + 300))
    for (const c of cats ?? []) {
      if (!c.slug) continue
      const label =
        resolveHumanCatName(c.name_ua as string | null) ??
        resolveHumanCatName(c.name as string | null)
      if (label) catName.set(c.slug as string, label)
    }
  }

  // Optional supplier lead text (UA short description) keyed by SKU. We use only
  // the UA short field — least likely to carry raw HTML — and clean it anyway.
  const skus = [...new Set(rows.map((r) => r.supplier_sku).filter(Boolean))] as string[]
  const supplierLead = new Map<string, string>()
  for (let i = 0; i < skus.length; i += 300) {
    const { data: sp } = await client
      .from('supplier_products')
      .select('supplier_sku, short_description_ua')
      .in('supplier_sku', skus.slice(i, i + 300))
    for (const s of sp ?? []) {
      const lead = clean(s.short_description_ua as string | null)
      if (s.supplier_sku && lead) supplierLead.set(s.supplier_sku as string, lead)
    }
  }

  const updates: { id: string; meta_title?: string; meta_description?: string }[] = []
  const samples: TemplateSeoSample[] = []

  for (const r of rows) {
    const name = clean(r.name_ua)
    if (!name) continue

    // Human category name — null when the slug had no matching human label
    // (e.g. auto-generated slugs like cat-38853). In that case we fall back
    // to a natural Ukrainian phrase so nothing slug-like ever leaks into copy.
    const category = r.category_slug ? catName.get(r.category_slug) ?? null : null
    const categoryPhrase = !category && r.category_slug
      ? 'у каталозі Дача TV'
      : null

    const needTitle = !clean(r.meta_title)
    const needDesc = !clean(r.meta_description)
    if (!needTitle && !needDesc) continue

    const upd: { id: string; meta_title?: string; meta_description?: string } = { id: r.id }
    if (needTitle) upd.meta_title = buildMetaTitle(name, category)
    if (needDesc) {
      upd.meta_description = buildMetaDescription({
        name,
        category,
        categoryPhrase,
        price: formatPrice(r),
        lead: r.supplier_sku ? supplierLead.get(r.supplier_sku) ?? null : null,
      })
    }
    updates.push(upd)

    // 15 samples so the dry-run shows enough variety to confirm no cat- leaks
    if (samples.length < 15) {
      samples.push({
        sku: r.supplier_sku,
        meta_title: upd.meta_title,
        meta_description: upd.meta_description,
        title_len: upd.meta_title?.length,
        desc_len: upd.meta_description?.length,
      })
    }
  }

  const eligible = updates.length

  if (!apply) {
    return {
      ok: true,
      apply,
      scanned: rows.length,
      eligible,
      updated: 0,
      errors: 0,
      samples,
      message: `Dry-run: ${eligible} з ${rows.length} товарів отримали б базове SEO. Запустіть з apply, щоб записати.`,
    }
  }

  // Apply: per-row update writing ONLY the empty meta field(s) + provenance.
  // Guarded with the same not-locked / not-ai-or-manual predicate so a row that
  // changed between SELECT and UPDATE is never clobbered.
  let updated = 0
  let errors = 0
  const now = new Date().toISOString()
  for (const u of updates) {
    const payload: Record<string, unknown> = {
      seo_source: 'template',
      seo_status: 'template',
      seo_generated_at: now,
      updated_at: now,
    }
    if (u.meta_title) payload.meta_title = u.meta_title
    if (u.meta_description) payload.meta_description = u.meta_description

    const { error: e } = await client
      .from('catalog_products')
      .update(payload)
      .eq('id', u.id)
      .neq('seo_manual_lock', true)
      .neq('seo_status', 'ai')
      .neq('seo_status', 'manual')
    if (e) errors++
    else updated++
  }

  return {
    ok: errors === 0,
    apply,
    scanned: rows.length,
    eligible,
    updated,
    errors,
    samples,
    message: `Записано базове SEO для ${updated.toLocaleString('uk-UA')} товарів${errors ? `, помилок: ${errors}` : ''}. Залишаються в черзі n8n для AI-покращення.`,
  }
}
