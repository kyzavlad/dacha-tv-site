import { createClient } from '@supabase/supabase-js'
import type { CatalogCategory, CatalogProduct } from '@/types'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export const CATALOG_PAGE_SIZE = 24

// ─── Localized SEO readers (public/anon; SELECT-only via RLS) ──────────────────
// A single translation row for a product/category + locale, used by localized
// (ru/en) pages. Never queried for the default 'uk' locale. Returns null when the
// row is absent (→ the resolver falls back to Ukrainian content). Kept lean —
// only the SEO columns the page renders.
export interface CatalogTranslationRow {
  meta_title: string | null
  meta_description: string | null
  description: string | null
  h1?: string | null
  seo_keywords: string | null
  faq_json?: unknown
  seo_status: string | null
}

export async function getProductTranslation(productId: string, locale: string): Promise<CatalogTranslationRow | null> {
  const client = getClient()
  if (!client || !productId) return null
  const { data } = await client
    .from('catalog_product_translations')
    .select('meta_title, meta_description, description, seo_keywords, seo_status')
    .eq('product_id', productId)
    .eq('locale', locale)
    .maybeSingle()
  return (data as CatalogTranslationRow | null) ?? null
}

export async function getCategoryTranslation(categoryId: string, locale: string): Promise<CatalogTranslationRow | null> {
  const client = getClient()
  if (!client || !categoryId) return null
  const { data } = await client
    .from('catalog_category_translations')
    .select('meta_title, meta_description, description, h1, seo_keywords, faq_json, seo_status')
    .eq('category_id', categoryId)
    .eq('locale', locale)
    .maybeSingle()
  return (data as CatalogTranslationRow | null) ?? null
}

// Product URLs per sitemap shard. Set to PostgREST's max-rows page size (1000)
// so ONE request fully fills a shard — a larger value is silently truncated to
// 1000 by PostgREST, which was the bug (45k shards returning only 1000). Well
// under Google's 50,000-URL limit. Shared by app/sitemap.ts and app/robots.ts
// so shard math matches exactly.
export const SITEMAP_PRODUCTS_PER_CHUNK = 1000

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

// ─── Product image resolution ────────────────────────────────────────────────
// Supplier image data is not always in main_image_url — after a resync some
// catalog_products carry the https://images.zone/... URL only in the images[]
// array (jsonb, sometimes serialized as a string) or inside a raw_data blob.
// The card previously read main_image_url alone, so those products rendered the
// placeholder and no <img> reached the HTML. This probes every known location in
// priority order and normalizes the URL.

// Turn a jsonb array / JSON-string / comma-list into a clean string[].
function toImageArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string' && v.trim()) {
    const s = v.trim()
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s)
        if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean)
      } catch { /* not JSON — fall through */ }
    }
    return s.split(',').map((x) => x.trim()).filter(Boolean)
  }
  return []
}

// Normalize one candidate into a usable src, or null. Upgrades protocol-relative
// and bare-host URLs to https (browsers block mixed-content http images anyway),
// and keeps local "/..." paths as-is.
export function normalizeImageUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  if (s.startsWith('https://')) return s
  if (s.startsWith('http://')) return `https://${s.slice('http://'.length)}`
  if (s.startsWith('//')) return `https:${s}`
  if (s.startsWith('/')) return s // local/public asset
  if (/^[a-z0-9.-]+\.[a-z]{2,}\/.+/i.test(s)) return `https://${s}` // bare host, e.g. images.zone/…
  return null
}

// Minimal structural shape so both a full CatalogProduct and a looser raw row
// can be passed (no index signature — CatalogProduct is structurally assignable).
export interface ImageBearingProduct {
  main_image_url?: string | null
  images?: unknown
  image_url?: string | null
  imageUrl?: string | null
  raw_data?: unknown
}

// Best external image URL for a catalog product, checking all known fields in
// priority order: main_image_url → image_url/imageUrl → images[0] →
// raw_data.mainimage/image/images[0]. Returns null when nothing usable is found.
export function getCatalogProductImage(product: ImageBearingProduct | null | undefined): string | null {
  if (!product) return null
  const candidates: unknown[] = [product.main_image_url, product.image_url, product.imageUrl]

  const imgs = toImageArray(product.images)
  if (imgs.length) candidates.push(imgs[0])

  const raw = product.raw_data
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    candidates.push(r.mainimage, r.main_image_url, r.image, r.photo, r.picture)
    const rawImgs = toImageArray(r.images ?? r.pictures ?? r.photos)
    if (rawImgs.length) candidates.push(rawImgs[0])
  }

  for (const c of candidates) {
    const url = normalizeImageUrl(c)
    if (url) return url
  }
  return null
}

// All usable image URLs for a product (for a detail-page gallery), primary first,
// deduplicated and normalized.
export function getCatalogProductImages(product: ImageBearingProduct | null | undefined): string[] {
  if (!product) return []
  const primary = getCatalogProductImage(product)
  const rest = toImageArray(product.images).map(normalizeImageUrl).filter((u): u is string => u != null)
  const raw = product.raw_data
  const rawRest = raw && typeof raw === 'object'
    ? toImageArray((raw as Record<string, unknown>).images).map(normalizeImageUrl).filter((u): u is string => u != null)
    : []
  const ordered = [primary, ...rest, ...rawRest].filter((u): u is string => u != null)
  return [...new Set(ordered)]
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

// Count real letters (Latin or Cyrillic) — a human name has several; a code /
// punctuation blob ("<>", "N-1171", "—") has ~none.
function letterCount(s: string): number {
  return (s.match(/[a-zа-яіїєґ]/gi) ?? []).length
}

export function isUnusableCategoryName(name: string | null | undefined): boolean {
  if (!name) return true
  const n = name.trim()
  if (!n) return true
  if (/^\d+$/.test(n)) return true              // "185", "38853"
  if (/^cat-\d+$/i.test(n)) return true         // "cat-185", "cat-38853"
  if (/^[a-z]+[_-]?\d+$/i.test(n)) return true  // "sup-4308", "id_73855", "n1171"
  if (letterCount(n) < 2) return true           // "<>", "—", "()", pure symbols/codes
  if (!/[a-zа-яіїєґ]/i.test(n)) return true      // no letters at all
  return false
}

export function categoryDisplayName(name: string | null | undefined): string {
  return isUnusableCategoryName(name) ? FALLBACK_CATEGORY_NAME : (name as string).trim()
}

// A product name is "garbage" when it carries no real words — e.g. "<>", "--10",
// "F0000000024", a bare SKU/code, or pure punctuation. Never show as a card title.
export function isGarbageProductName(name: string | null | undefined): boolean {
  if (!name) return true
  const n = name.trim()
  if (!n) return true
  if (letterCount(n) < 2) return true                   // "<>", "--10", "F0000000024", "N-1171", "—"
  if (/^[<>{}\[\]()._\-\s\/\\|]+$/.test(n)) return true  // only punctuation / brackets
  return false
}

// A minimal shape covering the name-bearing columns (name_ua = Ukrainian,
// name = raw Russian supplier feed) + the SKU used as a code sentinel.
export type NameBearingProduct = Pick<CatalogProduct, 'name_ua' | 'supplier_sku'> & { name?: string | null }

// The best real human name, preferring Ukrainian then the Russian supplier name.
// Returns null when a product has NO real name (every candidate is empty,
// punctuation, a code, or equal to its own SKU) — such products are unsuitable
// for public listing.
export function bestProductName(product: NameBearingProduct, locale?: string): string | null {
  const sku = (product.supplier_sku ?? '').trim().toLowerCase()
  const consider = (raw: string | null | undefined): string | null => {
    const s = (raw ?? '').replace(/\s+/g, ' ').trim()
    if (!s || isGarbageProductName(s)) return null
    if (sku && s.toLowerCase() === sku) return null // name IS the SKU → code-like
    return s
  }
  // ru: prefer the Russian supplier feed name (catalog_products.name), then the
  // Ukrainian name. Otherwise Ukrainian first. Always falls back so a card is
  // never blank just because the locale-preferred name is missing (RU→UA→original).
  if (locale === 'ru') return consider(product.name) ?? consider(product.name_ua) ?? null
  return consider(product.name_ua) ?? consider(product.name) ?? null
}

// True when a product has a real name and is safe to show in a PUBLIC list.
// Products failing this are HIDDEN from public catalog/search/suggest — never
// deleted or archived; admin still sees everything.
export function isPublicListableProduct(product: NameBearingProduct): boolean {
  return bestProductName(product) !== null
}

// Human-facing product title. Uses the best real name; only falls back to a SKU
// label when there is genuinely no real name (those are filtered out of public
// lists, but detail pages / cart still need a non-empty string). Never mutates DB.
export function displayProductName(product: NameBearingProduct, locale?: string): string {
  const best = bestProductName(product, locale)
  if (best) return best
  const sku = (product.supplier_sku ?? '').trim()
  return sku ? `Товар ${sku}` : 'Товар'
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
  const products = ((data ?? []) as CatalogProduct[]).filter(isPublicListableProduct)
  return { products, total: count ?? 0 }
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
  // Over-fetch a little so the rail stays full after garbage rows are filtered.
  const { data } = await client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .eq('category_slug', categorySlug)
    .neq('slug', excludeSlug)
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .limit(limit * 4)
  return ((data ?? []) as CatalogProduct[]).filter(isPublicListableProduct).slice(0, limit)
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

// DEPRECATED for the sitemap: this has no .range()/.limit(), so PostgREST caps
// it at ~1000 rows — it would silently drop ~99% of a 105k catalog. Kept only
// for any small/legacy caller. The sitemap uses getPublishedCatalogSlugsPage.
export async function getPublishedCatalogSlugs(): Promise<{ category: string; product: string }[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('catalog_products')
    .select('slug, category_slug')
    .eq('status', 'published')
    .not('category_slug', 'is', null)
    .not('category_slug', 'in', `(${NATURAL_CATEGORY_SLUGS.join(',')})`)
    .limit(1000)
  return (data ?? []).map((r) => ({ category: r.category_slug as string, product: r.slug as string }))
}

// One bounded, ordered page of published product slugs for the sharded sitemap.
// Uses the SAME filter as getPublishedCatalogProductCount (published, non-natural,
// null-category included) so shard math and pagination line up exactly — no
// dropped URLs, no empty middle shard. Null-category products map to /catalog/all.
// `limit` should be <= 1000 (PostgREST's max-rows) so a single request fills it.
// Ordered by id so range() windows are stable across the whole catalog.
export async function getPublishedCatalogSlugsPage(
  offset: number,
  limit: number,
): Promise<{ category: string; product: string }[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('catalog_products')
    .select('slug, category_slug')
    .eq('status', 'published')
    .or(EXCLUDE_NATURAL_OR)
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)
  return (data ?? []).map((r) => ({
    category: (r.category_slug as string | null) ?? 'all',
    product: r.slug as string,
  }))
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
  const products = ((data ?? []) as CatalogProduct[]).filter(isPublicListableProduct)
  return { products, total: count ?? 0 }
}

// Public catalog search (?q=) — matches published shop products by Ukrainian or
// Russian name. Searching the `name` (Russian supplier feed) column as well lets
// customers find items before a Ukrainian translation is written. Natural food
// products are excluded (they live under /products), metal stays included.
// Escape PostgREST ilike wildcards / separators so user input can't broaden the
// match, and split into up to 6 tokens for AND-combined matching.
function searchTokens(term: string): string[] {
  return term
    .replace(/[%_,()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6)
}

// Common Ukrainian/Russian inflectional endings (longest first). Stripping them
// gives a stem so a CATEGORY-name ilike matches across cases/plurals, e.g.
// "скутеров"/"скутеры" → "скутер" (matches "На скутери"). Used ONLY for the
// isolated category-name lookup below — the product text search keeps raw tokens
// so its proven behaviour is unchanged.
const SLAVIC_ENDINGS = ['ами', 'ями', 'ах', 'ях', 'ов', 'ів', 'ей', 'ом', 'ем', 'и', 'ы', 'і', 'ї', 'а', 'я', 'у', 'ю', 'е', 'є', 'й', 'ь']

function stemToken(tok: string): string {
  const t = tok.toLowerCase()
  if (t.length <= 4 || /\d/.test(t) || !/[а-яіїєґё]/i.test(t)) return t
  for (const e of SLAVIC_ENDINGS) {
    if (t.endsWith(e) && t.length - e.length >= 4) return t.slice(0, t.length - e.length)
  }
  return t
}

// Strip chars that would break a PostgREST .or() ilike pattern.
const sanitizeIlike = (s: string) => s.replace(/[%,()]/g, '')

// Resolve a query to published category slugs by matching category name/slug/meta.
// Isolated + self-guarded: returns [] on ANY error (never throws into the caller),
// so a category-lookup failure can never take down the product search. Uses only
// simple .or() ilike clauses (NO nested in.() inside .or) and a plain .in() —
// the shapes that broke PR #48 are deliberately avoided.
async function findCategorySlugsForQuery(
  client: NonNullable<ReturnType<typeof getClient>>,
  tokens: string[],
): Promise<string[]> {
  const stems = [...new Set(tokens.map(stemToken).map(sanitizeIlike).filter((s) => s.length >= 3))]
  if (stems.length === 0) return []
  const slugs = new Set<string>()

  try {
    const catOr: string[] = []
    for (const s of stems) {
      catOr.push(`name_ua.ilike.%${s}%`, `slug.ilike.%${s}%`, `meta_title.ilike.%${s}%`, `meta_description.ilike.%${s}%`)
    }
    const { data, error } = await client
      .from('catalog_categories')
      .select('slug')
      .eq('is_published', true)
      .or(catOr.join(','))
      .limit(40)
    if (error) {
      console.warn(`[search] category name lookup error: ${error.message}`)
    } else {
      for (const c of (data ?? []) as { slug: string | null }[]) if (c.slug) slugs.add(c.slug)
    }
  } catch (e) {
    console.warn(`[search] category name lookup threw: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Best-effort: supplier_categories (original, often Russian names) → linked
  // published catalog slug. Silently skipped if not readable by the anon role.
  try {
    const supOr: string[] = []
    for (const s of stems) supOr.push(`name.ilike.%${s}%`, `name_ua.ilike.%${s}%`)
    const { data: sup, error } = await client
      .from('supplier_categories')
      .select('id, supplier_id')
      .or(supOr.join(','))
      .limit(80)
    if (!error && sup && sup.length) {
      const keys = new Set<string>()
      for (const r of sup as { id: string | number; supplier_id: string | number | null }[]) {
        if (r.supplier_id != null) keys.add(String(r.supplier_id))
        keys.add(String(r.id))
      }
      if (keys.size) {
        const { data: linked } = await client
          .from('catalog_categories')
          .select('slug')
          .eq('is_published', true)
          .in('supplier_category_id', [...keys])
          .limit(40)
        for (const c of (linked ?? []) as { slug: string | null }[]) if (c.slug) slugs.add(c.slug)
      }
    }
  } catch { /* supplier_categories not public — catalog_categories match is enough */ }

  return [...slugs].slice(0, 30)
}

export async function searchPublishedCatalogProducts(
  q: string,
  page = 1,
  sort: CatalogSort = 'featured',
): Promise<{ products: CatalogProduct[]; total: number }> {
  const client = getClient()
  const term = q.trim()
  if (!client || !term) return { products: [], total: 0 }
  const tokens = searchTokens(term)
  if (tokens.length === 0) return { products: [], total: 0 }
  const from = (page - 1) * CATALOG_PAGE_SIZE
  const to = from + CATALOG_PAGE_SIZE - 1

  // Each token must appear (AND) in at least one of name_ua (Ukrainian), name
  // (Russian supplier feed) or supplier_sku (product code) — so multi-word and
  // reordered queries match, across both languages and by SKU. Multiple .or()
  // calls AND together in PostgREST. NO count:'exact' — the caller paginates by
  // page length, so a full COUNT over the match set would be pure wasted work.
  // Requires the pg_trgm GIN indexes (migration 20260630) to stay fast at 105k.
  // ── (a) Proven product text/SKU search — RAW tokens, UNCHANGED behaviour ─────
  // Each token must appear (AND) in name_ua / name (RU supplier) / supplier_sku /
  // category_slug. This is the exact query that worked before; the category-intent
  // step below is layered on SEPARATELY so it can never break this path.
  let base = client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .or(EXCLUDE_NATURAL_OR)
  for (const tok of tokens) {
    base = base.or(`name_ua.ilike.%${tok}%,name.ilike.%${tok}%,supplier_sku.ilike.%${tok}%,category_slug.ilike.%${tok}%`)
  }
  const textRes = await applyCatalogSort(base, sort).range(from, to)
  if (textRes.error) console.warn(`[search] product text query failed for "${term}": ${textRes.error.message}`)
  const textProducts = (textRes.data ?? []) as CatalogProduct[]

  // ── (b+c) Category intent — resolved + fetched SEPARATELY via a plain .in() ──
  // No category_slug.in(...) is ever injected into the .or() groups above (that
  // was the PR #48 regression). If anything here fails, the text results stand.
  let catProducts: CatalogProduct[] = []
  try {
    const matchedSlugs = await findCategorySlugsForQuery(client, tokens)
    if (matchedSlugs.length > 0) {
      const catBase = client
        .from('catalog_products')
        .select('*')
        .eq('status', 'published')
        .or(EXCLUDE_NATURAL_OR)
        .in('category_slug', matchedSlugs)
      const catRes = await applyCatalogSort(catBase, sort).range(from, to)
      if (catRes.error) console.warn(`[search] category products query failed for "${term}": ${catRes.error.message}`)
      else catProducts = (catRes.data ?? []) as CatalogProduct[]
    }
  } catch (e) {
    console.warn(`[search] category intent failed for "${term}": ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── (d) Merge: category matches first, dedup by id, keep only listable ───────
  const seen = new Set<string>()
  const products: CatalogProduct[] = []
  for (const p of [...catProducts, ...textProducts]) {
    if (seen.has(p.id) || !isPublicListableProduct(p)) continue
    seen.add(p.id)
    products.push(p)
    if (products.length >= CATALOG_PAGE_SIZE) break
  }
  // total is unknown without a count; report the page length so callers that
  // only need "is there a full page → maybe a next page" keep working.
  return { products, total: products.length }
}

export interface CatalogSuggestion {
  slug: string
  categorySlug: string | null
  name: string
  image: string | null
  price: string | null
  sku: string | null
}

// Lightweight typeahead for the search box. Bounded (limit), no count, minimal
// columns — safe per keystroke ONLY with the pg_trgm indexes in place. A short
// query is rejected to avoid matching a huge slice of the catalog.
export async function suggestCatalogProducts(q: string, limit = 8): Promise<CatalogSuggestion[]> {
  const client = getClient()
  const term = q.trim()
  if (!client || term.length < 2) return []
  const tokens = searchTokens(term)
  if (tokens.length === 0) return []
  const SUGGEST_COLS = 'slug, category_slug, name_ua, name, main_image_url, images, price_uah, price_prefix, unit_label, is_price_suspicious, supplier_sku'
  const over = Math.min(Math.max(limit * 3, limit), 30)

  // ── Proven text/SKU suggest — RAW tokens, UNCHANGED behaviour ────────────────
  let base = client
    .from('catalog_products')
    .select(SUGGEST_COLS)
    .eq('status', 'published')
    .or(EXCLUDE_NATURAL_OR)
  for (const tok of tokens) {
    base = base.or(`name_ua.ilike.%${tok}%,name.ilike.%${tok}%,supplier_sku.ilike.%${tok}%`)
  }
  const textRes = await base.order('is_featured', { ascending: false }).limit(over)
  if (textRes.error) console.warn(`[suggest] text query failed for "${term}": ${textRes.error.message}`)
  const textRows = (textRes.data ?? []) as unknown as CatalogProduct[]

  // ── Category intent — SEPARATE .in() query, prepended so "скутер" suggests ───
  // scooter-category products instead of []. Fully guarded — failure = text only.
  let catRows: CatalogProduct[] = []
  try {
    const matchedSlugs = await findCategorySlugsForQuery(client, tokens)
    if (matchedSlugs.length > 0) {
      const catRes = await client
        .from('catalog_products')
        .select(SUGGEST_COLS)
        .eq('status', 'published')
        .or(EXCLUDE_NATURAL_OR)
        .in('category_slug', matchedSlugs)
        .order('is_featured', { ascending: false })
        .limit(over)
      if (catRes.error) console.warn(`[suggest] category query failed for "${term}": ${catRes.error.message}`)
      else catRows = (catRes.data ?? []) as unknown as CatalogProduct[]
    }
  } catch (e) {
    console.warn(`[suggest] category intent failed for "${term}": ${e instanceof Error ? e.message : String(e)}`)
  }

  // Merge category-first, dedup by slug, keep only listable, slice to limit.
  const seen = new Set<string>()
  const rows: CatalogProduct[] = []
  for (const p of [...catRows, ...textRows]) {
    if (seen.has(p.slug) || !isPublicListableProduct(p)) continue
    seen.add(p.slug)
    rows.push(p)
    if (rows.length >= limit) break
  }
  return rows.map((p) => ({
    slug: p.slug,
    categorySlug: p.category_slug ?? null,
    name: displayProductName(p),
    image: getCatalogProductImage(p),
    price: formatCatalogPrice(p),
    sku: p.supplier_sku ?? null,
  }))
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
