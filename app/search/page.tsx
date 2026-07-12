export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { searchPublishedCatalogProducts, normalizeSort, CATALOG_PAGE_SIZE } from '@/lib/supabase/catalog'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { CatalogSortSelect } from '@/components/catalog/CatalogSortSelect'
import { TrackSearch } from '@/components/analytics/TrackEvent'
import { getRequestLocale, localizedPath, type Locale } from '@/lib/i18n'
import { buildAlternates } from '@/lib/seo'

interface Props {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; buyable?: string }>
}

const STRINGS: Record<Locale, {
  title: string
  resultsFor: (q: string) => string
  onPage: (n: number) => string
  prompt: string
  empty: string
  contact: string
  prev: string
  next: string
  buyableFilter: string
}> = {
  uk: {
    title: 'Пошук товарів',
    resultsFor: (q) => `Результати за запитом «${q}»`,
    onPage: (n) => `${n} товар${n % 10 === 1 && n % 100 !== 11 ? '' : 'ів'} на сторінці`,
    prompt: 'Введіть запит, щоб знайти товари за назвою або артикулом.',
    empty: 'Не знайшли потрібну деталь? Напишіть нам — допоможемо підібрати.',
    contact: "Зв'язатися з нами",
    prev: '← Попередня',
    next: 'Наступна →',
    buyableFilter: 'Тільки з ціною',
  },
  ru: {
    title: 'Поиск товаров',
    resultsFor: (q) => `Результаты по запросу «${q}»`,
    onPage: (n) => `${n} товаров на странице`,
    prompt: 'Введите запрос, чтобы найти товары по названию или артикулу.',
    empty: 'Не нашли нужную деталь? Напишите нам — поможем подобрать.',
    contact: 'Связаться с нами',
    prev: '← Предыдущая',
    next: 'Следующая →',
    buyableFilter: 'Только с ценой',
  },
  en: {
    title: 'Product search',
    resultsFor: (q) => `Results for “${q}”`,
    onPage: (n) => `${n} products on this page`,
    prompt: 'Enter a query to search products by name or SKU.',
    empty: "Didn't find the part you need? Message us — we'll help you choose.",
    contact: 'Contact us',
    prev: '← Previous',
    next: 'Next →',
    buyableFilter: 'With price only',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const { canonical, languages } = buildAlternates(locale, '/search')
  return {
    title: STRINGS[locale].title,
    // Search result pages carry no unique indexable content — keep them out of
    // the index but let crawlers follow through to products.
    robots: { index: false, follow: true },
    alternates: { canonical, languages },
  }
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, page: pageRaw, sort: sortRaw, buyable: buyableRaw } = await searchParams
  const query = (q ?? '').trim()
  const sort = normalizeSort(sortRaw)
  const page = Math.max(1, Number(pageRaw) || 1)
  const buyable = buyableRaw === '1'
  const locale = await getRequestLocale()
  const t = STRINGS[locale]
  const searchBase = localizedPath(locale, '/search')
  const contactHref = localizedPath(locale, '/contact')

  const { products } = query.length >= 2
    ? await searchPublishedCatalogProducts(query, page, sort, buyable).catch(() => ({ products: [], total: 0 }))
    : { products: [] }
  const fullPage = products.length >= CATALOG_PAGE_SIZE
  const sortQs = sort === 'featured' ? '' : `&sort=${sort}`
  const buyableQs = buyable ? '&buyable=1' : ''
  const pageHref = (p: number) => `${searchBase}?q=${encodeURIComponent(query)}&page=${p}${sortQs}${buyableQs}`
  // Toggle link for the "Тільки з ціною" chip — preserves q + sort, flips buyable.
  const buyableToggleHref = `${searchBase}?q=${encodeURIComponent(query)}${sortQs}${buyable ? '' : '&buyable=1'}`
  const buyableChip = (
    <Link
      href={buyableToggleHref}
      scroll={false}
      aria-pressed={buyable}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        buyable ? 'bg-honey-600 text-white border-honey-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {buyable && <span aria-hidden="true">✓</span>}
      {t.buyableFilter}
    </Link>
  )

  return (
    <div className="bg-cream min-h-screen">
      {query.length >= 2 && <TrackSearch term={query} resultCount={products.length} />}
      <div className="bg-white border-b border-gray-100 py-8 md:py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-bark">{t.title}</h1>
          {query && <p className="text-gray-500 text-sm mt-2">{t.resultsFor(query)}</p>}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {!query ? (
          <p className="text-bark/60">{t.prompt}</p>
        ) : products.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-500">{t.onPage(products.length)}{fullPage ? '+' : ''}</p>
                {buyableChip}
              </div>
              {(products.length > 1 || page > 1) && <CatalogSortSelect value={sort} />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((p) => (
                <CatalogProductCard key={p.id} product={p} categorySlug={p.category_slug ?? 'all'} locale={locale} />
              ))}
            </div>
            {(page > 1 || fullPage) && (
              <div className="flex justify-between items-center mt-10">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className="text-honey-700 font-semibold hover:underline">{t.prev}</Link>
                ) : <span />}
                {fullPage && (
                  <Link href={pageHref(page + 1)} className="text-honey-700 font-semibold hover:underline">{t.next}</Link>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="max-w-xl py-8">
            {/* If the buyable filter produced 0 results, let the user turn it off. */}
            {buyable && <div className="mb-4">{buyableChip}</div>}
            <p className="text-bark font-medium mb-4">{t.empty}</p>
            <Link
              href={contactHref}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-honey-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-honey-800 transition-colors"
            >
              {t.contact}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
