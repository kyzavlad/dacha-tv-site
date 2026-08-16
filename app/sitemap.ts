import type { MetadataRoute } from 'next'
import { getAllHoneySlugs, getAllFlowerSlugs, getAllApiaryProductSlugs, getAllBeekeeperSlugs, getAllServiceSlugs } from '@/lib/supabase/queries'
import { getPublishedCategories } from '@/lib/supabase/catalog'
import {
  getAllSitemapIds,
  getPublishedCatalogSlugsForShard,
  SITEMAP_PRODUCT_SHARD_COUNT,
} from '@/lib/catalog/sitemap-shards'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'

// Refresh hourly so nightly-cron catalog changes reach the sitemap without a
// redeploy (a plain sitemap.ts is otherwise cached at build time).
export const revalidate = 3600

// Deterministic sharding: shard 0 carries static/non-catalog/category URLs;
// product shards 1..512 each own one equal UUID address-space range. This needs
// neither a global COUNT nor OFFSET pagination, so the final shard stays as cheap
// as the first one even when the catalog grows.
export async function generateSitemaps(): Promise<{ id: number }[]> {
  return getAllSitemapIds().map((id) => ({ id }))
}

// Next 16 passes the shard id as a Promise<string>.
export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const rawId = await props.id
  const id = Number(rawId)
  if (!Number.isInteger(id) || id < 0 || id > SITEMAP_PRODUCT_SHARD_COUNT) {
    throw new Error(`invalid sitemap shard id: ${rawId}`)
  }

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
      // Scooter model SEO/Ads landings (canonical uk; ru mirror via hreflang).
      { url: `${BASE_URL}/moto/skutery/honda-dio`, lastModified: new Date(), priority: 0.85 },
      { url: `${BASE_URL}/moto/skutery/yamaha-jog`, lastModified: new Date(), priority: 0.85 },
      { url: `${BASE_URL}/moto/skutery/suzuki-lets`, lastModified: new Date(), priority: 0.85 },
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

  // Product shard errors are intentionally NOT converted to []: a DB failure or
  // future bucket overflow must be observable, never a misleading HTTP-200 empty
  // sitemap that quietly drops catalog URLs.
  const slugs = await getPublishedCatalogSlugsForShard(id)
  return slugs.map(({ category, product }) => ({
    url: `${BASE_URL}/catalog/${category}/${product}`,
    lastModified: new Date(),
    priority: 0.7,
  }))
}
