// ─── Catalog field ownership ──────────────────────────────────────────────────
// The single source of truth for WHICH storefront columns the supplier import is
// allowed to overwrite on an EXISTING catalog_products row.
//
// Layering:
//   • supplier_products = raw supplier/operational layer (stock, supplier price,
//     availability, last-synced) — always supplier-owned.
//   • catalog_products  = storefront layer. Human-editable in the admin.
//
// The supplier import (`syncProductsToCatalog`) may refresh operational facts on
// catalog_products (price + imagery), but MUST NOT clobber a field a human has
// taken ownership of. Ownership is explicit (never null-heuristic):
//   • source = 'manual'      → the whole row is hand-owned (metal-profile, manual
//                              natural products). The import never touches it.
//   • price_manual_lock=true → keep the manual storefront price.
//   • image_manual_lock=true → keep the manual imagery.
//
// name / description / category / SEO / featured / display_order are already never
// written by the import update path, so they need no lock to stay protected.
//
// This is a PURE function so the preservation rules can be unit-tested without a DB.

import { normalizeStock } from '@/lib/catalog/stock'

export interface ExistingCatalogOwnership {
  source?: string | null
  price_manual_lock?: boolean | null
  image_manual_lock?: boolean | null
}

export interface SupplierFacts {
  price_uah?: number | null
  main_image_url?: string | null
  images?: unknown
  // Operational stock — always supplier-owned (no manual lock exists for it).
  stock_quantity?: number | null
  is_in_stock?: boolean | null
}

export interface CatalogUpdatePayload {
  price_uah?: number
  main_image_url?: string | null
  images?: unknown
  stock_quantity?: number
  is_in_stock?: boolean
}

// Returns the columns the supplier import may write for one existing catalog row,
// or `null` when nothing may be written (fully manual row, or every refreshable
// field is locked) so the caller can skip the UPDATE round-trip entirely.
export function buildSupplierUpdatePayload(
  facts: SupplierFacts,
  existing: ExistingCatalogOwnership,
): CatalogUpdatePayload | null {
  // A fully hand-owned row is never touched by the supplier sync.
  if (existing.source === 'manual') return null

  const payload: CatalogUpdatePayload = {}

  if (!existing.price_manual_lock && typeof facts.price_uah === 'number' && facts.price_uah > 0) {
    payload.price_uah = facts.price_uah
  }
  if (!existing.image_manual_lock) {
    payload.main_image_url = facts.main_image_url ?? null
    payload.images = facts.images ?? null
  }

  // Stock is operational and has no manual lock — it is always refreshed for
  // supplier rows (source !== 'manual', already guaranteed above). Missing /
  // invalid supplier stock normalizes to 0 / out-of-stock (the safe default).
  if (facts.stock_quantity !== undefined || facts.is_in_stock !== undefined) {
    const norm = normalizeStock(facts.stock_quantity, facts.is_in_stock)
    payload.stock_quantity = norm.stock_quantity
    payload.is_in_stock = norm.is_in_stock
  }

  return Object.keys(payload).length > 0 ? payload : null
}

// A single guarded write: the columns to set plus the lock column that MUST be
// false at write time. Splitting price and image into separate writes lets each
// lock be re-checked atomically in the UPDATE's WHERE clause, so a lock toggled
// between candidate selection and the write still wins (no lost manual edit).
export interface GuardedWrite {
  columns: Record<string, unknown>
  // `null` = no lock guard (operational fact, e.g. stock). The write still keeps
  // the source!=manual guard applied by every guarded write.
  guardColumn: 'price_manual_lock' | 'image_manual_lock' | null
}

export function planGuardedWrites(payload: CatalogUpdatePayload): GuardedWrite[] {
  const writes: GuardedWrite[] = []
  if (payload.price_uah !== undefined) {
    writes.push({ columns: { price_uah: payload.price_uah }, guardColumn: 'price_manual_lock' })
  }
  if (payload.main_image_url !== undefined || payload.images !== undefined) {
    const columns: Record<string, unknown> = {}
    if (payload.main_image_url !== undefined) columns.main_image_url = payload.main_image_url
    if (payload.images !== undefined) columns.images = payload.images
    writes.push({ columns, guardColumn: 'image_manual_lock' })
  }
  if (payload.stock_quantity !== undefined || payload.is_in_stock !== undefined) {
    const columns: Record<string, unknown> = {}
    if (payload.stock_quantity !== undefined) columns.stock_quantity = payload.stock_quantity
    if (payload.is_in_stock !== undefined) columns.is_in_stock = payload.is_in_stock
    writes.push({ columns, guardColumn: null })
  }
  return writes
}

// Pure simulation of the production UPDATE's WHERE clause:
//   .eq('supplier_sku', sku).or('source.is.null,source.neq.manual').eq(guardColumn, false)
// Lets tests prove the concurrency guarantee — a lock or source flipped AFTER
// candidate selection but BEFORE the write is still honored — without a live DB.
export function wouldGuardedWriteApply(write: GuardedWrite, currentRowAtWriteTime: ExistingCatalogOwnership): boolean {
  if (currentRowAtWriteTime.source === 'manual') return false
  if (write.guardColumn === null) return true // operational (stock): no lock guard
  return currentRowAtWriteTime[write.guardColumn] !== true
}
