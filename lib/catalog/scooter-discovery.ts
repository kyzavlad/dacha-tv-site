import { createClient } from '@supabase/supabase-js'
import type { CatalogProduct } from '@/types'
import {
  CATALOG_PAGE_SIZE,
  isPublicListableProduct,
  MIN_VALID_PRICE_UAH,
} from '@/lib/supabase/catalog'

const SCOOTER_MATCH_COLUMNS = ['name_ua', 'name'] as const
const MAX_SCOOTER_FILTER_PREDICATES = 24
const MAX_SCOOTER_FILTER_LENGTH = 2048

function getClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function sanitizeModelPattern(s: string): string {
  return s.replace(/[(),]/g, ' ').replace(/%+/g, '%').trim()
}

function buildScooterOrClause(patterns: string[]): {
  clause: string
  predicateCount: number
  filterLength: number
} {
  const normalized = [...new Set(patterns.map(sanitizeModelPattern))]
    .filter((pattern) => pattern.replace(/%/g, '').length >= 2)
  const predicates = normalized.flatMap((pattern) =>
    SCOOTER_MATCH_COLUMNS.map((column) => `${column}.ilike.%${pattern}%`),
  )
  const clause = predicates.join(',')
  if (predicates.length > MAX_SCOOTER_FILTER_PREDICATES || clause.length > MAX_SCOOTER_FILTER_LENGTH) {
    throw new Error(
      `scooter landing filter too complex: predicates=${predicates.length}, length=${clause.length}`,
    )
  }
  return { clause, predicateCount: predicates.length, filterLength: clause.length }
}

/**
 * Paid/SEO scooter model hubs are product-discovery pages, so every supplier card
 * shown here must be sellable inventory now. Temporary out-of-stock product PDPs
 * remain published elsewhere; they are simply excluded from this discovery grid.
 */
export async function getInStockScooterModelProducts(
  categorySlug: string,
  modelTokens: string[],
  page: number,
  modTokens?: string[],
): Promise<{ products: CatalogProduct[]; hasNext: boolean }> {
  const client = getClient()
  if (!client) return { products: [], hasNext: false }

  const modelFilter = buildScooterOrClause(modelTokens)
  if (!modelFilter.clause) return { products: [], hasNext: false }

  const from = (page - 1) * CATALOG_PAGE_SIZE
  const to = from + CATALOG_PAGE_SIZE
  let base = client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .eq('category_slug', categorySlug)
    .eq('is_in_stock', true)
    .gt('stock_quantity', 0)
    .gte('price_uah', MIN_VALID_PRICE_UAH)
    .not('is_price_suspicious', 'is', true)
    .not('main_image_url', 'is', null)
    .neq('main_image_url', '')
    .or(modelFilter.clause)

  const modFilter = modTokens?.length ? buildScooterOrClause(modTokens) : null
  if (modFilter?.clause) base = base.or(modFilter.clause)

  const { data, error } = await base
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('name_ua', { ascending: true })
    .range(from, to)

  if (error) {
    console.warn('[scooter-discovery] query failed', {
      categorySlug,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      modelPredicateCount: modelFilter.predicateCount,
      modelFilterLength: modelFilter.filterLength,
      modPredicateCount: modFilter?.predicateCount ?? 0,
      modFilterLength: modFilter?.filterLength ?? 0,
    })
    throw new Error(`scooter discovery query failed: ${error.message}`)
  }

  const rows = (data ?? []) as CatalogProduct[]
  const hasNext = rows.length > CATALOG_PAGE_SIZE
  const products = rows.slice(0, CATALOG_PAGE_SIZE).filter(isPublicListableProduct)
  return { products, hasNext }
}
