import type { MetadataRoute } from 'next'
import { getAllHoneySlugs, getAllFlowerSlugs, getAllApiaryProductSlugs, getAllBeekeeperSlugs, getAllServiceSlugs } from '@/lib/supabase/queries'
import { getPublishedCategories, getPublishedCatalogSlugs } from '@/lib/supabase/catalog'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), priority: 1.0 },
    { url: `${BASE_URL}/honey`, lastModified: new Date(), priority: 0.9 },
    { url: `${BASE_URL}/catalog`, lastModified: new Date(), priority: 0.9 },
    { url: `${BASE_URL}/products`, lastModified: new Date(), priority: 0.8 },
    { url: `${BASE_URL}/flowers`, lastModified: new Date(), priority: 0.85 },
    { url: `${BASE_URL}/flowers/catalog`, lastModified: new Date(), priority: 0.8 },
    { url: `${BASE_URL}/services`, lastModified: new Date(), priority: 0.8 },
    { url: `${BASE_URL}/beekeeper`, lastModified: new Date(), priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), priority: 0.7 },
    { url: `${BASE_URL}/contact`, lastModified: new Date(), priority: 0.7 },
    { url: `${BASE_URL}/delivery`, lastModified: new Date(), priority: 0.6 },
    { url: `${BASE_URL}/faq`, lastModified: new Date(), priority: 0.6 },
  ]

  const [honeySlugs, flowerSlugs, apiarySlugs, beekeeperSlugs, serviceSlugs, catalogCategories, catalogProducts] = await Promise.all([
    getAllHoneySlugs().catch(() => []),
    getAllFlowerSlugs().catch(() => []),
    getAllApiaryProductSlugs().catch(() => []),
    getAllBeekeeperSlugs().catch(() => []),
    getAllServiceSlugs().catch(() => []),
    getPublishedCategories().catch(() => []),
    getPublishedCatalogSlugs().catch(() => []),
  ])

  const honeyRoutes: MetadataRoute.Sitemap = honeySlugs.map((slug) => ({
    url: `${BASE_URL}/honey/${slug}`,
    lastModified: new Date(),
    priority: 0.85,
  }))

  const flowerRoutes: MetadataRoute.Sitemap = flowerSlugs.map((slug) => ({
    url: `${BASE_URL}/flowers/${slug}`,
    lastModified: new Date(),
    priority: 0.8,
  }))

  const apiaryRoutes: MetadataRoute.Sitemap = apiarySlugs.map((slug) => ({
    url: `${BASE_URL}/products/${slug}`,
    lastModified: new Date(),
    priority: 0.75,
  }))

  const beekeeperRoutes: MetadataRoute.Sitemap = beekeeperSlugs.map((slug) => ({
    url: `${BASE_URL}/beekeeper/${slug}`,
    lastModified: new Date(),
    priority: 0.75,
  }))

  const serviceRoutes: MetadataRoute.Sitemap = serviceSlugs.map((slug) => ({
    url: `${BASE_URL}/services/${slug}`,
    lastModified: new Date(),
    priority: 0.75,
  }))

  const catalogCategoryRoutes: MetadataRoute.Sitemap = catalogCategories.map((cat) => ({
    url: `${BASE_URL}/catalog/${cat.slug}`,
    lastModified: new Date(),
    priority: 0.8,
  }))

  const catalogProductRoutes: MetadataRoute.Sitemap = catalogProducts.map(({ category, product }) => ({
    url: `${BASE_URL}/catalog/${category}/${product}`,
    lastModified: new Date(),
    priority: 0.7,
  }))

  return [
    ...staticRoutes,
    ...honeyRoutes,
    ...flowerRoutes,
    ...apiaryRoutes,
    ...beekeeperRoutes,
    ...serviceRoutes,
    ...catalogCategoryRoutes,
    ...catalogProductRoutes,
  ]
}
