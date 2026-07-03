import type { MetadataRoute } from 'next'
import { getPublishedCatalogProductCount, SITEMAP_PRODUCTS_PER_CHUNK } from '@/lib/supabase/catalog'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'

export const revalidate = 3600

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Enumerate every sharded sitemap (shard 0 = static/category, 1..N = products)
  // so crawlers discover all of them without a manual sitemap index.
  const productCount = await getPublishedCatalogProductCount().catch(() => 0)
  const shards = Math.max(1, Math.ceil(productCount / SITEMAP_PRODUCTS_PER_CHUNK)) + 1
  const sitemaps = Array.from({ length: shards }, (_, i) => `${BASE_URL}/sitemap/${i}.xml`)

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Thin / private / per-user routes have no SEO value and waste crawl budget.
        disallow: ['/admin', '/api/', '/checkout', '/cart'],
      },
    ],
    sitemap: sitemaps,
  }
}
