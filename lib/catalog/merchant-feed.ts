export const MERCHANT_FEED_ORIGIN = 'https://www.dachatv.com'
export const MERCHANT_INITIAL_FEED_LIMIT = 500

export interface MerchantCatalogRow {
  id: string
  supplier_sku?: string | null
  name?: string | null
  name_ua?: string | null
  slug?: string | null
  category_slug?: string | null
  short_description?: string | null
  description?: string | null
  description_ua?: string | null
  price_uah?: number | string | null
  main_image_url?: string | null
  stock_quantity?: number | null
  is_in_stock?: boolean | null
  inquiry_only?: boolean | null
  is_price_suspicious?: boolean | null
  status?: string | null
  source?: string | null
  lead_type?: string | null
}

export interface MerchantFeedItem {
  id: string
  title: string
  description: string
  link: string
  imageLink: string
  price: string
  availability: 'in_stock'
  condition: 'new'
}

function plainText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function absoluteMerchantUrl(value: string | null | undefined, origin = MERCHANT_FEED_ORIGIN): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('/')) return `${origin}${raw}`
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.protocol === 'http:') parsed.protocol = 'https:'
    return parsed.toString()
  } catch {
    return null
  }
}

export function toMerchantFeedItem(row: MerchantCatalogRow, origin = MERCHANT_FEED_ORIGIN): MerchantFeedItem | null {
  if (row.status !== 'published') return null
  if (row.source !== 'supplier') return null
  if (row.is_in_stock !== true || Number(row.stock_quantity ?? 0) <= 0) return null
  if (row.inquiry_only === true || row.lead_type === 'metal' || row.is_price_suspicious === true) return null

  const price = Number(row.price_uah)
  if (!Number.isFinite(price) || price < 10) return null

  const title = plainText(row.name_ua) || plainText(row.name)
  const category = String(row.category_slug ?? '').trim()
  const slug = String(row.slug ?? '').trim()
  const imageLink = absoluteMerchantUrl(row.main_image_url, origin)
  if (!row.id || !title || !category || !slug || !imageLink) return null

  const description =
    plainText(row.short_description) ||
    plainText(row.description_ua) ||
    plainText(row.description) ||
    title

  return {
    id: row.id,
    title: title.slice(0, 150),
    description: description.slice(0, 5000),
    link: `${origin}/catalog/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`,
    imageLink,
    price: `${price.toFixed(2)} UAH`,
    availability: 'in_stock',
    condition: 'new',
  }
}

export function renderMerchantRss(items: MerchantFeedItem[], origin = MERCHANT_FEED_ORIGIN): string {
  const xmlItems = items.map((item) => `    <item>
      <g:id>${xmlEscape(item.id)}</g:id>
      <g:title>${xmlEscape(item.title)}</g:title>
      <g:description>${xmlEscape(item.description)}</g:description>
      <g:link>${xmlEscape(item.link)}</g:link>
      <g:image_link>${xmlEscape(item.imageLink)}</g:image_link>
      <g:availability>${item.availability}</g:availability>
      <g:price>${xmlEscape(item.price)}</g:price>
      <g:condition>${item.condition}</g:condition>
    </item>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Dacha TV</title>
    <link>${xmlEscape(origin)}</link>
    <description>Dacha TV product feed for Google Merchant Center</description>
${xmlItems}
  </channel>
</rss>\n`
}
