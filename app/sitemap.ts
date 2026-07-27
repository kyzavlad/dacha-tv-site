import type { MetadataRoute } from 'next'
import { getAllHoneySlugs, getAllFlowerSlugs, getAllApiaryProductSlugs, getAllBeekeeperSlugs, getAllServiceSlugs } from '@/lib/supabase/queries'
import {
  getPublishedCategories,
  localizeCatalogCategories,
  hasResolvedCategoryName,
  getPublishedCatalogSlugsPage,
  getPublishedCatalogProductCount,
  SITEMAP_PRODUCTS_PER_CHUNK,
} from '@/lib/supabase/catalog'
import { PUBLIC_LOCALES, HREFLANG, DEFAULT_LOCALE, localizedPath } from '@/lib/i18n'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'

// Per-locale hreflang alternates for one canonical (uk, prefix-less) path, so
// every enabled locale (uk/ru/en) is represented in the sitemap. x-default → uk.
function langs(canonicalPath: string): { languages: Record<string, string> } {
  const languages: Record<string, string> = {}
  for (const loc of PUBLIC_LOCALES) languages[HREFLANG[loc]] = `${BASE_URL}${localizedPath(loc, canonicalPath)}`
  languages['x-default'] = `${BASE_URL}${localizedPath(DEFAULT_LOCALE, canonicalPath)}`
  return { languages }
}

// A sitemap entry for a canonical path, carrying its uk/ru/en alternates.
function entry(canonicalPath: string, priority: number): MetadataRoute.Sitemap[number] {
  return { url: `${BASE_URL}${canonicalPath}`, lastModified: new Date(), priority, alternates: langs(canonicalPath) }
}

// Refresh hourly so nightly-cron catalog changes reach the sitemap without a
// redeploy (a plain sitemap.ts is otherwise cached at build time).
export const revalidate = 3600

// Sharded sitemap: a single flat file cannot hold 105k product URLs (Google's
// hard limit is 50,000 URLs / 50MB per file). Shard 0 carries the static +
// non-catalog + category URLs; shards 1..N each carry one
// SITEMAP_PRODUCTS_PER_CHUNK-product window (1000, well under the 50k limit).
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
      entry('/', 1.0),
      entry('/honey', 0.9),
      entry('/catalog', 0.9),
      entry('/catalog/all', 0.7),
      entry('/products', 0.8),
      entry('/flowers', 0.85),
      entry('/flowers/catalog', 0.8),
      entry('/lavender', 0.85),
      entry('/services', 0.8),
      entry('/beekeeper', 0.8),
      entry('/about', 0.7),
      entry('/contact', 0.7),
      entry('/delivery', 0.6),
      entry('/faq', 0.6),
      // Scooter model SEO/Ads landings are uk/ru only (EN 404s), so they carry
      // just the uk+ru alternates, not the shared en one.
      { url: `${BASE_URL}/moto/skutery/honda-dio`, lastModified: new Date(), priority: 0.85, alternates: { languages: { uk: `${BASE_URL}/moto/skutery/honda-dio`, ru: `${BASE_URL}/ru/moto/skutery/honda-dio`, 'x-default': `${BASE_URL}/moto/skutery/honda-dio` } } },
      { url: `${BASE_URL}/moto/skutery/yamaha-jog`, lastModified: new Date(), priority: 0.85, alternates: { languages: { uk: `${BASE_URL}/moto/skutery/yamaha-jog`, ru: `${BASE_URL}/ru/moto/skutery/yamaha-jog`, 'x-default': `${BASE_URL}/moto/skutery/yamaha-jog` } } },
      { url: `${BASE_URL}/moto/skutery/suzuki-lets`, lastModified: new Date(), priority: 0.85, alternates: { languages: { uk: `${BASE_URL}/moto/skutery/suzuki-lets`, ru: `${BASE_URL}/ru/moto/skutery/suzuki-lets`, 'x-default': `${BASE_URL}/moto/skutery/suzuki-lets` } } },
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
      slugs.map((slug) => entry(`${prefix}/${slug}`, priority))

    return [
      ...staticRoutes,
      ...map(honeySlugs, '/honey', 0.85),
      ...map(flowerSlugs, '/flowers', 0.8),
      ...map(apiarySlugs, '/products', 0.75),
      ...map(beekeeperSlugs, '/beekeeper', 0.75),
      ...map(serviceSlugs, '/services', 0.75),
      // Only categories with a real resolvable Ukrainian name are public, so
      // only those belong in the sitemap.
      ...(await localizeCatalogCategories(catalogCategories, DEFAULT_LOCALE))
        .filter(hasResolvedCategoryName)
        .map((cat) => entry(`/catalog/${cat.slug}`, 0.8)),
    ]
  }

  // Product shard N → the Nth SITEMAP_PRODUCTS_PER_CHUNK (1000) window.
  const offset = (id - 1) * SITEMAP_PRODUCTS_PER_CHUNK
  const slugs = await getPublishedCatalogSlugsPage(offset, SITEMAP_PRODUCTS_PER_CHUNK).catch(() => [])
  return slugs.map(({ category, product }) => entry(`/catalog/${category}/${product}`, 0.7))
}
