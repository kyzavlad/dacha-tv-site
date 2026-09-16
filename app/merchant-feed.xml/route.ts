import { createClient } from '@supabase/supabase-js'
import {
  isMerchantValidationQuarantined,
  renderMerchantRss,
  toMerchantFeedItem,
  type MerchantCatalogRow,
} from '@/lib/catalog/merchant-feed'

export const dynamic = 'force-dynamic'

// PostgREST is configured to return bounded pages. Walk the complete safe
// Merchant candidate set with keyset pagination instead of keeping the old
// 500-item validation cap or relying on OFFSET for a large live catalog.
const MERCHANT_FEED_PAGE_SIZE = 1000
const MERCHANT_FEED_MAX_PAGES = 100

const SELECT_COLUMNS = [
  'id',
  'supplier_sku',
  'name',
  'name_ua',
  'slug',
  'category_slug',
  'short_description',
  'description',
  'description_ua',
  'price_uah',
  'main_image_url',
  'stock_quantity',
  'is_in_stock',
  'inquiry_only',
  'is_price_suspicious',
  'status',
  'source',
  'lead_type',
].join(',')

function getClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET() {
  const client = getClient()
  if (!client) {
    return new Response('Merchant feed unavailable', { status: 503 })
  }

  const selectedRows: MerchantCatalogRow[] = []
  let cursor: string | null = null

  for (let page = 1; page <= MERCHANT_FEED_MAX_PAGES; page += 1) {
    let query = client
      .from('catalog_products')
      .select(SELECT_COLUMNS)
      .eq('status', 'published')
      .eq('source', 'supplier')
      .eq('is_in_stock', true)
      .gt('stock_quantity', 0)
      .eq('inquiry_only', false)
      .eq('is_price_suspicious', false)
      .gte('price_uah', 10)
      .not('slug', 'is', null)
      .not('category_slug', 'is', null)
      .not('main_image_url', 'is', null)

    if (cursor) query = query.gt('id', cursor)

    const { data, error } = await query
      .order('id', { ascending: true })
      .limit(MERCHANT_FEED_PAGE_SIZE)

    if (error) {
      console.error(`[merchant-feed] catalog query failed on page ${page}`, error)
      return new Response('Merchant feed unavailable', { status: 503 })
    }

    const pageRows = (data ?? []) as unknown as MerchantCatalogRow[]
    selectedRows.push(...pageRows)

    if (pageRows.length === 0 || pageRows.length < MERCHANT_FEED_PAGE_SIZE) break

    const lastId = pageRows.at(-1)?.id
    if (!lastId) {
      console.error(`[merchant-feed] page ${page} ended without a product id`)
      return new Response('Merchant feed unavailable', { status: 503 })
    }
    cursor = lastId

    if (page === MERCHANT_FEED_MAX_PAGES) {
      console.error(
        `[merchant-feed] safety overflow after ${MERCHANT_FEED_MAX_PAGES * MERCHANT_FEED_PAGE_SIZE} rows`,
      )
      return new Response('Merchant feed unavailable', { status: 503 })
    }
  }

  // Keep the known Merchant-only quarantine while the historical image/policy
  // cases are re-verified. All other rows have already passed the live catalog
  // price, stock, URL and image safety gates above.
  const validationRows = selectedRows.filter((row) => !isMerchantValidationQuarantined(row.id))
  const quarantinedCount = selectedRows.length - validationRows.length

  const items = validationRows
    .map((row) => toMerchantFeedItem(row))
    .filter((item) => item !== null)

  const xml = renderMerchantRss(items)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=300',
      'X-Merchant-Feed-Selected': String(selectedRows.length),
      'X-Merchant-Feed-Items': String(items.length),
      'X-Merchant-Feed-Quarantined': String(quarantinedCount),
    },
  })
}
