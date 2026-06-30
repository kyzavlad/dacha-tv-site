import { createClient } from '@supabase/supabase-js'
import type { CatalogCategory, CatalogProduct } from '@/types'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export const CATALOG_PAGE_SIZE = 24

// Manual food/natural categories that are NOT part of /catalog ("Магазин").
// Their products are presented under /products ("Продукти пасіки") instead. We
// exclude by category_slug (always present) so the public catalog never depends
// on a possibly-unmigrated column.
export const NATURAL_CATEGORY_SLUGS = ['naturalni-produkty', 'zhyvi-olii-holodnogo-vidzhymu']

// PostgREST `or` filter: keep null-category products (the /catalog/all catch-all)
// but drop products in the natural categories. `NOT IN` alone would also drop
// NULLs, so the explicit `is.null` branch is required.
const EXCLUDE_NATURAL_OR = `category_slug.is.null,category_slug.not.in.(${NATURAL_CATEGORY_SLUGS.join(',')})`

// Public price-display guard. Until a re-sync corrects historical rows, some
// catalog products may still carry a corrupted sub-currency price (raw USD
// written as UAH, e.g. 0.58). Treat any non-positive or implausibly tiny price
// as "no price" so the UI shows "Уточнити ціну" instead of a fake bargain.
export const MIN_VALID_PRICE_UAH = 10
export function hasValidPrice(price: number | null | undefined): boolean {
  return typeof price === 'number' && isFinite(price) && price >= MIN_VALID_PRICE_UAH
}

// ─── Manual / supplier unified price + CTA logic ─────────────────────────────
// A product shows a real price only when it has a valid, non-suspicious price.
export function hasDisplayablePrice(product: CatalogProduct): boolean {
  return hasValidPrice(product.price_uah) && !product.is_price_suspicious
}

// Metal / roofing products are always inquiry/lead-only (price is per-order,
// cut-to-size, region-dependent), never add-to-cart — regardless of any
// reference price stored on the row.
export const METAL_CATEGORY_SLUG = 'metaloprofil-pokrivlia-komplektuiuchi'
export function isMetalProduct(product: CatalogProduct): boolean {
  return product.lead_type === 'metal' || product.category_slug === METAL_CATEGORY_SLUG
}

// Inquiry mode: metal (always), explicitly inquiry-only, or simply has no
// displayable price. Such products show a lead/contact CTA instead of cart.
export function isInquiryProduct(product: CatalogProduct): boolean {
  return isMetalProduct(product) || product.inquiry_only === true || !hasDisplayablePrice(product)
}

// Can this product go through the normal cart/checkout path?
export function canAddToCart(product: CatalogProduct): boolean {
  return product.status === 'published' && !isInquiryProduct(product)
}

// Build the display price string, honouring an optional prefix ("від") and a
// unit label ("грн/кг", "грн/м²", …). Returns null when there is no price to
// show — callers then render "Уточнити ціну". Note: even inquiry-only products
// may carry a reference price (e.g. "від 100 грн"), which we still surface.
export function formatCatalogPrice(product: CatalogProduct): string | null {
  if (!hasDisplayablePrice(product)) return null
  const amount = (product.price_uah as number).toLocaleString('uk-UA')
  const unit = product.unit_label && product.unit_label.trim() ? product.unit_label.trim() : 'грн'
  const prefix = product.price_prefix && product.price_prefix.trim() ? `${product.price_prefix.trim()} ` : ''
  return `${prefix}${amount} ${unit}`
}

// ─── Category display-name normalization ─────────────────────────────────────
// Some supplier categories arrive with technical, slug-like names (auto-generated
// IDs) that must never reach users: pure numbers ("185"), supplier IDs
// ("cat-185", "cat-38853"), or other prefix-number patterns ("sup-4308").
// `isUnusableCategoryName` flags these; `categoryDisplayName` returns a safe
// human-readable fallback so /catalog, /catalog/[slug], breadcrumbs and metadata
// never render a raw cat-* name.
export const FALLBACK_CATEGORY_NAME = 'Товари для дому та господарства'

export function isUnusableCategoryName(name: string | null | undefined): boolean {
  if (!name) return true
  const n = name.trim()
  if (!n) return true
  if (/^\d+$/.test(n)) return true            // "185", "38853"
  if (/^cat-\d+$/i.test(n)) return true       // "cat-185", "cat-38853"
  if (/^[a-z]+[_-]\d+$/i.test(n)) return true // "sup-4308", "id_73855"
  return false
}

export function categoryDisplayName(name: string | null | undefined): string {
  return isUnusableCategoryName(name) ? FALLBACK_CATEGORY_NAME : (name as string).trim()
}

export async function getPublishedCategories(): Promise<CatalogCategory[]> {
  const client = getClient()
  if (!client) return []
  // Order by safe, always-present columns in the query, then re-sort in JS so we
  // never error if `source`/`sort_order` (migration 054) are missing on an
  // instance — the JS comparator simply falls back to defaults.
  const { data } = await client
    .from('catalog_categories')
    .select('*')
    .eq('is_published', true)
    .order('display_order', { ascending: true })
    .order('name_ua', { ascending: true })
    .limit(2000)
  const rows = (data ?? []) as CatalogCategory[]
  // Pinned order: manual categories first (metal → natural → oils via sort_order),
  // then supplier/API categories by name.
  return rows.sort((a, b) => {
    const am = a.source === 'manual' ? 0 : 1
    const bm = b.source === 'manual' ? 0 : 1
    if (am !== bm) return am - bm
    const aso = a.sort_order ?? 100
    const bso = b.sort_order ?? 100
    if (aso !== bso) return aso - bso
    return (a.name_ua ?? '').localeCompare(b.name_ua ?? '', 'uk')
  })
}

// Bounded category list for the /catalog LANDING grid. Deliberately cheap:
//   • ONE query, only the columns the card renders (no faq_json/meta/SEO blobs)
//   • capped row count at the DB level — never reads the whole categories table
//   • NO product scan and NO per-category COUNT(*) (those are what made the old
//     landing time out at 105k products)
// We over-fetch a little so slug-like names can be dropped in JS and the grid
// still fills, then pin manual categories first and slice to `limit`.
export async function getLandingCategories(limit = 80): Promise<CatalogCategory[]> {
  const client = getClient()
  if (!client) return []
  const fetchCount = Math.min(Math.max(limit * 4, limit + 60), 600)
  const { data } = await client
    .from('catalog_categories')
    // sort_order FIRST so curated manual categories (metal: sort_order 1) are
    // guaranteed inside the bounded fetch window before the JS pin runs.
    // Supplier categories default to sort_order 100 and display_order 0, so
    // ordering by display_order alone would push the manual card past the limit.
    .select('id, slug, name_ua, image_url, description, display_order, sort_order, source, is_published')
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('display_order', { ascending: true })
    .order('name_ua', { ascending: true })
    .limit(fetchCount)
  const rows = (data ?? []) as CatalogCategory[]
  // Drop technical/slug-like names, then pin manual categories (metal, natural,
  // oils) first — same order intent as getPublishedCategories — and cap.
  const usable = rows.filter((c) => !isUnusableCategoryName(c.name_ua))
  usable.sort((a, b) => {
    const am = a.source === 'manual' ? 0 : 1
    const bm = b.source === 'manual' ? 0 : 1
    if (am !== bm) return am - bm
    const aso = a.sort_order ?? 100
    const bso = b.sort_order ?? 100
    if (aso !== bso) return aso - bso
    return (a.name_ua ?? '').localeCompare(b.name_ua ?? '', 'uk')
  })
  return usable.slice(0, limit)
}

export async function getCategoryBySlug(slug: string): Promise<CatalogCategory | null> {
  const client = getClient()
  if (!client) return null
  const { data } = await client
    .from('catalog_categories')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()
  return (data ?? null) as CatalogCategory | null
}

// ─── Catalog sorting ─────────────────────────────────────────────────────────
// URL-driven sort for category / all / search listings. Plain query-param so the
// listing pages stay server-rendered; only a tiny <select> navigates on change.
export type CatalogSort = 'featured' | 'price_asc' | 'price_desc' | 'newest' | 'name'

export const CATALOG_SORTS: { value: CatalogSort; label: string }[] = [
  { value: 'featured', label: 'Рекомендовані' },
  { value: 'price_asc', label: 'Спочатку дешевші' },
  { value: 'price_desc', label: 'Спочатку дорожчі' },
  { value: 'newest', label: 'Новинки' },
  { value: 'name', label: 'За назвою (А–Я)' },
]

export function normalizeSort(raw: string | null | undefined): CatalogSort {
  const v = (raw ?? '').trim()
  return CATALOG_SORTS.some((s) => s.value === v) ? (v as CatalogSort) : 'featured'
}

// Apply the chosen sort to a catalog_products query builder. Typed as the
// PostgREST query builder via the parameter's own type so we keep full chaining
// type-safety without naming the (awkward) supabase-js builder type.
function applyCatalogSort<Q extends {
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): Q
}>(query: Q, sort: CatalogSort): Q {
  switch (sort) {
    case 'price_asc':
      return query.order('price_uah', { ascending: true, nullsFirst: false }).order('name_ua', { ascending: true })
    case 'price_desc':
      return query.order('price_uah', { ascending: false, nullsFirst: false }).order('name_ua', { ascending: true })
    case 'newest':
      return query.order('created_at', { ascending: false })
    case 'name':
      return query.order('name_ua', { ascending: true })
    case 'featured':
    default:
      return query
        .order('is_featured', { ascending: false })
        .order('display_order', { ascending: true })
        .order('name_ua', { ascending: true })
  }
}

export async function getPublishedProductsByCategory(
  categorySlug: string,
  page: number,
  sort: CatalogSort = 'featured',
): Promise<{ products: CatalogProduct[]; total: number }> {
  const client = getClient()
  if (!client) return { products: [], total: 0 }
  const from = (page - 1) * CATALOG_PAGE_SIZE
  const to = from + CATALOG_PAGE_SIZE - 1
  const base = client
    .from('catalog_products')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .eq('category_slug', categorySlug)
  const { data, count } = await applyCatalogSort(base, sort).range(from, to)
  return { products: (data ?? []) as CatalogProduct[], total: count ?? 0 }
}

// Up to `limit` other published products in the same category, for the
// "схожі товари" rail on a product page. Cheap: single indexed query, no counts.
export async function getRelatedCatalogProducts(
  categorySlug: string | null,
  excludeSlug: string,
  limit = 4,
): Promise<CatalogProduct[]> {
  const client = getClient()
  if (!client || !categorySlug || NATURAL_CATEGORY_SLUGS.includes(categorySlug)) return []
  const { data } = await client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .eq('category_slug', categorySlug)
    .neq('slug', excludeSlug)
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .limit(limit)
  return (data ?? []) as CatalogProduct[]
}

export async function getPublishedProductBySlug(
  categorySlug: string,
  productSlug: string,
): Promise<CatalogProduct | null> {
  const client = getClient()
  if (!client) return null
  const { data } = await client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .eq('category_slug', categorySlug)
    .eq('slug', productSlug)
    .single()
  return (data ?? null) as CatalogProduct | null
}

// Slug-only fallback: catalog_products.slug is globally unique, so this resolves
// products even when their category_slug is null/mismatched (used by /catalog/all).
export async function getPublishedProductBySlugOnly(productSlug: string): Promise<CatalogProduct | null> {
  const client = getClient()
  if (!client) return null
  const { data } = await client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .eq('slug', productSlug)
    .maybeSingle()
  return (data ?? null) as CatalogProduct | null
}

export async function getPublishedCatalogSlugs(): Promise<{ category: string; product: string }[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('catalog_products')
    .select('slug, category_slug')
    .eq('status', 'published')
    .not('category_slug', 'is', null)
    .not('category_slug', 'in', `(${NATURAL_CATEGORY_SLUGS.join(',')})`)
  return (data ?? []).map((r) => ({ category: r.category_slug as string, product: r.slug as string }))
}

export async function getPublishedCatalogProducts(
  page = 1,
  sort: CatalogSort = 'featured',
): Promise<{ products: CatalogProduct[]; total: number }> {
  const client = getClient()
  if (!client) return { products: [], total: 0 }
  const from = (page - 1) * CATALOG_PAGE_SIZE
  const to = from + CATALOG_PAGE_SIZE - 1
  const base = client
    .from('catalog_products')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .or(EXCLUDE_NATURAL_OR)
  const { data, count } = await applyCatalogSort(base, sort).range(from, to)
  return { products: (data ?? []) as CatalogProduct[], total: count ?? 0 }
}

// Public catalog search (?q=) — matches published shop products by Ukrainian or
// Russian name. Searching the `name` (Russian supplier feed) column as well lets
// customers find items before a Ukrainian translation is written. Natural food
// products are excluded (they live under /products), metal stays included.
export async function searchPublishedCatalogProducts(
  q: string,
  page = 1,
  sort: CatalogSort = 'featured',
): Promise<{ products: CatalogProduct[]; total: number }> {
  const client = getClient()
  const term = q.trim()
  if (!client || !term) return { products: [], total: 0 }
  const from = (page - 1) * CATALOG_PAGE_SIZE
  const to = from + CATALOG_PAGE_SIZE - 1
  // Escape PostgREST ilike wildcards so user input can't broaden the match.
  const escaped = term.replace(/[%_,()]/g, ' ').trim()
  const pattern = `%${escaped}%`
  // Match on the Ukrainian name_ua, the raw supplier name (Russian), or the
  // supplier SKU — so customers can search by product code as well as name.
  // Searching `name` avoids making the public UI bilingual while still letting
  // Ukrainian customers find items by the Russian feed names.
  const base = client
    .from('catalog_products')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .or(EXCLUDE_NATURAL_OR)
    .or(`name_ua.ilike.${pattern},name.ilike.${pattern},supplier_sku.ilike.${pattern}`)
  const { data, count } = await applyCatalogSort(base, sort).range(from, to)
  return { products: (data ?? []) as CatalogProduct[], total: count ?? 0 }
}

export async function getPublishedCatalogProductCount(): Promise<number> {
  const client = getClient()
  if (!client) return 0
  const { count } = await client
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .or(EXCLUDE_NATURAL_OR)
  return count ?? 0
}

// Natural/food manual products for /products ("Продукти пасіки"). These live in
// catalog_products (source='manual') but are excluded from /catalog.
export async function getNaturalProducts(): Promise<CatalogProduct[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .in('category_slug', NATURAL_CATEGORY_SLUGS)
    .order('display_order', { ascending: true })
    .order('name_ua', { ascending: true })
    .limit(200)
  return (data ?? []) as CatalogProduct[]
}

export async function getCategoryProductCount(categorySlug: string): Promise<number> {
  const client = getClient()
  if (!client) return 0
  const { count } = await client
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('category_slug', categorySlug)
  return count ?? 0
}

// Derive product counts grouped by category_slug directly from published
// products — the single source of truth for what /catalog should show. One
// lightweight column is fetched (paginated past PostgREST's 1000-row cap) and
// grouped in memory, which stays cheap for a few thousand products and makes
// the landing page resilient to missing/misaligned category_slug values.
export async function getPublishedCategorySlugCounts(): Promise<{
  bySlug: Map<string, number>
  nullCount: number
  total: number
}> {
  const client = getClient()
  const bySlug = new Map<string, number>()
  let nullCount = 0
  let total = 0
  if (!client) return { bySlug, nullCount, total }

  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('catalog_products')
      .select('category_slug')
      .eq('status', 'published')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const row of data) {
      const slug = (row as { category_slug: string | null }).category_slug
      // Skip natural/food products — they belong to /products, not /catalog.
      if (slug && NATURAL_CATEGORY_SLUGS.includes(slug)) continue
      total++
      if (slug) bySlug.set(slug, (bySlug.get(slug) ?? 0) + 1)
      else nullCount++
    }
    if (data.length < PAGE) break
  }

  return { bySlug, nullCount, total }
}
