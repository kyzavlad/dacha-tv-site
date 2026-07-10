// ─── Unified SEO batch reporting (UA + RU, one format) ────────────────────────
// A single, locale-agnostic notification builder so the Telegram messages for
// Ukrainian and Russian product SEO look IDENTICAL (only the Locale line and the
// coverage numbers differ). n8n POSTs its run totals to
// /api/admin/seo/batch-report and sends back the rendered `notification` string,
// so the format lives in ONE place instead of being hand-assembled per workflow.

import { getAdminClient } from '@/lib/supabase/admin'
import { collapse } from './seo-validate'

// ── Apply-result summary ──────────────────────────────────────────────────────
export interface ApplyLikeResult {
  received: number
  updated: number
  skipped: number
  invalid: number
  errors: number
  errorGroups?: Record<string, number>
}

export interface ApplySummary {
  processed: number
  applied: number
  skipped: number
  failed: number
  topReasons: string[]
  // Present when applied < processed — explains where the shortfall went.
  throughputNote: string | null
}

// Collapse an apply result into the notification's Processed/Applied/Skipped/
// Failed counters plus a human explanation of any shortfall + top error reasons.
export function summarizeApply(r: ApplyLikeResult): ApplySummary {
  const processed = r.received
  const applied = r.updated
  const skipped = r.skipped
  const failed = r.invalid + r.errors
  const topReasons = Object.entries(r.errorGroups ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, n]) => `${reason} (${n})`)

  let throughputNote: string | null = null
  if (applied < processed) {
    const parts: string[] = []
    if (r.invalid) parts.push(`${r.invalid} invalid (не прошли валидацию)`)
    if (r.skipped) parts.push(`${r.skipped} skipped (не найдены / заблокированы)`)
    if (r.errors) parts.push(`${r.errors} DB errors`)
    throughputNote = parts.length
      ? `Applied (${applied}) < processed (${processed}): ${parts.join(', ')}.`
      : null
  }
  return { processed, applied, skipped, failed, topReasons, throughputNote }
}

// ── Coverage ──────────────────────────────────────────────────────────────────
export interface ProductCoverage {
  total: number
  metaTitle: number
  metaDescription: number
  longDescription: number
  complete: number
  backlog: number
}

type CountMode = 'exact' | 'planned'

// Resilient count. An EXACT count on the ~105k catalog_products table can exceed
// the statement/gateway timeout and come back as `count: null` — the old helper
// turned that into a silent 0, which is exactly why the report showed total=0
// (and all uk fields=0) while the small translations table still counted fine.
// We now try exact first, fall back to the planner estimate (fast, never scans),
// and only return 0 when BOTH are unavailable — logging so it is diagnosable.
async function countResilient(
  make: (mode: CountMode) => PromiseLike<{ count: number | null; error: unknown }>,
  label: string,
): Promise<number> {
  try {
    const { count, error } = await make('exact')
    if (!error && count != null) return count
  } catch { /* fall through to estimate */ }
  try {
    const { count } = await make('planned')
    if (count != null) return count
  } catch { /* fall through */ }
  console.warn(`[seo-batch-report] count unavailable for ${label} (exact + planned both failed)`)
  return 0
}

// Defensive assembly: `total` can never be lower than any populated-field count
// or the complete count (a field cannot be present on more rows than exist). If
// the exact total failed while field counts have data, floor total to that max
// so the endpoint never returns impossible data like total=0 with metaTitle>0.
function assembleCoverage(
  c: { total: number; metaTitle: number; metaDescription: number; longDescription: number; complete: number },
  locale: string,
): ProductCoverage {
  const floor = Math.max(c.metaTitle, c.metaDescription, c.longDescription, c.complete)
  const total = Math.max(c.total, floor)
  if (total !== c.total) {
    console.warn(`[seo-batch-report] ${locale} total floored ${c.total} → ${total} (field counts exceeded the reported total — exact total likely timed out)`)
  }
  return {
    total,
    metaTitle: c.metaTitle,
    metaDescription: c.metaDescription,
    longDescription: c.longDescription,
    complete: c.complete,
    backlog: Math.max(0, total - c.complete),
  }
}

// Current product SEO coverage for a locale.
//   uk → base columns on catalog_products (meta_title / meta_description /
//        description_ua).
//   ru → the RU row in catalog_product_translations.
// "complete" = all three text fields present, which is exactly what the AI
// backlog counts, so Backlog AI = total − complete. `total` is the published
// catalog_products count for BOTH locales, so uk and ru report a consistent base.
export async function productCoverage(locale: string): Promise<ProductCoverage> {
  const client = getAdminClient()
  const isUk = locale === 'uk' || locale === 'ua'
  // Published-product total — the same base for every locale.
  const pub = (mode: CountMode) => client.from('catalog_products').select('id', { count: mode, head: true }).eq('status', 'published')

  if (isUk) {
    const [total, metaTitle, metaDescription, longDescription, complete] = await Promise.all([
      countResilient(pub, 'uk.total'),
      countResilient((m) => pub(m).not('meta_title', 'is', null).neq('meta_title', ''), 'uk.metaTitle'),
      countResilient((m) => pub(m).not('meta_description', 'is', null).neq('meta_description', ''), 'uk.metaDescription'),
      countResilient((m) => pub(m).not('description_ua', 'is', null).neq('description_ua', ''), 'uk.longDescription'),
      countResilient((m) => pub(m)
        .not('meta_title', 'is', null).neq('meta_title', '')
        .not('meta_description', 'is', null).neq('meta_description', '')
        .not('description_ua', 'is', null).neq('description_ua', ''), 'uk.complete'),
    ])
    return assembleCoverage({ total, metaTitle, metaDescription, longDescription, complete }, 'uk')
  }

  const T = (mode: CountMode) => client.from('catalog_product_translations').select('id', { count: mode, head: true }).eq('locale', locale)
  const [total, metaTitle, metaDescription, longDescription, complete] = await Promise.all([
    countResilient(pub, `${locale}.total`),
    countResilient((m) => T(m).not('meta_title', 'is', null).neq('meta_title', ''), `${locale}.metaTitle`),
    countResilient((m) => T(m).not('meta_description', 'is', null).neq('meta_description', ''), `${locale}.metaDescription`),
    countResilient((m) => T(m).not('description', 'is', null).neq('description', ''), `${locale}.longDescription`),
    countResilient((m) => T(m)
      .not('meta_title', 'is', null).neq('meta_title', '')
      .not('meta_description', 'is', null).neq('meta_description', '')
      .not('description', 'is', null).neq('description', ''), `${locale}.complete`),
  ])
  return assembleCoverage({ total, metaTitle, metaDescription, longDescription, complete }, locale)
}

// ── Notification formatting ───────────────────────────────────────────────────
export interface NotificationInput {
  locale: string
  mode: string          // e.g. "APPLY" or "DRY-RUN"
  limit: number
  batchSize: number
  summary: ApplySummary
  before?: ProductCoverage | null
  after: ProductCoverage
  // Extra context notes (e.g. candidate diagnostics) appended to Notes.
  extraNotes?: string[]
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}

// "70.0% → 72.2%" (or "— → 72.2%" when there is no before snapshot).
function pctLine(beforePart: number | undefined, beforeTotal: number | undefined, afterPart: number, afterTotal: number): string {
  const after = `${pct(afterPart, afterTotal).toFixed(1)}%`
  if (beforePart == null || beforeTotal == null) return `— → ${after}`
  return `${pct(beforePart, beforeTotal).toFixed(1)}% → ${after}`
}

// Render the standardized Telegram message. Identical layout for every locale.
export function formatSeoBatchNotification(input: NotificationInput): string {
  const { locale, mode, limit, batchSize, summary, before, after } = input
  const ok = summary.failed === 0
  const lines: string[] = []

  lines.push(`${ok ? '✅' : '⚠️'} Dacha TV PRODUCT SEO batch completed`)
  lines.push('')
  lines.push(`Locale: ${locale}`)
  lines.push(`Mode: ${mode}`)
  lines.push(`Limit: ${limit}`)
  lines.push(`Batch size: ${batchSize}`)
  lines.push(`Processed: ${summary.processed}`)
  lines.push(`Applied: ${summary.applied}`)
  lines.push(`Skipped: ${summary.skipped}`)
  lines.push(`Failed: ${summary.failed}`)
  lines.push('')
  lines.push('Coverage before → after:')
  lines.push(`Meta title: ${pctLine(before?.metaTitle, before?.total, after.metaTitle, after.total)}`)
  lines.push(`Meta description: ${pctLine(before?.metaDescription, before?.total, after.metaDescription, after.total)}`)
  lines.push(`Long description: ${pctLine(before?.longDescription, before?.total, after.longDescription, after.total)}`)
  lines.push(`Complete: ${pctLine(before?.complete, before?.total, after.complete, after.total)}`)
  lines.push('')

  const backlogDelta = before ? after.backlog - before.backlog : null
  const deltaStr = backlogDelta == null ? '' : ` (${backlogDelta > 0 ? '+' : ''}${backlogDelta})`
  const backlogBefore = before ? `${before.backlog} → ` : ''
  lines.push(`Backlog AI: ${backlogBefore}${after.backlog}${deltaStr}`)

  // Notes: explain any shortfall + first 3 error reasons + extra context.
  const notes: string[] = []
  if (summary.throughputNote) notes.push(summary.throughputNote)
  if (summary.topReasons.length) notes.push(`Top reasons: ${summary.topReasons.join('; ')}`)
  for (const n of input.extraNotes ?? []) if (collapse(n)) notes.push(n)
  if (notes.length) {
    lines.push('')
    lines.push('Notes:')
    for (const n of notes) lines.push(`- ${n}`)
  }

  return lines.join('\n')
}
