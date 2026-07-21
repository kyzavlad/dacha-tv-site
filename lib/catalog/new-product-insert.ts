// ─── New (not-yet-in-catalog) supplier product insertion ──────────────────────
// Genuinely new supplier products still go through the JS insert path — that
// was never the timeout risk (see existing-product-refresh.ts for the part
// that was). This module holds the pure, DB-free pieces of that path (row
// construction, batch-result combination) so they're unit-testable without a
// live Postgres instance; lib/catalog/pipeline.ts wires them to the DB calls.

import { autoSlug } from '@/lib/catalog/csv-utils'
import { normalizeStock } from '@/lib/catalog/stock'
import type { RefreshExistingResult } from '@/lib/catalog/existing-product-refresh'

export interface NewProductCandidate {
  id: string
  supplier_sku: string
  name: unknown
  name_ua: unknown
  supplier_category_id: unknown
  price_uah: unknown
  supplier_price_usd: unknown
  main_image_url: unknown
  images: unknown
  stock_quantity: unknown
  is_in_stock: unknown
}

// Builds the catalog_products insert row for one genuinely-new supplier
// product, resolving a collision-safe slug (name → name+sku → sku → sku-N) and
// mutating `usedSlugs` to reserve it. New rows always land as status='draft'
// (never published directly by the import) — publishing is a separate,
// deliberate step (publishAllCatalogProducts / publishBatch).
export function buildNewProductRow(
  sp: NewProductCandidate,
  categorySlug: string | null,
  usedSlugs: Set<string>,
  nowIso: string,
): Record<string, unknown> {
  const sku = sp.supplier_sku
  const name = (sp.name_ua || sp.name || '') as string

  const candidateA = autoSlug(name)
  const candidateB = autoSlug(`${name} ${sku}`)
  const candidateC = autoSlug(sku) || sku.toLowerCase().replace(/[^a-z0-9]/g, '-')
  let slug = !usedSlugs.has(candidateA) ? candidateA
    : !usedSlugs.has(candidateB) ? candidateB
    : candidateC
  if (usedSlugs.has(slug)) {
    for (let n = 2; n <= 999; n++) {
      const candidate = `${candidateC}-${n}`
      if (!usedSlugs.has(candidate)) { slug = candidate; break }
    }
  }
  usedSlugs.add(slug)

  const priceUah = sp.price_uah as number
  const isPriceSuspicious = priceUah < 100 && priceUah >= 10 && (sp.supplier_price_usd == null)
  const stock = normalizeStock(sp.stock_quantity, sp.is_in_stock)

  return {
    supplier_product_id: sp.id,
    supplier_sku: sku,
    name_ua: name,
    slug,
    category_slug: categorySlug,
    price_uah: priceUah,
    is_price_suspicious: isPriceSuspicious,
    main_image_url: sp.main_image_url as string | null,
    images: sp.images ?? null,
    stock_quantity: stock.stock_quantity,
    is_in_stock: stock.is_in_stock,
    stock_synced_at: nowIso,
    status: 'draft',
    is_featured: false,
    display_order: 0,
  }
}

export interface NewInsertBatchResult {
  processed: number
  inserted: number
  approved: number
  insertsSkippedCap: number
  duplicateSlugFixed: number
  errors: string[]
}

export interface CombinedBatchResult {
  ok: boolean
  processed: number
  inserted: number
  updated: number
  approved: number
  failed: number
  insertsSkippedCap: number
  duplicateSlugFixed: number
  remainingExisting: number
  remainingNew: number
  remainingTotal: number
  errorGroups: Record<string, number>
  errorSamples: string[]
  message: string
}

// Merges the set-based existing-row refresh result with the new-row insert
// result into one truthful accounting. Pure (no DB access) so the arithmetic —
// including the "remaining" bookkeeping — is unit-testable on its own.
export function combineExistingAndNewBatchResults(
  refresh: RefreshExistingResult,
  insert: NewInsertBatchResult,
): CombinedBatchResult {
  const errorGroups: Record<string, number> = {}
  for (const e of insert.errors) errorGroups[e] = (errorGroups[e] ?? 0) + 1

  const processed = refresh.processed + insert.processed
  const updated = refresh.updated
  const approved = refresh.approved + insert.approved
  const failed = insert.errors.length
  const remainingExisting = refresh.remainingExisting
  // refresh.remainingNew was measured BEFORE the new-row insert step ran —
  // subtract what that step just consumed so the reported backlog reflects
  // the true post-batch state without an extra DB round-trip.
  const remainingNew = Math.max(0, refresh.remainingNew - insert.approved)
  const remainingTotal = remainingExisting + remainingNew

  const ok = failed === 0
  const message = ok
    ? `Існуючі: оброблено ${refresh.processed}, оновлено ${refresh.updated}. Нові: додано ${insert.inserted}${insert.insertsSkippedCap > 0 ? `, відкладено (ліміт) ${insert.insertsSkippedCap}` : ''}. Підтверджено всього ${approved}, залишок ${remainingTotal}`
    : `${failed} DB помилок: ${insert.errors[0]}`

  return {
    ok, processed, inserted: insert.inserted, updated, approved, failed,
    insertsSkippedCap: insert.insertsSkippedCap, duplicateSlugFixed: insert.duplicateSlugFixed,
    remainingExisting, remainingNew, remainingTotal,
    errorGroups, errorSamples: insert.errors.slice(0, 5),
    message,
  }
}
