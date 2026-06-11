import { createClient } from '@supabase/supabase-js'
import type { SiteSettings, HoneyProduct, ApiaryProduct, BeekeeperProduct, Review, FaqItem, FlowerProduct, Service } from '@/types'
import type { ProductSection } from '@/lib/supabase/product-media'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchMedia(section: ProductSection, productId: string, client: any) {
  const { data } = await client
    .from('product_media')
    .select('*')
    .eq('product_section', section)
    .eq('product_id', productId)
    .order('media_type', { ascending: true })
    .order('position', { ascending: true })
  return (data ?? [])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function batchFetchMedia(section: ProductSection, ids: string[], client: any): Promise<Record<string, any[]>> {
  const { data: mediaData } = await client
    .from('product_media')
    .select('*')
    .eq('product_section', section)
    .in('product_id', ids)
    .order('position', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byProduct: Record<string, any[]> = {}
  for (const m of (mediaData ?? [])) {
    if (!byProduct[m.product_id]) byProduct[m.product_id] = []
    byProduct[m.product_id].push(m)
  }
  return byProduct
}

export async function getSiteSettings(): Promise<SiteSettings | null> {
  const client = getClient()
  if (!client) return null
  const { data } = await client.from('site_settings').select('*').eq('id', 1).single()
  return data ?? null
}

export async function getAllHoneyProducts(): Promise<HoneyProduct[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('honey_products')
    .select('*')
    .order('price_plastic_uah', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
  if (!data || data.length === 0) return []

  const ids = data.map((p: { id: string }) => p.id)
  const mediaByProduct = await batchFetchMedia('honey', ids, client)
  return data.map((p: HoneyProduct) => ({ ...p, media: mediaByProduct[p.id] ?? [] }))
}

export async function getHoneyProductBySlug(slug: string): Promise<HoneyProduct | null> {
  const client = getClient()
  if (!client) return null
  const { data } = await client.from('honey_products').select('*').eq('slug', slug).single()
  if (!data) return null
  const media = await fetchMedia('honey', data.id, client).catch(() => [])
  return { ...data, media }
}

export async function getFeaturedHoneyProducts(): Promise<HoneyProduct[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('honey_products')
    .select('*')
    .in('status', ['available', 'preorder'])
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(6)
  if (!data || data.length === 0) return []
  const ids = data.map((p: { id: string }) => p.id)
  const mediaByProduct = await batchFetchMedia('honey', ids, client)
  return data.map((p: HoneyProduct) => ({ ...p, media: mediaByProduct[p.id] ?? [] }))
}

export async function getAllHoneySlugs(): Promise<string[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client.from('honey_products').select('slug')
  return (data ?? []).map((r) => r.slug)
}

export async function getAllApiaryProducts(): Promise<ApiaryProduct[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('apiary_products')
    .select('*')
    .order('price_uah', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
  if (!data || data.length === 0) return []

  const ids = data.map((p: { id: string }) => p.id)
  const mediaByProduct = await batchFetchMedia('apiary', ids, client)
  return data.map((p: ApiaryProduct) => ({ ...p, media: mediaByProduct[p.id] ?? [] }))
}

export async function getApiaryProductBySlug(slug: string): Promise<ApiaryProduct | null> {
  const client = getClient()
  if (!client) return null
  const { data } = await client.from('apiary_products').select('*').eq('slug', slug).single()
  if (!data) return null
  const media = await fetchMedia('apiary', data.id, client).catch(() => [])
  return { ...data, media }
}

export async function getAllApiaryProductSlugs(): Promise<string[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client.from('apiary_products').select('slug')
  return (data ?? []).map((r: { slug: string }) => r.slug)
}

export async function getAllBeekeeperProducts(): Promise<BeekeeperProduct[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('beekeeper_products')
    .select('*')
    .order('product_type', { ascending: true })
    .order('name', { ascending: true })
  if (!data || data.length === 0) return []

  const ids = data.map((p: { id: string }) => p.id)
  const mediaByProduct = await batchFetchMedia('beekeeper', ids, client)
  return data.map((p: BeekeeperProduct) => ({ ...p, media: mediaByProduct[p.id] ?? [] }))
}

export async function getBeekeeperProductBySlug(slug: string): Promise<BeekeeperProduct | null> {
  const client = getClient()
  if (!client) return null
  const { data } = await client.from('beekeeper_products').select('*').eq('slug', slug).single()
  if (!data) return null
  const media = await fetchMedia('beekeeper', data.id, client).catch(() => [])
  return { ...data, media }
}

export async function getAllBeekeeperSlugs(): Promise<string[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client.from('beekeeper_products').select('slug')
  return (data ?? []).map((r: { slug: string }) => r.slug)
}

export async function getVisibleReviews(): Promise<Review[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('reviews')
    .select('*')
    .eq('is_visible', true)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getAllFaqItems(): Promise<FaqItem[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('faq_items')
    .select('*')
    .order('category', { ascending: true })
    .order('display_order', { ascending: true })
  return data ?? []
}

export async function getAllFlowerProducts(): Promise<FlowerProduct[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('flower_products')
    .select('*')
    .order('variety', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
  if (!data || data.length === 0) return []

  const ids = data.map((p: { id: string }) => p.id)
  const mediaByProduct = await batchFetchMedia('flowers', ids, client)
  return data.map((p: FlowerProduct) => ({ ...p, media: mediaByProduct[p.id] ?? [] }))
}

export async function getFlowerProductBySlug(slug: string): Promise<FlowerProduct | null> {
  const client = getClient()
  if (!client) return null
  const { data } = await client.from('flower_products').select('*').eq('slug', slug).single()
  if (!data) return null
  const media = await fetchMedia('flowers', data.id, client).catch(() => [])
  return { ...data, media }
}

export async function getAllFlowerSlugs(): Promise<string[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client.from('flower_products').select('slug')
  return (data ?? []).map((r: { slug: string }) => r.slug)
}

export async function getAllServices(): Promise<Service[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client
    .from('services')
    .select('*')
    .eq('status', 'active')
    .order('display_order', { ascending: true })
  return data ?? []
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const client = getClient()
  if (!client) return null
  const { data } = await client.from('services').select('*').eq('slug', slug).single()
  return data ?? null
}

export async function getAllServiceSlugs(): Promise<string[]> {
  const client = getClient()
  if (!client) return []
  const { data } = await client.from('services').select('slug').eq('status', 'active')
  return (data ?? []).map((r: { slug: string }) => r.slug)
}
