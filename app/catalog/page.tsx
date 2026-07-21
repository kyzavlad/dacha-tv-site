export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { CatalogCategory } from '@/types'
import {
  getLandingCategories,
  searchPublishedCatalogProducts,
  normalizeSort,
  CATALOG_PAGE_SIZE,
} from '@/lib/supabase/catalog'
import { CategoryCard } from '@/components/catalog/CategoryCard'
import { CategoryChips } from '@/components/catalog/CategoryChips'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { CatalogSearchBar } from '@/components/catalog/CatalogSearchBar'
import { CatalogSortSelect } from '@/components/catalog/CatalogSortSelect'
import { FaqBlock } from '@/components/shared/FaqBlock'
import { CATALOG_FAQ } from '@/lib/catalog-faq'
import { buildAlternates } from '@/lib/seo'
import { getRequestLocale } from '@/lib/i18n'
import { catalogDict } from '@/lib/i18n/sections/catalog'

const META: Record<'uk' | 'ru' | 'en', { title: string; description: string; ogTitle: string; ogDescription: string; ogAlt: string }> = {
  uk: {
    title: 'Магазин',
    description: 'Магазин товарів для дому, саду та господарства: квіти, металопрофіль, покрівля та широкий асортимент від постачальників. Доставка по Україні.',
    ogTitle: 'Магазин товарів',
    ogDescription: 'Товари для дому, саду та господарства: квіти, металопрофіль, покрівля та широкий асортимент від постачальників.',
    ogAlt: 'Дача TV: магазин товарів',
  },
  ru: {
    title: 'Магазин',
    description: 'Магазин товаров для дома, сада и хозяйства: цветы, металлопрофиль, кровля и широкий ассортимент от поставщиков. Доставка по Украине.',
    ogTitle: 'Магазин товаров',
    ogDescription: 'Товары для дома, сада и хозяйства: цветы, металлопрофиль, кровля и широкий ассортимент от поставщиков.',
    ogAlt: 'Дача TV: магазин товаров',
  },
  en: {
    title: 'Shop',
    description: 'A shop for home, garden and farm goods: flowers, metal profile, roofing and a wide supplier assortment. Delivery across Ukraine.',
    ogTitle: 'Goods shop',
    ogDescription: 'Home, garden and farm goods: flowers, metal profile, roofing and a wide supplier assortment.',
    ogAlt: 'Dacha TV: goods shop',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const { canonical, languages } = buildAlternates(locale, '/catalog')
  const m = META[locale]
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical, languages },
    openGraph: {
      title: m.ogTitle,
      description: m.ogDescription,
      siteName: 'Дача TV',
      type: 'website',
      url: canonical,
      images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: m.ogAlt }],
    },
  }
}

// How many category cards the landing shows. The full assortment is always one
// click away via /catalog/all, so this stays bounded and fast at 100k+ products.
const LANDING_CATEGORY_LIMIT = 80

// Synthetic "browse everything" card appended to the grid. slug 'all' → /catalog/all.
const ALL_PRODUCTS_CARD: CatalogCategory = {
  id: '__all__',
  supplier_category_id: null,
  slug: 'all',
  name_ua: 'Усі товари',
  description: 'Перегляньте весь асортимент магазину одним списком.',
  meta_title: null,
  meta_description: null,
  image_url: null,
  is_published: true,
  display_order: 9_999,
  created_at: '',
  updated_at: '',
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; sort?: string }> }) {
  const { q, page: pageRaw, sort: sortRaw } = await searchParams
  const query = (q ?? '').trim()
  const sort = normalizeSort(sortRaw)
  const locale = await getRequestLocale()
  const t = catalogDict(locale)

  // ── Search results (?q=) ──────────────────────────────────────────────────
  if (query) {
    const page = Math.max(1, Number(pageRaw) || 1)
    const [{ products }, chipCategories] = await Promise.all([
      searchPublishedCatalogProducts(query, page, sort).catch(() => ({ products: [], total: 0 })),
      getLandingCategories(14).catch(() => []),
    ])
    const fullPage = products.length >= CATALOG_PAGE_SIZE
    const sortQs = sort === 'featured' ? '' : `&sort=${sort}`
    return (
      <div className="bg-cream min-h-screen">
        <div className="bg-white border-b border-gray-100 py-10 md:py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-4">{t.searchTitle}</h1>
            <CatalogSearchBar defaultValue={query} locale={locale} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <CategoryChips categories={chipCategories} label={t.categoriesChipLabel} locale={locale} />
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <p className="text-sm text-gray-500">{t.resultsFor} «{query}»</p>
            {(products.length > 1 || page > 1) && <CatalogSortSelect value={sort} locale={locale} />}
          </div>
          {products.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map((p) => (
                  <CatalogProductCard key={p.id} product={p} categorySlug={p.category_slug ?? 'all'} locale={locale} />
                ))}
              </div>
              {(page > 1 || fullPage) && (
                <div className="flex justify-between items-center mt-10">
                  {page > 1 ? (
                    <Link href={`/catalog?q=${encodeURIComponent(query)}&page=${page - 1}${sortQs}`} className="text-honey-700 font-semibold hover:underline">← {t.prev}</Link>
                  ) : <span />}
                  {fullPage && (
                    <Link href={`/catalog?q=${encodeURIComponent(query)}&page=${page + 1}${sortQs}`} className="text-honey-700 font-semibold hover:underline">{t.next} →</Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="max-w-xl">
              <p className="text-bark font-medium mb-1">{t.nothingFoundFor} «{query}».</p>
              <p className="text-gray-500 text-sm mb-6">
                {t.searchHintBefore}{' '}
                <Link href="/catalog/all" className="text-honey-700 hover:underline">{t.allProductsLower}</Link>.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Bounded, single cheap query — no full-catalog product scan, no per-category
  // counts. This is the fix for the /catalog timeout at 105k products.
  const categories = await getLandingCategories(LANDING_CATEGORY_LIMIT).catch(() => [])
  // Always offer the full list; append the localized "Усі товари" card at the end.
  const allCard: CatalogCategory = { ...ALL_PRODUCTS_CARD, name_ua: t.allProductsCardTitle, description: t.allProductsCardDesc }
  const cards: CatalogCategory[] = [...categories, allCard]

  return (
    <div className="bg-cream min-h-screen">
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">
            {t.eyebrowShop}
          </span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            {t.landingTitle}
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl mb-6">
            {t.landingSubtitle}
          </p>
          <CatalogSearchBar locale={locale} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Browse-all CTA — always available, the full assortment in one list */}
        <div className="mb-10 rounded-2xl border border-honey-200 bg-gradient-to-br from-honey-50 to-amber-50 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-bark mb-1">{t.allAssortmentTitle}</h2>
            <p className="text-bark/60 text-sm max-w-xl">
              {t.allAssortmentBody}
            </p>
          </div>
          <Link
            href="/catalog/all"
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 bg-honey-700 hover:bg-honey-800 text-white font-semibold rounded-xl transition-colors"
          >
            {t.allProductsCta}
          </Link>
        </div>

        {categories.length > 0 ? (
          /* ── Category-first grid (bounded, no per-category counts) ── */
          <>
            <h2 className="font-serif text-2xl font-semibold text-bark mb-6">{t.categoriesTitle}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {cards.map((cat) => (
                <CategoryCard key={cat.id} category={cat} locale={locale} />
              ))}
            </div>
          </>
        ) : (
          /* ── No presentable categories → still let users browse everything ── */
          <div className="max-w-xl mx-auto text-center py-12">
            <span className="text-5xl opacity-30 block mb-4" aria-hidden="true">🗂️</span>
            <p className="text-2xl font-serif text-bark mb-2">{t.emptyAllTitle}</p>
            <p className="text-gray-500 text-sm mb-8">
              {t.emptyAllBody}
            </p>
            <Link
              href="/catalog/all"
              className="inline-flex items-center justify-center px-6 py-3 bg-honey-600 hover:bg-honey-700 text-white font-semibold rounded-xl transition-colors"
            >
              {t.emptyAllCta}
            </Link>
          </div>
        )}

        <FaqBlock items={CATALOG_FAQ} heading={t.faqHeading} />
      </div>
    </div>
  )
}
