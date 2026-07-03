import type { MetadataRoute } from 'next'
import { getAllHoneySlugs, getAllFlowerSlugs, getAllApiaryProductSlugs, getAllBeekeeperSlugs, getAllServiceSlugs } from '@/lib/supabase/queries'
import {
  getPublishedCategories,
  getPublishedCatalogSlugsPage,
  getPublishedCatalogProductCount,
  SITEMAP_PRODUCTS_PER_CHUNK,
} from '@/lib/supabase/catalog'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'

// Refresh hourly so nightly-cron catalog changes reach the sitemap without a
// redeploy (a plain sitemap.ts is otherwise cached at build time).
export const revalidate = 3600

// Sharded sitemap: a single flat file cannot hold 105k product URLs (Google's
// hard limit is 50,000 URLs / 50MB per file). Shard 0 carries the static +
// non-catalog + category URLs; shards 1..N each carry one 45k-product window.
// Shards are served at /sitemap/[id].xml and enumerated in robots.ts.
export async function generateSitemaps(): Promise<{ id: number }[]> {
  const productCount = await getPublishedCatalogProductCount().catch(() => 0)
  const productShards = Math.max(1, Math.ceil(productCount / SITEMAP_PRODUCTS_PER_CHUNK))
  return Array.from({ length: productShards + 1 }, (_, i) => ({ id: i }))
}

// Next 16 passes the shard id as a Promise<string>.
export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id) || 0

  if (id === 0) {
    const staticRoutes: MetadataRoute.Sitemap = [
      { url: BASE_URL, lastModified: new Date(), priority: 1.0 },
      { url: `${BASE_URL}/honey`, lastModified: new Date(), priority: 0.9 },
      { url: `${BASE_URL}/catalog`, lastModified: new Date(), priority: 0.9 },
      { url: `${BASE_URL}/catalog/all`, lastModified: new Date(), priority: 0.7 },
      { url: `${BASE_URL}/products`, lastModified: new Date(), priority: 0.8 },
      { url: `${BASE_URL}/flowers`, lastModified: new Date(), priority: 0.85 },
      { url: `${BASE_URL}/flowers/catalog`, lastModified: new Date(), priority: 0.8 },
      { url: `${BASE_URL}/lavender`, lastModified: new Date(), priority: 0.85 },
      { url: `${BASE_URL}/services`, lastModified: new Date(), priority: 0.8 },
      { url: `${BASE_URL}/beekeeper`, lastModified: new Date(), priority: 0.8 },
      { url: `${BASE_URL}/about`, lastModified: new Date(), priority: 0.7 },
      { url: `${BASE_URL}/contact`, lastModified: new Date(), priority: 0.7 },
      { url: `${BASE_URL}/delivery`, lastModified: new Date(), priority: 0.6 },
      { url: `${BASE_URL}/faq`, lastModified: new Date(), priority: 0.6 },
    ]

    const [honeySlugs, flowerSlugs, apiarySlugs, beekeeperSlugs, serviceSlugs, catalogCategories] = await Promise.all([
      getAllHoneySlugs().catch(() => []),
      getAllFlowerSlugs().catch(() => []),
      getAllApiaryProductSlugs().catch(() => []),
      getAllBeekeeperSlugs().catch(() => []),
      getAllServiceSlugs().catch(() => []),
      getPublishedCategories().catch(() => []),
    ])

    const map = (slugs: string[], prefix: string, priority: number): MetadataRoute.Sitemap =>
      slugs.map((slug) => ({ url: `${BASE_URL}${prefix}/${slug}`, lastModified: new Date(), priority }))

    return [
      ...staticRoutes,
      ...map(honeySlugs, '/honey', 0.85),
      ...map(flowerSlugs, '/flowers', 0.8),
      ...map(apiarySlugs, '/products', 0.75),
      ...map(beekeeperSlugs, '/beekeeper', 0.75),
      ...map(serviceSlugs, '/services', 0.75),
      ...catalogCategories.map((cat) => ({
        url: `${BASE_URL}/catalog/${cat.slug}`,
        lastModified: new Date(),
        priority: 0.8,
      })),
    ]
  }

  // Product shard N → the Nth 45k window of published catalog products.
  const offset = (id - 1) * SITEMAP_PRODUCTS_PER_CHUNK
  const slugs = await getPublishedCatalogSlugsPage(offset, SITEMAP_PRODUCTS_PER_CHUNK).catch(() => [])
  return slugs.map(({ category, product }) => ({
    url: `${BASE_URL}/catalog/${category}/${product}`,
    lastModified: new Date(),
    priority: 0.7,
  }))
}
