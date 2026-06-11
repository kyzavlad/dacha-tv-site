// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any

export type MediaType = 'image' | 'video' | 'youtube'
export type ProductSection = 'honey' | 'apiary' | 'beekeeper' | 'flowers'

export interface ProductMedia {
  id: string
  product_section: ProductSection
  product_id: string
  media_type: MediaType
  url: string
  alt: string | null
  position: number
  is_primary: boolean
  created_at: string
}

export type NewProductMedia = Pick<ProductMedia, 'media_type' | 'url' | 'alt' | 'position' | 'is_primary'>

export async function getProductMedia(
  section: ProductSection,
  productId: string,
  client: DbClient,
): Promise<ProductMedia[]> {
  const { data } = await client
    .from('product_media')
    .select('*')
    .eq('product_section', section)
    .eq('product_id', productId)
    .order('media_type', { ascending: true })
    .order('position', { ascending: true })
  return (data ?? []) as ProductMedia[]
}

export async function saveProductMedia(
  section: ProductSection,
  productId: string,
  items: NewProductMedia[],
  client: DbClient,
): Promise<void> {
  await client
    .from('product_media')
    .delete()
    .eq('product_section', section)
    .eq('product_id', productId)

  if (items.length === 0) return

  await client.from('product_media').insert(
    items.map((item) => ({
      product_section: section,
      product_id: productId,
      media_type: item.media_type,
      url: item.url,
      alt: item.alt ?? null,
      position: item.position,
      is_primary: item.is_primary,
    })),
  )
}

// Parses the MediaManager serialization format from a FormData submitted by a server action.
// Files are uploaded eagerly on selection in MediaManager — only URLs arrive here.
export function parseMediaFromForm(formData: FormData): NewProductMedia[] {
  const items: NewProductMedia[] = []

  // ── Images ──────────────────────────────────────────────────────────────
  const imgCount = Math.min(parseInt((formData.get('img_count') as string) || '0', 10), 30)
  for (let i = 0; i < imgCount; i++) {
    const url = (formData.get(`img_url_${i}`) as string)?.trim() || null
    if (!url) continue
    items.push({
      media_type: 'image',
      url,
      alt: (formData.get(`img_alt_${i}`) as string)?.trim() || null,
      position: i,
      is_primary: formData.get(`img_is_primary_${i}`) === 'true',
    })
  }

  // ── Videos ──────────────────────────────────────────────────────────────
  const vidCount = Math.min(parseInt((formData.get('vid_count') as string) || '0', 10), 5)
  for (let i = 0; i < vidCount; i++) {
    const url = (formData.get(`vid_url_${i}`) as string)?.trim() || null
    if (!url) continue
    items.push({ media_type: 'video', url, alt: null, position: i, is_primary: false })
  }

  // ── YouTube ─────────────────────────────────────────────────────────────
  const ytCount = Math.min(parseInt((formData.get('yt_count') as string) || '0', 10), 10)
  for (let i = 0; i < ytCount; i++) {
    const url = (formData.get(`yt_url_${i}`) as string)?.trim() || null
    if (!url) continue
    items.push({ media_type: 'youtube', url, alt: null, position: i, is_primary: false })
  }

  return items
}

// Extracts backward-compat column values from a parsed media list.
// The ytField parameter varies by product table ('youtube_video_link' for honey, 'youtube_video_url' for others).
export function mediaToBackwardCompat(
  items: NewProductMedia[],
  ytField: 'youtube_video_link' | 'youtube_video_url',
): Record<string, unknown> {
  const images = items.filter((m) => m.media_type === 'image')
  const primary = images.find((m) => m.is_primary) ?? images[0] ?? null
  const gallery = images.filter((m) => m !== primary).map((m) => m.url)
  const videos = items.filter((m) => m.media_type === 'video')
  const youtubes = items.filter((m) => m.media_type === 'youtube')

  return {
    image_url: primary?.url ?? null,
    image_alt: primary?.alt ?? null,
    gallery_images: gallery,
    video_url: videos[0]?.url ?? null,
    [ytField]: youtubes[0]?.url ?? null,
    youtube_video_urls: youtubes.slice(1).map((m) => m.url),
  }
}
