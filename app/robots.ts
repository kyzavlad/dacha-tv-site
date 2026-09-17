import type { MetadataRoute } from 'next'
import { getAllSitemapIds } from '@/lib/catalog/sitemap-shards'

// One canonical origin across robots, sitemap and Merchant data.
const BASE_URL = 'https://dachatv.com'

export const revalidate = 3600

export default function robots(): MetadataRoute.Robots {
  // Sitemap IDs are deterministic (0 static + a small fixed set of UUID-range
  // product shards), so robots generation never performs a global product COUNT
  // just to enumerate them.
  const sitemaps = getAllSitemapIds().map((id) => `${BASE_URL}/sitemap/${id}.xml`)

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep private/API surfaces out of crawl. Checkout/cart stay crawlable so
        // Merchant quality review can inspect the real purchase path; checkout
        // itself is marked noindex in app/checkout/layout.tsx.
        disallow: ['/admin', '/api/'],
      },
    ],
    sitemap: sitemaps,
  }
}
