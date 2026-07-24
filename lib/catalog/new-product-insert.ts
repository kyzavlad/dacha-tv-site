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
  // false on any hard prerequisite-read error (supplier candidate scan,
  // category lookup, existing-SKU lookup, slug read) or supplier-approval
  // UPDATE error. A catalog INSERT error for an individual row is NOT a hard
  // failure — it is isolated, retried, and folded into `errors` (soft,
  // per-row accounting), matching the pre-existing insert-path behavior.
  ok: boolean
  processed: number
  // Total supplier rows scanned while searching for genuinely-new candidates
  // (includes rows skipped because they already exist in catalog_products,
  // whether refreshed by the RPC or shadowed by a source='manual' row).
  // Diagnostic only — never used for the "remaining" accounting.
  scanned: number
  inserted: number
  approved: number
  insertsSkippedCap: number
  duplicateSlugFixed: number
  errors: string[]
  // Progress-based loop signal: true when this insert step filled its batch
  // (inserted >= the insert cap), meaning there are very likely more genuinely
  // -new rows to insert on the next call. Tied to rows ACTUALLY inserted (real,
  // committed progress), so a "loop while hasMore" runner always terminates —
  // each hasMore=true corresponds to a full cap's worth of rows leaving the
  // queue. False when the publish cap blocked inserts (nothing more this path
  // can do), so a cap-reached state does not spin forever.
  hasMore: boolean
  // Present when ok=false — explains the hard failure.
  message?: string
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
  // Canonical progress-based loop signal (requirement 5) — true when either the
  // existing-row refresh or the new-row insert filled its batch this call.
  hasMore: boolean
  // Exact backlog figures. undefined on the fast path (the v7 RPC no longer
  // computes them per call — see the migration). Populated only when the
  // refresh result actually carried them (an explicit diagnostic count, or a
  // pre-v7 shaped row), so existing callers/tests that provided them keep the
  // same arithmetic.
  remainingExisting?: number
  remainingNew?: number
  remainingTotal?: number
  blockedManual?: number
  errorGroups: Record<string, number>
  errorSamples: string[]
  message: string
}

// Merges the set-based existing-row refresh result with the new-row insert
// result into one truthful accounting. Pure (no DB access) so the arithmetic —
// including the progress/"remaining" bookkeeping — is unit-testable on its own.
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

  // Progress-based termination signal — never an exact whole-queue count.
  const hasMore = Boolean(refresh.hasMore) || Boolean(insert.hasMore)

  // Exact backlog counts are OPTIONAL now. Only compute them when the refresh
  // result actually carried them (diagnostic count / pre-v7 row). On the fast
  // path they stay undefined and the caller relies on `hasMore` instead.
  const hasExactCounts = refresh.remainingExisting != null && refresh.remainingNew != null
  const remainingExisting = hasExactCounts ? refresh.remainingExisting : undefined
  // refresh.remainingNew was measured BEFORE the new-row insert step ran —
  // subtract what that step just consumed so the reported backlog reflects the
  // true post-batch state without an extra DB round-trip.
  const remainingNew = hasExactCounts ? Math.max(0, (refresh.remainingNew as number) - insert.approved) : undefined
  const remainingTotal = hasExactCounts ? (remainingExisting as number) + (remainingNew as number) : undefined
  const blockedManual = refresh.blockedManual

  // A hard failure in the insert step (insert.ok=false — a prerequisite read
  // or the supplier-approval UPDATE itself failed) marks the whole batch
  // ok=false, even though the existing-row refresh above already committed
  // successfully; that progress is still reported truthfully.
  const ok = insert.ok && failed === 0
  let message: string
  if (!insert.ok) {
    message = insert.message ?? 'Нові товари: невідома помилка обробки'
  } else if (failed > 0) {
    message = `${failed} DB помилок: ${insert.errors[0]}`
  } else {
    const remainingText = remainingTotal != null ? `, залишок ${remainingTotal}` : (hasMore ? ', є ще' : ', черга вичерпана')
    message = `Існуючі: оброблено ${refresh.processed}, оновлено ${refresh.updated}. Нові: додано ${insert.inserted}${insert.insertsSkippedCap > 0 ? `, відкладено (ліміт) ${insert.insertsSkippedCap}` : ''}. Підтверджено всього ${approved}${remainingText}${blockedManual != null && blockedManual > 0 ? ` (+ ${blockedManual} заблоковано вручну)` : ''}`
  }

  return {
    ok, processed, inserted: insert.inserted, updated, approved, failed,
    insertsSkippedCap: insert.insertsSkippedCap, duplicateSlugFixed: insert.duplicateSlugFixed,
    hasMore,
    remainingExisting, remainingNew, remainingTotal, blockedManual,
    errorGroups, errorSamples: insert.errors.slice(0, 5),
    message,
  }
}
