import { createClient } from '@supabase/supabase-js'
import type { CatalogProduct } from '@/types'
import {
  adsReadinessTier,
  CATALOG_PAGE_SIZE,
  displayProductName,
  formatCatalogPrice,
  getCatalogProductImage,
  isPublicListableProduct,
  MIN_VALID_PRICE_UAH,
  STOREFRONT_SCOPE_OR,
  type CatalogSort,
  type RelevanceBucket,
} from '@/lib/supabase/catalog'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

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

function searchTokens(term: string): string[] {
  return term
    .replace(/[%_,()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6)
}

const SLAVIC_ENDINGS = ['ами', 'ями', 'ах', 'ях', 'ов', 'ів', 'ей', 'ом', 'ем', 'и', 'ы', 'і', 'ї', 'а', 'я', 'у', 'ю', 'е', 'є', 'й', 'ь']

function stemToken(tok: string): string {
  const t = tok.toLowerCase()
  if (t.length <= 4 || /\d/.test(t) || !/[а-яіїєґё]/i.test(t)) return t
  for (const e of SLAVIC_ENDINGS) {
    if (t.endsWith(e) && t.length - e.length >= 4) return t.slice(0, t.length - e.length)
  }
  return t
}

const sanitizeIlike = (s: string) => s.replace(/[%,()]/g, '')

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
  } catch {
    // supplier_categories may not be readable by anon; catalog_categories is enough.
  }

  return [...slugs].slice(0, 30)
}

const normalizeCompactSku = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

function looksLikeSku(q: string): boolean {
  const t = q.trim()
  if (!t || /\s/.test(t)) return false
  const c = normalizeCompactSku(t)
  return c.length >= 3 && c.length <= 24 && /\d/.test(c)
}

async function findProductsBySku(
  client: NonNullable<ReturnType<typeof getClient>>,
  rawQuery: string,
  limit = 200,
): Promise<CatalogProduct[]> {
  const raw = sanitizeIlike(rawQuery.trim().toUpperCase())
  const compact = normalizeCompactSku(rawQuery)
  const digitRuns = compact.match(/\d{3,}/g) ?? []
  const anchors = [...new Set([compact, raw, ...digitRuns].filter((a) => a && a.length >= 3))]
  if (anchors.length === 0) return []

  try {
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
    const results = rows.filter((p) => {
      const skuC = normalizeCompactSku(p.supplier_sku ?? '')
      if (!skuC) return false
      return skuC === compact || skuC.includes(compact) || compact.includes(skuC)
    })
    console.warn(`[sku] q="${rawQuery}" compact="${compact}" anchors=${JSON.stringify(anchors)} candidates=${rows.length} results=${results.length}`)
    return results
  } catch (e) {
    console.warn(`[sku] threw q="${rawQuery}" compact="${compact}": ${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}

function directTokenMatch(p: CatalogProduct, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const ruName = (p as { name?: string | null }).name ?? ''
  const hay = `${p.name_ua ?? ''} ${ruName} ${p.supplier_sku ?? ''}`.toLowerCase()
  return tokens.every((t) => hay.includes(t.toLowerCase()))
}

interface RankEntry { product: CatalogProduct; bucket: RelevanceBucket }
interface RankedEntry extends RankEntry { tier: number; i: number }

function rankByRelevanceThenAds(entries: RankEntry[]): RankedEntry[] {
  return entries
    .map((e, i) => ({ ...e, i, tier: e.bucket === 0 ? 0 : adsReadinessTier(e.product) }))
    .sort((a, b) => a.bucket - b.bucket || a.tier - b.tier || a.i - b.i)
}

function debugLogRanking(term: string, ranked: RankedEntry[]): void {
  if (process.env.CATALOG_SEARCH_DEBUG !== '1') return
  const rows = ranked.slice(0, 15).map(({ product: p, bucket, tier }) => ({
    sku: p.supplier_sku ?? null,
    name: displayProductName(p),
    price: formatCatalogPrice(p),
    image: !!getCatalogProductImage(p),
    bucket,
    tier,
  }))
  console.log(`[catalog-search] q="${term}" ranked=${ranked.length}`, JSON.stringify(rows))
}

/**
 * Split a page-size+1 result window. The lookahead row is only a pagination
 * signal and is never allowed into the visible/ranked current-page pool.
 */
export function splitSearchLookahead<T>(rows: T[], pageSize = CATALOG_PAGE_SIZE): { rows: T[]; hasNext: boolean } {
  return {
    rows: rows.slice(0, pageSize),
    hasNext: rows.length > pageSize,
  }
}

/**
 * Production public catalog search with bounded pagination.
 *
 * The former path requested PostgREST count:'exact', which made PostgREST run a
 * second full matching branch and repeatedly hit the production statement
 * timeout on common queries. This path deliberately has NO global COUNT: every
 * result branch requests at most pageSize+1 rows and returns an explicit hasNext.
 */
export async function searchPublishedCatalogProductsFast(
  q: string,
  page = 1,
  sort: CatalogSort = 'featured',
  buyable = false,
  withImage = false,
): Promise<{ products: CatalogProduct[]; hasNext: boolean }> {
  const client = getClient()
  const term = q.trim()
  if (!client || !term) return { products: [], hasNext: false }
  const tokens = searchTokens(term)
  if (tokens.length === 0) return { products: [], hasNext: false }

  const from = (page - 1) * CATALOG_PAGE_SIZE
  // Supabase range() is inclusive: from + PAGE_SIZE fetches PAGE_SIZE + 1 rows.
  const lookaheadTo = from + CATALOG_PAGE_SIZE

  let base = client
    .from('catalog_products')
    .select('*')
    .eq('status', 'published')
    .or(STOREFRONT_SCOPE_OR)
  for (const tok of tokens) {
    base = base.or(`name_ua.ilike.%${tok}%,name.ilike.%${tok}%,supplier_sku.ilike.%${tok}%,category_slug.ilike.%${tok}%`)
  }
  if (buyable) base = base.gte('price_uah', MIN_VALID_PRICE_UAH).not('is_price_suspicious', 'is', true)
  if (withImage) base = base.or('main_image_url.not.is.null,images.not.is.null')

  const textRes = await applyCatalogSort(base, sort).range(from, lookaheadTo)
  if (textRes.error) {
    console.warn(`[search] product text query failed for "${term}": ${textRes.error.message}`)
    throw new Error(`catalog search query failed: ${textRes.error.message}`)
  }
  const textPage = splitSearchLookahead((textRes.data ?? []) as CatalogProduct[])

  let catProducts: CatalogProduct[] = []
  let catHasNext = false
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
      const catRes = await applyCatalogSort(catBase, sort).range(from, lookaheadTo)
      if (catRes.error) {
        console.warn(`[search] category products query failed for "${term}": ${catRes.error.message}`)
      } else {
        const catPage = splitSearchLookahead((catRes.data ?? []) as CatalogProduct[])
        catProducts = catPage.rows
        catHasNext = catPage.hasNext
      }
    }
  } catch (e) {
    console.warn(`[search] category intent failed for "${term}": ${e instanceof Error ? e.message : String(e)}`)
  }

  let skuProducts: CatalogProduct[] = []
  if (page === 1 && looksLikeSku(term)) {
    skuProducts = await findProductsBySku(client, term)
  }

  const skuIds = new Set(skuProducts.map((p) => p.id))
  const catIds = new Set(catProducts.map((p) => p.id))
  const seen = new Set<string>()
  const entries: RankEntry[] = []

  for (const p of [...skuProducts, ...catProducts, ...textPage.rows]) {
    if (seen.has(p.id) || !isPublicListableProduct(p)) continue
    seen.add(p.id)
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
  debugLogRanking(term, ranked)

  // A merged pool can itself contain more than one visible page even when each
  // individual branch did not need its lookahead row. Keep Next truthful in that
  // case as well, while still rendering only PAGE_SIZE products now.
  const mergedHasNext = ranked.length > CATALOG_PAGE_SIZE
  const products = ranked.slice(0, CATALOG_PAGE_SIZE).map((e) => e.product)
  const hasNext = textPage.hasNext || catHasNext || mergedHasNext

  return { products, hasNext }
}
