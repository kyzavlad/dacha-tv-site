// ─── What actually counts as an SEO backlog item ─────────────────────────────
// "UA coverage < 100%" is not the same as "there is work to do". After the bulk
// catalog + RU SEO programme the only rows still missing a Ukrainian field are:
//
//   • supplier rows the AI pipeline can genuinely still fill      → ACTIONABLE
//   • manual Dacha TV products whose canonical copy lives in their own fields
//     and that are intentionally published without a long description_ua,
//     or that a human deliberately locked                          → EXCEPTION
//   • rows whose name is unusable on the public storefront: they must not be
//     publicly indexed at all, so writing SEO for them is the wrong fix
//                                                                  → MALFORMED
//
// Counting exceptions and malformed rows as "missing SEO" produces a dashboard
// that can never reach 0 and pressures whoever reads it into generating filler
// text. This module is the single, testable definition used by the diagnostic
// endpoint and the growth-readiness audit so both report the same number.

import { isPublicListableProduct, type NameBearingProduct } from '@/lib/supabase/catalog'

export type UaSeoClass =
  | 'complete'
  | 'actionable_supplier'
  | 'manual_exception'
  | 'manual_locked'
  | 'malformed'

export type UaSeoRow = NameBearingProduct & {
  meta_title?: string | null
  meta_description?: string | null
  description_ua?: string | null
  seo_status?: string | null
  seo_manual_lock?: boolean | null
  source?: string | null
}

const blank = (v: unknown) => typeof v !== 'string' || v.trim() === ''

// Human-authored SEO states the AI pipeline must never overwrite.
export const HUMAN_SEO_STATUSES = new Set(['manual', 'sheet'])

// The Ukrainian fields a published product needs for full coverage.
export function missingUaFields(row: UaSeoRow): string[] {
  const missing: string[] = []
  if (blank(row.meta_title)) missing.push('meta_title')
  if (blank(row.meta_description)) missing.push('meta_description')
  if (blank(row.description_ua)) missing.push('description_ua')
  return missing
}

export function classifyUaSeoRow(row: UaSeoRow): UaSeoClass {
  const missing = missingUaFields(row)
  if (missing.length === 0) return 'complete'
  // Order matters: a malformed row is never "SEO work", whoever owns it.
  if (!isPublicListableProduct(row)) return 'malformed'
  if (row.seo_manual_lock === true) return 'manual_locked'
  if ((row.source ?? null) === 'manual') return 'manual_exception'
  if (HUMAN_SEO_STATUSES.has((row.seo_status ?? '').trim())) return 'manual_exception'
  return 'actionable_supplier'
}

export interface UaBacklogSummary {
  total: number
  complete: number
  actionable_supplier: number
  manual_exception: number
  manual_locked: number
  malformed: number
  /** The only number that represents real remaining work. */
  actionable: number
}

export function summarizeUaBacklog(rows: UaSeoRow[]): UaBacklogSummary {
  const s: UaBacklogSummary = {
    total: rows.length, complete: 0, actionable_supplier: 0,
    manual_exception: 0, manual_locked: 0, malformed: 0, actionable: 0,
  }
  for (const row of rows) s[classifyUaSeoRow(row)]++
  s.actionable = s.actionable_supplier
  return s
}

// Columns a caller must select for classification to be correct.
export const UA_BACKLOG_COLS =
  'id, source, supplier_sku, name_ua, name, meta_title, meta_description, description_ua, seo_status, seo_manual_lock'
