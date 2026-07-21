import { createClient } from '@supabase/supabase-js'
import type { CatalogCategory, CatalogProduct, CatalogImageMeta } from '@/types'
import { resolveImageEntries, primaryImageAlt } from '@/lib/catalog/image-metadata'

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
export const NATURAL_CATEGORY_SLUGS = ['naturalni-produkty', 'zhyvi-olii-holodnogo-vidzhymu', 'podarunkovi-nabory']

// The SINGLE reusable storefront-scope filter (item 5). /catalog/all, catalog
// search, the catalog sitemap, related catalog products and catalog totals all
// show the SAME set: supplier rows (including legacy rows whose `source` is NULL)
// plus manual metal-profile products — and nothing else. Every other manual
// product (natural products, cold-pressed oils, gift sets, …) is presented in its
// own section and is excluded here. Source-based (not category-based) so it can
// never leak a non-natural manual row the way the old category filter did.
export const STOREFRONT_SCOPE_OR = `source.eq.supplier,source.is.null,and(source.eq.manual,lead_type.eq.metal)`

// Pure predicate mirror of STOREFRONT_SCOPE_OR for unit tests / in-memory checks.
export function isStorefrontProduct(p: { source?: string | null; lead_type?: string | null }): boolean {
  const src = p.source ?? null
  if (src === 'supplier' || src === null) return true
  return src === 'manual' && p.lead_type === 'metal'
}

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

// Ordered gallery entries WITH alt text for a product. Uses saved image_metadata
// when present; otherwise derives entries from the resolved URL list. Every entry
// gets a non-empty alt (own alt → main_image_alt → localized name fallback).
// `fallbackAlt` should be the localized product name.
export function getCatalogProductImageEntries(
  product: (ImageBearingProduct & { image_metadata?: unknown; main_image_alt?: string | null }) | null | undefined,
  fallbackAlt: string,
): CatalogImageMeta[] {
  return resolveImageEntries({
    imageMetadata: product?.image_metadata,
    urls: getCatalogProductImages(product),
    mainImageAlt: product?.main_image_alt ?? null,
    fallbackAlt,
  })
}

// The alt for a product's single primary image (cards / og:image).
export function getCatalogPrimaryImageAlt(
  product: { image_metadata?: unknown; main_image_alt?: string | null } | null | undefined,
  fallbackAlt: string,
): string {
  return primaryImageAlt({
    imageMetadata: product?.image_metadata,
    mainImageAlt: product?.main_image_alt ?? null,
    fallbackAlt,
  })
}

// ─── Manual / supplier unified price + CTA logic ─────────────────────────────
// A product shows a real price only when it has a valid, non-suspicious price.
export function hasDisplayablePrice(product: CatalogProduct): boolean {
  return hasValidPrice(product.price_uah) && !product.is_price_suspicious
}

// ─── Ads / conversion-readiness ranking ──────────────────────────────────────
// For paid (Google Ads) traffic we surface the most purchasable products first.
// CRITICAL: the "does this product have a price" test MUST use the SAME resolver
// the public API `price` field and the product card use — `formatCatalogPrice`
// (which returns null exactly when there is no displayable price). An earlier
// version keyed off a separate helper, which could disagree with the API/card
// and let price-null products score as "priced". Basing the tier on
// `formatCatalogPrice(p) !== null` makes the tier and the shown price agree by
// construction. Lower tier = higher priority. This is a RE-ORDER ONLY on an
// already-fetched, page-bounded pool — "price on request" products are never
// removed from the catalog, only ranked lower.
export function adsReadinessTier(product: CatalogProduct): number {
  const hasPrice = formatCatalogPrice(product) !== null // same field the card/API show
  const hasImage = !!getCatalogProductImage(product)
  if (hasImage && hasPrice) return 0 // image + real display price — best for ads
  if (hasPrice) return 1             // price only (no image)
  if (hasImage) return 2             // image but "price on request"
  return 3                           // no image and no price — last
}

// Relevance buckets (primary sort key, lower = more relevant):
//   0 exact SKU match · 1 direct name/SKU token match · 2 category-intent match ·
//   3 broad fallback. Within a bucket we sort by adsReadinessTier so purchasable
//   products come first WITHOUT letting a broad, less-relevant product jump above
//   a direct match just because it happens to be priced.
export type RelevanceBucket = 0 | 1 | 2 | 3

// Does the product itself (name_ua / name / supplier_sku — NOT category_slug)
// directly contain every query token? Distinguishes a real product match from a
// row that only matched because its category slug contained the token.
function directTokenMatch(p: CatalogProduct, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  // `name` (RU supplier feed) is present at runtime via select('*') but is not on
  // the CatalogProduct type — read it defensively.
  const ruName = (p as { name?: string | null }).name ?? ''
  const hay = `${p.name_ua ?? ''} ${ruName} ${p.supplier_sku ?? ''}`.toLowerCase()
  return tokens.every((t) => hay.includes(t.toLowerCase()))
}

interface RankEntry { product: CatalogProduct; bucket: number }
interface RankedEntry extends RankEntry { tier: number; i: number }

// Stable sort by (relevance bucket, ads tier, original order). Pure, no fetch.
// Bucket 0 (exact SKU) is deliberately NOT ads-tiered — an exact code lookup like
// N-270997 must return the exact product first, in the SKU resolver's own order,
// regardless of whether it happens to be "price on request".
function rankByRelevanceThenAds(entries: RankEntry[]): RankedEntry[] {
  return entries
    .map((e, i) => ({ ...e, i, tier: e.bucket === 0 ? 0 : adsReadinessTier(e.product) }))
    .sort((a, b) => a.bucket - b.bucket || a.tier - b.tier || a.i - b.i)
}

// Opt-in per-item ranking diagnostics for search/suggest. Enable in prod with
// CATALOG_SEARCH_DEBUG=1 to log why the top results ordered the way they did:
// sku, name, resolved display price (the same value the API returns), whether an
// image resolves, the relevance bucket, and the ads tier.
function debugLogRanking(where: string, term: string, ranked: RankedEntry[]): void {
  if (process.env.CATALOG_SEARCH_DEBUG !== '1') return
  const rows = ranked.slice(0, 15).map(({ product: p, bucket, tier }) => ({
    sku: p.supplier_sku ?? null,
    name: displayProductName(p),
    price: formatCatalogPrice(p),
    image: !!getCatalogProductImage(p),
    bucket,
    tier,
  }))
  console.log(`[${where}] q="${term}" ranked=${ranked.length}`, JSON.stringify(rows))
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
  // Drop technical/slug-like names AND manual Dacha TV product categories (honey,
  // natural products, oils, gift sets, bee products) — those live on /products,
  // not in the supplier shop. Filtering by source (not is_published) keeps them
  // off /catalog even if a "publish all categories" run flips their published
  // flag. The one manual category that DOES belong in /catalog is the metal
  // profile category, so it is explicitly kept.
  const usable = rows.filter(
    (c) =>
      !isUnusableCategoryName(c.name_ua) &&
      !(c.source === 'manual' && c.slug !== METAL_CATEGORY_SLUG),
  )
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
  // Optional "Тільки з ціною" filter: keep only products with a real, non-
  // suspicious price (mirrors hasDisplayablePrice at the DB level so pagination
  // counts stay correct). Off by default — behaviour is unchanged.
  buyable = false,
  // Optional "Тільки з фото" filter: keep only products with an image source
  // (main_image_url OR the images[] jsonb — the same sources the card resolves).
  withImage = false,
): Promise<{ products: CatalogProduct[]; total: number }> {
  const client = getClient()
  if (!client) return { products: [], total: 0 }
  const from = (page - 1) * CATALOG_PAGE_SIZE
  const to = from + CATALOG_PAGE_SIZE - 1
  let base = client
    .from('catalog_products')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .eq('category_slug', categorySlug)
  if (buyable) {
    base = base.gte('price_uah', MIN_VALID_PRICE_UAH).not('is_price_suspicious', 'is', true)
  }
  if (withImage) {
    base = base.or('main_image_url.not.is.null,images.not.is.null')
  }
  const { data, count } = await applyCatalogSort(base, sort).range(from, to)
  const products = ((data ?? []) as CatalogProduct[]).filter(isPublicListableProduct)
  return { products, total: count ?? 0 }
}

const SCOOTER_MATCH_COLUMNS = ['name_ua', 'name'] as const
const MAX_SCOOTER_FILTER_PREDICATES = 24
const MAX_SCOOTER_FILTER_LENGTH = 2048

// Config patterns may contain `%` as an intentional separator wildcard. Commas
// and parentheses are always removed because they are PostgREST OR grammar.
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

// ─── Scooter model landing fetch (strict) ────────────────────────────────────
// Products in the scooter category that (a) pass the buyable rule, (b) have an
// image, and (c) match at least one compact MODEL pattern in a title field
// (name_ua / name) — never merely the brand word. `modTokens` narrows further to a
// specific modification. Paginated with an exact count so a landing paginates
// like a normal category. Powers /moto/skutery/[model]; no hardcoded id lists.
export async function getScooterModelProducts(
  categorySlug: string,
  modelTokens: string[],
  page: number,
  modTokens?: string[],
): Promise<{ products: CatalogProduct[]; hasNext: boolean }> {
  const client = getClient()
  if (!client) return { products: [], hasNext: false }

  const modelFilter = buildScooterOrClause(modelTokens)
  if (!modelFilter.clause) return { products: [], hasNext: false }

  // Fetch one extra row (page size + 1) ONLY to decide hasNext — no exact count.
  // count:'exact' scanned the whole matching set on every paid-traffic request
  // and hit the production statement timeout (57014) on a cold DB/cache; the
  // lookahead keeps the query to a bounded LIMIT.
  const from = (page - 1) * CATALOG_PAGE_SIZE
  const to = from + CATALOG_PAGE_SIZE // inclusive range → CATALOG_PAGE_SIZE + 1 rows
  let base = client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .eq('category_slug', categorySlug)
    // buyable rule (mirrors the catalog "Тільки з ціною" filter)
    .gte('price_uah', MIN_VALID_PRICE_UAH)
    .not('is_price_suspicious', 'is', true)
    // Require a real primary image. `images.not.is.null` (the old check) also
    // matched an empty jsonb array `[]`, letting image-less products into the
    // count while the card rendered a placeholder — a count/display mismatch. A
    // non-empty main_image_url is the always-resolvable primary source and keeps
    // the DB count equal to what is shown (images[]-only edge cases are excluded
    // on purpose for landing quality).
    .not('main_image_url', 'is', null)
    .neq('main_image_url', '')
    // strict model match — separate .or() group AND-combined with the above
    .or(modelFilter.clause)

  const modFilter = modTokens?.length ? buildScooterOrClause(modTokens) : null
  if (modFilter?.clause) base = base.or(modFilter.clause)

  const { data, error } = await base
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('name_ua', { ascending: true })
    .range(from, to)
  // Never mask a DB/PostgREST failure as a valid empty result — surface it so it
  // is visible in logs and renders an error state, not a misleading "0 products".
  if (error) {
    console.warn('[scooter-landing] query failed', {
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
    throw new Error(`scooter landing query failed: ${error.message}`)
  }
  const rows = (data ?? []) as CatalogProduct[]
  // The extra (page size + 1) row only signals a next page — it is never shown.
  const hasNext = rows.length > CATALOG_PAGE_SIZE
  const products = rows.slice(0, CATALOG_PAGE_SIZE).filter(isPublicListableProduct)
  return { products, hasNext }
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
  // Over-fetch a bounded pool so the rail stays full after garbage rows are
  // filtered AND so ads-readiness ranking has enough purchasable candidates to
  // choose from. Still a small, server-side-limited window — never the full set.
  const { data } = await client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .eq('category_slug', categorySlug)
    .neq('slug', excludeSlug)
    .or(STOREFRONT_SCOPE_OR)   // same storefront scope as /catalog/all
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .limit(limit * 8)
  const pool = ((data ?? []) as CatalogProduct[]).filter(isPublicListableProduct)
  // Ads-readiness ranking (see adsReadinessTier): show image + real-price products
  // first in the related rail (best for ad conversions); "price on request" items
  // remain eligible, just lower. Related is a single category, so relevance is
  // uniform — use bucket 1 (a tier-sorted bucket; bucket 0 is reserved for exact
  // SKU and is intentionally NOT tier-sorted) so the rail orders purely by ads
  // tier, using the SAME price resolver the card/API use.
  const ranked = rankByRelevanceThenAds(pool.map((product) => ({ product, bucket: 1 })))
  return ranked.slice(0, limit).map((e) => e.product)
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
    .or(STOREFRONT_SCOPE_OR)
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
    .or(STOREFRONT_SCOPE_OR)
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
    .or(STOREFRONT_SCOPE_OR)
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

// Alphanumeric-normalized code: uppercase, drop hyphens/spaces/punctuation.
// "N-270997" / "N270997" / "n 270997" → "N270997".
const normalizeCompactSku = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

// A query is "SKU-like" when it is a single token whose compact form is a short
// alphanumeric code containing a digit (N-270997, N270997, A-845, R-4147).
function looksLikeSku(q: string): boolean {
  const t = q.trim()
  if (!t || /\s/.test(t)) return false
  const c = normalizeCompactSku(t)
  return c.length >= 3 && c.length <= 24 && /\d/.test(c)
}

// Exact-ish SKU/article lookup that is hyphen/space/case-insensitive. The stored
// supplier_sku may be hyphenated ("N-270997") or compact ("N270997") and the user
// may type either — plain ilike.%N-270997% can't bridge that. So we fetch a broad
// candidate set with ilike anchors (compact + raw + longest digit run — the digit
// run is contiguous in BOTH stored forms) and then keep only rows whose normalized
// SKU matches the normalized query. Uses only .or() ilike + a top-level filter —
// never the category_slug.in(...)-in-.or() shape that broke PR #48. Never throws.
async function findProductsBySku(
  client: NonNullable<ReturnType<typeof getClient>>,
  rawQuery: string,
  limit = 200,
): Promise<CatalogProduct[]> {
  const raw = sanitizeIlike(rawQuery.trim().toUpperCase())
  const compact = normalizeCompactSku(rawQuery)
  // Every 3+ digit run (not just the longest) — the numeric part of a code is the
  // most stable anchor across "N-270997" / "N270997" / "N-270-997" storage.
  const digitRuns = compact.match(/\d{3,}/g) ?? []
  const anchors = [...new Set([compact, raw, ...digitRuns].filter((a) => a && a.length >= 3))]
  if (anchors.length === 0) return []
  try {
    // Reuse the PROVEN suggest/search field shape: match each anchor against
    // supplier_sku AND name_ua/name. A supplier code very often also lives in the
    // product name, so a supplier_sku-only query (PR #51) missed rows that the
    // multi-field suggest query finds. Only .or() ilike — no category_slug.in().
    const orClause = anchors
      .flatMap((a) => [`supplier_sku.ilike.%${a}%`, `name_ua.ilike.%${a}%`, `name.ilike.%${a}%`])
      .join(',')
    const { data, error } = await client
      .from('catalog_products')
      .select('*')
      .eq('status', 'published')
      .or(STOREFRONT_SCOPE_OR)
      .or(orClause)
      .limit(limit)
    if (error) {
      console.warn(`[sku] query error q="${rawQuery}" compact="${compact}" anchors=${JSON.stringify(anchors)}: ${error.message}`)
      return []
    }
    const rows = (data ?? []) as CatalogProduct[]
    // Precision filter: keep only rows whose NORMALIZED supplier_sku matches the
    // normalized query — so multi-field candidates are pruned to true SKU hits.
    const results = rows.filter((p) => {
      const skuC = normalizeCompactSku(p.supplier_sku ?? '')
      if (!skuC) return false
      return skuC === compact || skuC.includes(compact) || compact.includes(skuC)
    })
    // Temporary diagnostics (Vercel logs): shows why a SKU lookup did/didn't hit.
    console.warn(`[sku] q="${rawQuery}" compact="${compact}" anchors=${JSON.stringify(anchors)} candidates=${rows.length} results=${results.length}`)
    return results
  } catch (e) {
    console.warn(`[sku] threw q="${rawQuery}" compact="${compact}": ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

export async function searchPublishedCatalogProducts(
  q: string,
  page = 1,
  sort: CatalogSort = 'featured',
  // Optional "Тільки з ціною" filter — narrows the text + category matches to
  // products with a real, non-suspicious price. Exact-SKU matches are left
  // unfiltered so a precise code always surfaces. Off by default.
  buyable = false,
  // Optional "Тільки з фото" filter — narrows text + category matches to rows
  // with an image source (main_image_url OR images[]). SKU matches unfiltered.
  withImage = false,
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
  // count:'exact' returns the size of the text-match set in the SAME ranged
  // request (via the Content-Range header — no extra round-trip). This is the
  // authoritative "how many products match your search" figure that drives the
  // result-count + numbered pagination. The merged SKU/category branches below
  // only re-rank/supplement a page, so a page-full heuristic still governs the
  // Next link; see the returned `total` note.
  let base = client
    .from('catalog_products')
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .or(STOREFRONT_SCOPE_OR)
  for (const tok of tokens) {
    base = base.or(`name_ua.ilike.%${tok}%,name.ilike.%${tok}%,supplier_sku.ilike.%${tok}%,category_slug.ilike.%${tok}%`)
  }
  if (buyable) base = base.gte('price_uah', MIN_VALID_PRICE_UAH).not('is_price_suspicious', 'is', true)
  if (withImage) base = base.or('main_image_url.not.is.null,images.not.is.null')
  const textRes = await applyCatalogSort(base, sort).range(from, to)
  if (textRes.error) console.warn(`[search] product text query failed for "${term}": ${textRes.error.message}`)
  const textProducts = (textRes.data ?? []) as CatalogProduct[]
  const textCount = textRes.count ?? null

  // ── (b+c) Category intent — resolved + fetched SEPARATELY via a plain .in() ──
  // No category_slug.in(...) is ever injected into the .or() groups above (that
  // was the PR #48 regression). If anything here fails, the text results stand.
  let catProducts: CatalogProduct[] = []
  try {
    const matchedSlugs = await findCategorySlugsForQuery(client, tokens)
    if (matchedSlugs.length > 0) {
      let catBase = client
        .from('catalog_products')
        .select('*')
        .eq('status', 'published')
        .or(STOREFRONT_SCOPE_OR)
        .in('category_slug', matchedSlugs)
      if (buyable) catBase = catBase.gte('price_uah', MIN_VALID_PRICE_UAH).not('is_price_suspicious', 'is', true)
      if (withImage) catBase = catBase.or('main_image_url.not.is.null,images.not.is.null')
      const catRes = await applyCatalogSort(catBase, sort).range(from, to)
      if (catRes.error) console.warn(`[search] category products query failed for "${term}": ${catRes.error.message}`)
      else catProducts = (catRes.data ?? []) as CatalogProduct[]
    }
  } catch (e) {
    console.warn(`[search] category intent failed for "${term}": ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── Exact SKU/article lookup — normalized (hyphen/space/case-insensitive) ────
  // Only for page 1 and SKU-like queries; separate query, merged FIRST so an
  // exact code (N-270997) surfaces even when the stored SKU format differs.
  let skuProducts: CatalogProduct[] = []
  if (page === 1 && looksLikeSku(term)) {
    skuProducts = await findProductsBySku(client, term)
  }

  // ── (d) Merge + rank: relevance bucket first, ads tier within bucket ─────────
  // Dedup by id (SKU → category → text order feeds the stable tiebreaker), assign
  // each product its BEST relevance bucket, then sort by (bucket, ads tier). This
  // keeps exact-SKU matches (N-270997) pinned first and direct name/SKU matches
  // above broad category-only matches, while surfacing purchasable products first
  // WITHIN each bucket — without hiding "price on request" products. Operates only
  // on the already-fetched, page-bounded pool (≤ 3× page size); pagination stays
  // server-side via the range() calls above.
  const skuIds = new Set(skuProducts.map((p) => p.id))
  const catIds = new Set(catProducts.map((p) => p.id))
  const seen = new Set<string>()
  const entries: RankEntry[] = []
  for (const p of [...skuProducts, ...catProducts, ...textProducts]) {
    if (seen.has(p.id) || !isPublicListableProduct(p)) continue
    seen.add(p.id)
    const bucket: RelevanceBucket = skuIds.has(p.id)
      ? 0                                   // exact SKU match
      : directTokenMatch(p, tokens)
        ? 1                                 // direct name/SKU token match
        : catIds.has(p.id)
          ? 2                               // category-intent match
          : 3                               // broad fallback (e.g. category_slug-only)
    entries.push({ product: p, bucket })
  }
  const ranked = rankByRelevanceThenAds(entries)
  debugLogRanking('catalog-search', term, ranked)
  const products = ranked.slice(0, CATALOG_PAGE_SIZE).map((e) => e.product)
  // Report the text-match count as the result total (the meaningful "products
  // found" number, driving the count line + numbered pagination). Floor it at the
  // absolute index through this page so "Показано A–B з X" is never inconsistent;
  // the caller still shows a Next link whenever the page came back full, covering
  // the rare case where category-intent matches extend results past textCount.
  const total = textCount != null ? Math.max(textCount, from + products.length) : products.length
  return { products, total }
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
  const SUGGEST_COLS = 'id, slug, category_slug, name_ua, name, main_image_url, images, price_uah, price_prefix, unit_label, is_price_suspicious, supplier_sku'
  const over = Math.min(Math.max(limit * 3, limit), 30)

  // ── Proven text/SKU suggest — RAW tokens, UNCHANGED behaviour ────────────────
  let base = client
    .from('catalog_products')
    .select(SUGGEST_COLS)
    .eq('status', 'published')
    .or(STOREFRONT_SCOPE_OR)
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
        .or(STOREFRONT_SCOPE_OR)
        .in('category_slug', matchedSlugs)
        .order('is_featured', { ascending: false })
        .limit(over)
      if (catRes.error) console.warn(`[suggest] category query failed for "${term}": ${catRes.error.message}`)
      else catRows = (catRes.data ?? []) as unknown as CatalogProduct[]
    }
  } catch (e) {
    console.warn(`[suggest] category intent failed for "${term}": ${e instanceof Error ? e.message : String(e)}`)
  }

  // Exact SKU/article lookup, normalized — so a full code like N-270997 surfaces
  // in the typeahead even when the stored format differs. Prepended.
  let skuRows: CatalogProduct[] = []
  if (looksLikeSku(term)) {
    skuRows = (await findProductsBySku(client, term, over)) as unknown as CatalogProduct[]
  }

  // Merge + rank exactly like search: relevance bucket first (exact SKU → direct
  // name/SKU token → category-intent → broad), ads tier within each bucket. So
  // the typeahead surfaces relevant, purchasable products first instead of
  // unrelated price-null rows; "price on request" items remain, just lower. Pool
  // is already bounded (≤ 3× over ≈ 90 rows) so this never loads the full catalog.
  const skuIds = new Set(skuRows.map((p) => p.id))
  const catIds = new Set(catRows.map((p) => p.id))
  const seen = new Set<string>()
  const entries: RankEntry[] = []
  for (const p of [...skuRows, ...catRows, ...textRows]) {
    if (seen.has(p.slug) || !isPublicListableProduct(p)) continue
    seen.add(p.slug)
    const bucket: RelevanceBucket = skuIds.has(p.id)
      ? 0
      : directTokenMatch(p, tokens)
        ? 1
        : catIds.has(p.id)
          ? 2
          : 3
    entries.push({ product: p, bucket })
  }
  const ranked = rankByRelevanceThenAds(entries)
  debugLogRanking('catalog-suggest', term, ranked)
  const rows = ranked.slice(0, limit).map((e) => e.product)
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
    .or(STOREFRONT_SCOPE_OR)
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
