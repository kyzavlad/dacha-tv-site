import { createClient } from '@supabase/supabase-js'
import {
  MERCHANT_INITIAL_FEED_LIMIT,
  renderMerchantRss,
  toMerchantFeedItem,
  type MerchantCatalogRow,
} from '@/lib/catalog/merchant-feed'

export const dynamic = 'force-dynamic'

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

  // Deliberately start with a small, deterministic, high-confidence subset.
  // Free Listings diagnostics should be clean before this cap is raised.
  const { data, error } = await client
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
    .order('id', { ascending: true })
    .limit(MERCHANT_INITIAL_FEED_LIMIT)

  if (error) {
    console.error('[merchant-feed] catalog query failed', error)
    return new Response('Merchant feed unavailable', { status: 503 })
  }

  const items = ((data ?? []) as unknown as MerchantCatalogRow[])
    .map((row) => toMerchantFeedItem(row))
    .filter((item) => item !== null)

  const xml = renderMerchantRss(items)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=300',
      'X-Merchant-Feed-Items': String(items.length),
    },
  })
}
