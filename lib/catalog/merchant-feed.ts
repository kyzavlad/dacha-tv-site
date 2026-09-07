export const MERCHANT_FEED_ORIGIN = 'https://dachatv.com'
export const MERCHANT_INITIAL_FEED_LIMIT = 500

// Temporary Merchant-only validation quarantine.
// These are the 30 catalog IDs Google Merchant Center reported as disapproved
// on 2026-09-07 (28 image-quality/retrieval issues + 2 vehicle-policy flags).
// The storefront/catalog rows remain untouched. Keeping this list after the
// deterministic 500-row DB selection prevents unreviewed replacement products
// from silently entering the current validation batch.
export const MERCHANT_VALIDATION_QUARANTINE_IDS = [
  '009240d2-614b-4b18-bc58-63c510592ddf',
  '009ac0ff-7d73-44d5-87ae-1807d6644be6',
  '00cd03ad-337b-484f-88ff-6f458728e46f',
  '00cf4758-37ec-4ff8-8635-5f89835297d5',
  '010a7a8a-f8bb-4b32-83ee-1031fedeb722',
  '0111152c-daf1-48ff-a8e2-d95e00c42be8',
  '01120f06-97b4-4b06-8401-f674a5f61fb8',
  '0137f4af-1475-4c61-8364-b2a96ed1832e',
  '015399bd-4fb8-4526-b426-bcfb28145722',
  '01b4d96c-fbdd-434e-9676-15bc74f65aa6',
  '01bc5b27-850c-4efc-9a43-ddd8f487ce33',
  '0254ff2d-0de4-4f26-92ea-fbf003ee181a',
  '029cb767-958f-4fde-94b2-9b42a8197357',
  '02c06a25-4ef0-47c3-b06a-bc99723e8019',
  '02d065ec-f88f-471a-abfa-0554dc4dffa0',
  '0308d489-c79b-42a0-a429-3be21e4751c0',
  '031bf552-bfaa-4208-80e1-47b1a90fc9c6',
  '036823f9-f619-4f80-a038-5dcc9a78c1f7',
  '0389e264-adea-47cb-ad24-d0341e71eb0b',
  '039cdd96-3210-46ba-ba78-517b85a9d148',
  '03b7357c-7b35-4381-9eee-c786ae360cc1',
  '03d58ccd-d768-4170-87a7-394e75dd7454',
  '0410c11d-d4c7-4470-b8c6-7b36ccedc715',
  '04588cf6-0e84-41b4-947e-d202d06698d6',
  '0462103c-fa28-4276-b32d-6f4ac0a0270c',
  '048007db-31ab-4b15-b441-bf0a8a3c0b11',
  '04853be4-67fb-428c-b339-a1312598057b',
  '0488fd69-5b9f-43bd-9d14-915d9b4936ac',
  '04a34394-3cea-4272-972c-cec3e1bd40cc',
  '04ada85e-9b52-407b-a63f-6182a67b2df5',
] as const

const MERCHANT_VALIDATION_QUARANTINE_ID_SET: ReadonlySet<string> = new Set(
  MERCHANT_VALIDATION_QUARANTINE_IDS,
)

export function isMerchantValidationQuarantined(id: string | null | undefined): boolean {
  return MERCHANT_VALIDATION_QUARANTINE_ID_SET.has(String(id ?? '').trim())
}

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
