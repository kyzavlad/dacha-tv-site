// ─── Public storefront stock (PURE, unit-testable) ───────────────────────────
// Raw supplier stock lives on supplier_products; the import copies it onto
// catalog_products (stock_quantity/is_in_stock/stock_synced_at) so the storefront
// can show availability WITHOUT reading the supplier layer at request time.
// Manual + metal rows are never given supplier stock (they're inquiry/manual).

import type { Locale } from '@/lib/i18n'

export interface NormalizedStock {
  stock_quantity: number
  is_in_stock: boolean
}

// Never negative, never NaN. Missing/invalid supplier stock → 0 (out of stock),
// which is the safe default. `isInStockFlag` (the supplier's own boolean) can
// keep a 0-quantity row in stock only when the supplier explicitly says so.
export function normalizeStock(rawQuantity: unknown, isInStockFlag?: unknown): NormalizedStock {
  const n = Number(rawQuantity)
  const qty = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
  const flag = isInStockFlag == null ? undefined : Boolean(isInStockFlag)
  const is_in_stock = qty > 0 || flag === true
  return { stock_quantity: qty, is_in_stock: qty > 0 ? true : is_in_stock }
}

export type StockStatus = 'in_stock' | 'out_of_stock' | 'unknown'

// The status shown on cards / detail pages. `unknown` when the row has no synced
// stock signal yet (e.g. a manual product, or a supplier row not yet imported).
export function stockStatus(p: { source?: string | null; lead_type?: string | null; is_in_stock?: boolean | null; stock_synced_at?: string | null }): StockStatus {
  // Manual / inquiry products don't carry supplier stock — availability is "ask".
  if (p.source === 'manual' || p.lead_type === 'metal') return 'unknown'
  if (p.stock_synced_at == null && p.is_in_stock == null) return 'unknown'
  return p.is_in_stock ? 'in_stock' : 'out_of_stock'
}

const LABELS: Record<StockStatus, Record<Locale, string>> = {
  in_stock: { uk: 'В наявності', ru: 'В наличии', en: 'In stock' },
  out_of_stock: { uk: 'Немає в наявності', ru: 'Нет в наличии', en: 'Out of stock' },
  unknown: { uk: 'Уточнити наявність', ru: 'Уточнить наличие', en: 'Check availability' },
}

export function stockLabel(status: StockStatus, locale: Locale): string {
  return LABELS[status][locale] ?? LABELS[status].uk
}

// Cart guard: a SUPPLIER product that is explicitly out of stock cannot be added
// to the cart. Manual/metal (inquiry) and unknown-stock rows are unaffected — the
// existing buyability rules still apply on top of this.
export function isPurchasableForStock(p: { source?: string | null; lead_type?: string | null; is_in_stock?: boolean | null; stock_synced_at?: string | null }): boolean {
  return stockStatus(p) !== 'out_of_stock'
}
