import type { MetadataRoute } from 'next'
import { getAllSitemapIds } from '@/lib/catalog/sitemap-shards'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'

export const revalidate = 3600

export default function robots(): MetadataRoute.Robots {
  // Sitemap IDs are deterministic (0 static + 512 UUID-range product shards), so
  // robots generation never performs a global product COUNT just to enumerate them.
  const sitemaps = getAllSitemapIds().map((id) => `${BASE_URL}/sitemap/${id}.xml`)

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
