// ─── Supplier → catalog import planning (PURE, unit-testable) ─────────────────
// The daily import processes the unapproved supplier backlog. The old code (a)
// fetched with a single `.limit()` that PostgREST caps at 1000, and (b) reported
// `imported = inserted`, so an UPDATE-only batch (inserted=0) looked like "no
// work" and the n8n caller stopped even though thousands of existing rows were
// refreshed and re-approved. These pure helpers make the correct behavior
// explicit and testable without a database.

import type { ExistingCatalogOwnership } from '@/lib/catalog/field-ownership'

export type RowAction = 'update' | 'insert'

// An existing catalog row is an UPDATE (refresh supplier-owned facts); a new one
// is an INSERT (draft). Ownership presence = existence in catalog_products.
export function classifyRow(ownership: ExistingCatalogOwnership | undefined): RowAction {
  return ownership ? 'update' : 'insert'
}

export interface ImportBatchOutcome {
  processed: number   // supplier rows examined this batch
  inserted: number    // NEW catalog rows created
  updated: number     // existing rows whose facts were refreshed
  approved: number    // supplier rows marked is_approved=true this batch
  failed: number      // rows that errored (stay unapproved for retry)
  insertsSkippedCap: number // new rows not inserted because the published cap is reached
  remaining: number   // is_approved=false rows still in the backlog after this batch
}

// The n8n / cron caller loops import batches. It must CONTINUE while real
// progress is being made — NOT stop merely because `inserted === 0`. Progress =
// at least one row approved (existing-row refreshes count) AND backlog remains.
// When a batch approves nothing (only cap-blocked new rows or only failures are
// left), there is no more actionable work and the loop terminates.
export function shouldContinueImport(o: Pick<ImportBatchOutcome, 'approved' | 'remaining'>): boolean {
  return o.remaining > 0 && o.approved > 0
}

// Human summary that never conflates "inserted" with "did work".
export function summarizeImport(o: ImportBatchOutcome): string {
  const parts = [
    `оброблено ${o.processed}`,
    `додано ${o.inserted}`,
    `оновлено ${o.updated}`,
    `підтверджено ${o.approved}`,
  ]
  if (o.failed) parts.push(`помилок ${o.failed}`)
  if (o.insertsSkippedCap) parts.push(`нових відкладено (ліміт) ${o.insertsSkippedCap}`)
  parts.push(`залишок ${o.remaining}`)
  return parts.join(', ')
}
