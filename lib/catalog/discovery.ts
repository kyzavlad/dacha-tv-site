import type { CatalogProduct } from '@/types'

/**
 * Public discovery surfaces (category grids, search, recommendations, model hubs)
 * should lead shoppers to products they can actually buy now.
 *
 * Supplier products are visible in discovery only when the synced stock signal is
 * explicitly positive and quantity is above zero. Their published PDP URL stays
 * available separately for SEO/direct links, where the page can truthfully show
 * OutOfStock without deleting the URL.
 *
 * Manual/inquiry products (including metal) do not use supplier stock semantics,
 * so they remain discoverable and keep their existing lead/contact flow.
 */
export function isDiscoveryVisibleProduct(
  product: Pick<
    CatalogProduct,
    'source' | 'lead_type' | 'supplier_sku' | 'supplier_product_id' | 'is_in_stock' | 'stock_quantity'
  >,
): boolean {
  if (product.source === 'manual' || product.lead_type === 'metal') return true

  const isSupplier =
    product.source === 'supplier' ||
    product.supplier_sku != null ||
    product.supplier_product_id != null

  if (!isSupplier) return false

  return product.is_in_stock === true && Number(product.stock_quantity ?? 0) > 0
}
