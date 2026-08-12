// ─── Storefront publish quality guard ────────────────────────────────────────
// The ONE boundary that decides whether a catalog row becomes publicly visible
// is draft → published (publishAllCatalogProducts / publishDraftProducts /
// publishBatch). Two supplier rows with unusable names — "<>" (SKU SD-5220) and
// "F0000000024" (SKU --10) — reached that boundary and became public products
// with indexable pages and sitemap entries, and had to be archived by hand.
//
// This guard closes that hole WITHOUT inventing a new heuristic: it reuses the
// exact predicate the public storefront already applies when listing products
// (isPublicListableProduct → bestProductName). That is deliberately the most
// conservative rule available:
//
//   • A row this guard blocks is a row the catalog/search/suggest lists ALREADY
//     refuse to render — publishing it can only produce a dead, indexable page,
//     never a sale. So the guard cannot hide a product that would otherwise have
//     been sellable.
//   • It is name-only. Price, image, category, stock and SEO are never consulted
//     — a legitimate product with a model-number name, dimensions, voltage, an
//     engine code or an embedded SKU passes untouched.
//   • source='manual' rows are NEVER blocked. Manual products are human-curated
//     Dacha TV content with their own ownership/lock semantics; this guard exists
//     for unattended supplier data only.
//
// Blocked rows stay `draft` (never archived, never deleted, never modified), so
// an admin can fix the name and publish normally. Rows that are already
// `archived` are untouched by every publish path — those queries only ever
// select status='draft'.

import { isPublicListableProduct, type NameBearingProduct } from '@/lib/supabase/catalog'

// The minimum shape a publish path must load for a row to be checked.
export type PublishCandidate = NameBearingProduct & {
  id: string
  source?: string | null
}

export type PublishBlockReason = 'unusable_name'

// Manual rows are exempt by design (see header).
export function isManualRow(row: { source?: string | null }): boolean {
  return (row.source ?? null) === 'manual'
}

// Returns the reason this row must not become public, or null when it may be
// published. Pure — no DB access — so the publish gate is unit-testable.
export function publishBlockReason(row: PublishCandidate): PublishBlockReason | null {
  if (isManualRow(row)) return null
  return isPublicListableProduct(row) ? null : 'unusable_name'
}

export function canPublishToStorefront(row: PublishCandidate): boolean {
  return publishBlockReason(row) === null
}

export interface PublishPartition<T extends PublishCandidate> {
  publishable: T[]
  blocked: T[]
  blockedSamples: Array<{ sku: string; name: string; reason: PublishBlockReason }>
}

// Split publish candidates into rows that may go public and rows that must stay
// draft, keeping a small sample of the blocked rows for the operator report.
export function partitionPublishCandidates<T extends PublishCandidate>(rows: T[]): PublishPartition<T> {
  const publishable: T[] = []
  const blocked: T[] = []
  const blockedSamples: PublishPartition<T>['blockedSamples'] = []
  for (const row of rows) {
    const reason = publishBlockReason(row)
    if (reason === null) { publishable.push(row); continue }
    blocked.push(row)
    if (blockedSamples.length < 10) {
      blockedSamples.push({
        sku: String(row.supplier_sku ?? ''),
        name: String(row.name_ua ?? row.name ?? ''),
        reason,
      })
    }
  }
  return { publishable, blocked, blockedSamples }
}

// Columns every publish path must select for the guard to work.
export const PUBLISH_GUARD_COLS = 'id, source, supplier_sku, name_ua, name'
