// ─── Authoritative cart stock revalidation (PURE, unit-testable) ─────────────
// Runs server-side at checkout. The cart snapshots availability at add-to-cart
// time; this re-checks against the live catalog BEFORE an order is created and
// FAILS CLOSED — a lookup failure or a missing row blocks the order (temporary),
// never a silent pass. Manual + metal (inquiry) products are never blocked here.

export interface RevalItem {
  productType: string      // only 'catalog' items are stock-checked
  productSlug: string
  name?: string
}

export interface RevalRow {
  slug: string
  source?: string | null
  lead_type?: string | null
  is_in_stock?: boolean | null
  stock_synced_at?: string | null
  name_ua?: string | null
  supplier_sku?: string | null
  supplier_product_id?: string | null
}

export type RevalResult =
  | { ok: true }
  // A transient failure — the caller should return a "try again" checkout error.
  | { ok: false; reason: 'lookup_failed' }
  // Requested catalog product(s) no longer exist — temporary validation error.
  | { ok: false; reason: 'missing'; names: string[] }
  // Synced supplier row explicitly out of stock — block with the item names.
  | { ok: false; reason: 'out_of_stock'; names: string[] }

// Decide whether an order may proceed. `lookupFailed` is true when the catalog
// lookup query itself errored (fail closed). `rows` are the catalog rows found
// for the cart's catalog slugs. Order of precedence: lookup failure → missing
// row → out of stock.
export function revalidateSupplierStock(opts: {
  items: RevalItem[]
  rows: RevalRow[]
  lookupFailed: boolean
}): RevalResult {
  const catalogItems = opts.items.filter((i) => i.productType === 'catalog')
  if (catalogItems.length === 0) return { ok: true }

  // A lookup failure on a cart that contains catalog items must block (fail closed).
  if (opts.lookupFailed) return { ok: false, reason: 'lookup_failed' }

  const bySlug = new Map(opts.rows.map((r) => [r.slug, r]))

  // Missing rows: a catalog cart item whose product row is gone → can't verify.
  const missing = catalogItems.filter((i) => !bySlug.has(i.productSlug))
  if (missing.length > 0) {
    return { ok: false, reason: 'missing', names: missing.map((i) => i.name || i.productSlug) }
  }

  // Out of stock: only a SYNCED SUPPLIER row explicitly is_in_stock=false blocks.
  // Manual / metal rows (source='manual') carry no supplier stock and are skipped.
  const out: string[] = []
  for (const i of catalogItems) {
    const r = bySlug.get(i.productSlug)!
    const isSupplier = r.source !== 'manual'
    const isSynced = r.stock_synced_at != null || r.is_in_stock != null
    if (isSupplier && isSynced && r.is_in_stock === false) {
      out.push(String(r.name_ua || i.name || i.productSlug))
    }
  }
  if (out.length > 0) return { ok: false, reason: 'out_of_stock', names: out }

  return { ok: true }
}
