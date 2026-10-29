// Server-component entry point ONLY. Supplier category relations are protected
// by RLS; use the existing server reader without exposing the raw relation/key.
import { getAdminClient } from './admin'
import { NATURAL_CATEGORY_SLUGS, STOREFRONT_SCOPE_OR, adsReadinessTier, isPublicListableProduct } from './catalog'
import { SUPPLIER_STOCK_MAX_AGE_MS } from '@/lib/catalog/stock-freshness'
import { isDiscoveryVisibleProduct } from '@/lib/catalog/discovery'
import type { CatalogProduct } from '@/types'

if (typeof window !== 'undefined') throw new Error('Related products require the server')

export async function getRelatedCatalogProducts(
  categorySlug: string | null,
  excludeSlug: string,
  limit = 4,
): Promise<CatalogProduct[]> {
  if (!categorySlug || NATURAL_CATEGORY_SLUGS.includes(categorySlug)) return []
  const client = getAdminClient()
  const size = Math.max(1, Math.min(12, Math.floor(limit) || 4))
  // Filter stock BEFORE the bounded query/slice: the card uses this same
  // predicate, otherwise an apparently nonempty rail can render zero cards.
  const cutoff = new Date(Date.now() - SUPPLIER_STOCK_MAX_AGE_MS).toISOString()
  async function candidates(slugs: string[]) {
    const { data } = await client!
      .from('catalog_products').select('*').eq('status', 'published')
      .in('category_slug', slugs).neq('slug', excludeSlug).or(STOREFRONT_SCOPE_OR)
      .or(`source.eq.manual,lead_type.eq.metal,and(is_in_stock.eq.true,stock_quantity.gt.0,stock_synced_at.gte.${cutoff})`)
      .order('is_featured', { ascending: false }).order('display_order', { ascending: true })
      .order('id', { ascending: true }).limit(Math.max(64, size * 16))
    return ((data ?? []) as CatalogProduct[]).filter(p => isPublicListableProduct(p) && isDiscoveryVisibleProduct(p))
  }
  const same = await candidates([categorySlug])
  const ranked = same.sort((a, b) => adsReadinessTier(a) - adsReadinessTier(b))
  const selected = ranked.slice(0, size)
  if (selected.length >= size) return selected

  // Only the supplier's real sibling categories are eligible for fallback.
  // Never fill a scooter/metal page with arbitrary products from the store.
  const { data: category } = await client.from('catalog_categories').select('supplier_category_id')
    .eq('slug', categorySlug).eq('is_published', true).maybeSingle()
  if (!category?.supplier_category_id) return selected
  const { data: supplierCategory } = await client.from('supplier_categories').select('parent_supplier_id')
    .eq('supplier_id', category.supplier_category_id).maybeSingle()
  if (!supplierCategory?.parent_supplier_id) return selected
  const { data: siblings } = await client.from('supplier_categories').select('supplier_id')
    .eq('parent_supplier_id', supplierCategory.parent_supplier_id).limit(64)
  const ids = (siblings ?? []).map(c => c.supplier_id)
  if (!ids.length) return selected
  const { data: categories } = await client.from('catalog_categories').select('slug')
    .eq('is_published', true).in('supplier_category_id', ids).neq('slug', categorySlug).limit(64)
  const slugs = (categories ?? []).map(c => c.slug)
  if (!slugs.length) return selected
  const seen = new Set(selected.map(p => p.id))
  const fallback = (await candidates(slugs)).sort((a, b) => adsReadinessTier(a) - adsReadinessTier(b))
  return [...selected, ...fallback.filter(p => !seen.has(p.id))].slice(0, size)
}

