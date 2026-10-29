// A daily feed can disappear or stop including a SKU. Never turn an old
// positive flag into today's availability. 36 h allows the normal daily run
// and its multi-stage propagation window to complete.
export const SUPPLIER_STOCK_MAX_AGE_MS = 36 * 60 * 60 * 1000
export interface SupplierStockSignal {
  source?: string | null
  lead_type?: string | null
  supplier_sku?: string | null
  supplier_product_id?: string | null
  is_in_stock?: boolean | null
  stock_synced_at?: string | null
}
export function isSupplierStockStale(row: SupplierStockSignal, nowMs = Date.now()): boolean {
  if (row.source === 'manual' || row.lead_type === 'metal') return false
  const supplier = row.source === 'supplier' || row.supplier_sku != null || row.supplier_product_id != null
  if (!supplier || row.is_in_stock === false) return false
  if (row.is_in_stock !== true) return true
  const stamp = row.stock_synced_at ? Date.parse(row.stock_synced_at) : NaN
  return !Number.isFinite(stamp) || stamp > nowMs + 5 * 60 * 1000 || nowMs - stamp > SUPPLIER_STOCK_MAX_AGE_MS
}

// Copy the timestamp of the actual supplier observation, never the later
// catalog import time. Missing evidence remains missing (and cannot unlock buy).
export function supplierStockObservedAt(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}
