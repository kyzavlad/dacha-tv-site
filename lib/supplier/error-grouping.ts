// ─── Supplier raw-sync error grouping (PURE, unit-testable) ───────────────────
// The raw feed sync accumulated a bare `errors` count with errorGroups=null, so
// the 1767 failures were undiagnosable. These pure helpers categorize each
// failure and build a truthful, bounded report (counts + safe sample SKUs + DB
// code/message + feed window offset) — never raw payloads or secrets.

export type SupplierErrorGroup =
  | 'missing_sku'
  | 'duplicate_sku_in_feed'
  | 'invalid_record'
  | 'invalid_price'
  | 'database_constraint'
  | 'upsert_failed'
  | 'unknown'

// A feed record that `buildSupplierRow` rejected: no usable SKU → missing_sku;
// otherwise the record itself is malformed → invalid_record.
export function classifyBuildFailure(rawSku: string): SupplierErrorGroup {
  return rawSku && rawSku.trim() ? 'invalid_record' : 'missing_sku'
}

// A record that BUILT fine (has a SKU) but carries no usable price. Such rows are
// written to supplier_products with a null price and then silently excluded from
// the catalog import (which requires price_uah > 0), so they are a real, report-
// able data-quality issue. Returns 'invalid_price' when the price is unusable.
export function classifyPriceIssue(priceUah: number | null | undefined): SupplierErrorGroup | null {
  const n = Number(priceUah)
  return priceUah == null || !Number.isFinite(n) || n <= 0 ? 'invalid_price' : null
}

// A failed upsert, classified by Postgres error code. 23xxx = constraint
// violation (unique/not-null/check/fk); any other code = generic upsert failure.
export function classifyUpsertError(err: { code?: string | null; message?: string | null } | null | undefined): SupplierErrorGroup {
  if (!err) return 'unknown'
  const code = String(err.code ?? '')
  if (/^23\d{3}$/.test(code)) return 'database_constraint'
  if (code) return 'upsert_failed'
  return /duplicate|constraint|violat|null value/i.test(err.message ?? '') ? 'database_constraint' : 'upsert_failed'
}

// Transient Postgres/PostgREST failures worth a bounded retry (never a constraint
// violation — those are deterministic). Serialization/deadlock (40001/40P01),
// connection (08xxx), insufficient resources (53xxx), cancellation (57014),
// and network-ish messages. Constraint violations (23xxx) are NEVER retryable.
export function isRetryableDbError(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false
  const code = String(err.code ?? '')
  if (/^23\d{3}$/.test(code)) return false
  if (/^(40001|40P01|57014)$/.test(code)) return true
  if (/^(08|53)\d{3}$/.test(code)) return true
  return /timeout|timed out|connection|ECONNRESET|ETIMEDOUT|fetch failed|network|temporarily/i.test(err.message ?? '')
}

export interface GroupDetail {
  count: number
  sampleSkus: string[]      // bounded (≤ SAMPLE_CAP), safe identifiers only
  code: string | null       // last DB code seen for this group
  message: string | null    // last DB message (truncated), no payloads
  firstOffset: number | null
}

// HARD errors = real database/write failures that mean a record was NOT persisted
// as intended. Everything else is a non-fatal DIAGNOSTIC issue (malformed/benign
// feed records that are safely skipped or written without a price). Only hard
// errors flag the cycle as completed_with_errors.
export const HARD_ERROR_GROUPS: ReadonlySet<SupplierErrorGroup> = new Set([
  'database_constraint', 'upsert_failed', 'unknown',
])
export function isHardError(group: SupplierErrorGroup): boolean {
  return HARD_ERROR_GROUPS.has(group)
}

export interface SupplierErrorReport {
  // total = hardErrors + diagnosticIssues (kept for backward compatibility).
  total: number
  // Real DB/write failures only (database_constraint / upsert_failed / unknown).
  hardErrors: number
  // Non-fatal data-quality issues (missing_sku / duplicate_sku_in_feed /
  // invalid_record / invalid_price) — records skipped or written without a price.
  diagnosticIssues: number
  // True only when hardErrors > 0 — a benign diagnostic issue never flags this.
  completedWithErrors: boolean
  groups: Record<string, number>
  details: Record<string, GroupDetail>
}

export const SAMPLE_CAP = 10

export function emptyErrorReport(): SupplierErrorReport {
  return { total: 0, hardErrors: 0, diagnosticIssues: 0, completedWithErrors: false, groups: {}, details: {} }
}

// Record `count` occurrences of `group`. Mutates + returns the report so callers
// can accumulate across feed windows. Samples/codes are bounded and sanitized.
export function recordError(
  report: SupplierErrorReport,
  group: SupplierErrorGroup,
  count: number,
  opts: { skus?: string[]; code?: string | null; message?: string | null; offset?: number | null } = {},
): SupplierErrorReport {
  if (count <= 0) return report
  report.total += count
  if (isHardError(group)) report.hardErrors += count
  else report.diagnosticIssues += count
  report.completedWithErrors = report.hardErrors > 0
  report.groups[group] = (report.groups[group] ?? 0) + count
  const d = report.details[group] ?? { count: 0, sampleSkus: [], code: null, message: null, firstOffset: null }
  d.count += count
  for (const sku of opts.skus ?? []) {
    if (sku && d.sampleSkus.length < SAMPLE_CAP && !d.sampleSkus.includes(sku)) d.sampleSkus.push(sku)
  }
  if (opts.code != null) d.code = String(opts.code)
  if (opts.message != null) d.message = String(opts.message).slice(0, 200)
  if (d.firstOffset == null && opts.offset != null) d.firstOffset = opts.offset
  report.details[group] = d
  return report
}

// Merge a window-level report into a running total.
export function mergeErrorReport(total: SupplierErrorReport, window: SupplierErrorReport): SupplierErrorReport {
  for (const [group, count] of Object.entries(window.groups)) {
    const d = window.details[group]
    recordError(total, group as SupplierErrorGroup, count, { skus: d?.sampleSkus, code: d?.code, message: d?.message, offset: d?.firstOffset })
  }
  return total
}
