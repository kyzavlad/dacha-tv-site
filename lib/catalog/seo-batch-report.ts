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

async function count(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try { const { count } = await build(); return count ?? 0 } catch { return 0 }
}

// Current product SEO coverage for a locale.
//   uk → base columns on catalog_products (meta_title / meta_description /
//        description_ua).
//   ru → the RU row in catalog_product_translations.
// "complete" = all three text fields present, which is exactly what the AI
// backlog counts, so Backlog AI = total − complete.
export async function productCoverage(locale: string): Promise<ProductCoverage> {
  const client = getAdminClient()
  const isUk = locale === 'uk' || locale === 'ua'

  if (isUk) {
    const P = () => client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published')
    const [total, metaTitle, metaDescription, longDescription] = await Promise.all([
      count(P),
      count(() => P().not('meta_title', 'is', null).neq('meta_title', '')),
      count(() => P().not('meta_description', 'is', null).neq('meta_description', '')),
      count(() => P().not('description_ua', 'is', null).neq('description_ua', '')),
    ])
    const complete = await count(() =>
      P().not('meta_title', 'is', null).neq('meta_title', '')
        .not('meta_description', 'is', null).neq('meta_description', '')
        .not('description_ua', 'is', null).neq('description_ua', ''))
    return { total, metaTitle, metaDescription, longDescription, complete, backlog: Math.max(0, total - complete) }
  }

  const P = () => client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published')
  const T = () => client.from('catalog_product_translations').select('id', { count: 'exact', head: true }).eq('locale', locale)
  const [total, metaTitle, metaDescription, longDescription] = await Promise.all([
    count(P),
    count(() => T().not('meta_title', 'is', null).neq('meta_title', '')),
    count(() => T().not('meta_description', 'is', null).neq('meta_description', '')),
    count(() => T().not('description', 'is', null).neq('description', '')),
  ])
  const complete = await count(() =>
    T().not('meta_title', 'is', null).neq('meta_title', '')
      .not('meta_description', 'is', null).neq('meta_description', '')
      .not('description', 'is', null).neq('description', ''))
  return { total, metaTitle, metaDescription, longDescription, complete, backlog: Math.max(0, total - complete) }
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
