export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { normalizeSort } from '@/lib/supabase/catalog'
import { searchPublishedCatalogProductsFast } from '@/lib/catalog/public-search'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { CatalogSortSelect } from '@/components/catalog/CatalogSortSelect'
import { Pagination } from '@/components/catalog/Pagination'
import { TrackSearch } from '@/components/analytics/TrackEvent'
import { SearchLogger } from '@/components/analytics/SearchLogger'
import { getRequestLocale, localizedPath, type Locale } from '@/lib/i18n'
import { buildAlternates } from '@/lib/seo'

interface Props {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; buyable?: string; photo?: string }>
}

const STRINGS: Record<Locale, {
  title: string
  resultsFor: (q: string) => string
  showing: (count: number, hasNext: boolean) => string
  prompt: string
  empty: string
  contact: string
  prev: string
  next: string
  pageCurrent: (page: number) => string
  buyableFilter: string
  photoFilter: string
  browseCatalog: string
  popularTitle: string
  popular: string[]
}> = {
  uk: {
    title: 'Пошук товарів',
    resultsFor: (q) => `Результати за запитом «${q}»`,
    showing: (count, hasNext) => `На цій сторінці: ${count.toLocaleString('uk-UA')} товарів${hasNext ? ', є ще результати' : ''}`,
    prompt: 'Введіть запит, щоб знайти товари за назвою або артикулом.',
    empty: 'Не знайшли потрібну деталь? Напишіть нам — допоможемо підібрати.',
    contact: "Зв'язатися з нами",
    prev: 'Попередня',
    next: 'Наступна',
    pageCurrent: (page) => `Сторінка ${page}`,
    buyableFilter: 'Тільки з ціною',
    photoFilter: 'Тільки з фото',
    browseCatalog: 'Перейти до каталогу',
    popularTitle: 'Популярні запити',
    popular: ['карбюратор', 'ремінь варіатора', 'варіатор', 'амортизатор', 'глушник', 'замок запалювання'],
  },
  ru: {
    title: 'Поиск товаров',
    resultsFor: (q) => `Результаты по запросу «${q}»`,
    showing: (count, hasNext) => `На этой странице: ${count.toLocaleString('ru-RU')} товаров${hasNext ? ', есть ещё результаты' : ''}`,
    prompt: 'Введите запрос, чтобы найти товары по названию или артикулу.',
    empty: 'Не нашли нужную деталь? Напишите нам — поможем подобрать.',
    contact: 'Связаться с нами',
    prev: 'Предыдущая',
    next: 'Следующая',
    pageCurrent: (page) => `Страница ${page}`,
    buyableFilter: 'Только с ценой',
    photoFilter: 'Только с фото',
    browseCatalog: 'Перейти в каталог',
    popularTitle: 'Популярные запросы',
    popular: ['карбюратор', 'ремень вариатора', 'вариатор', 'амортизатор', 'глушитель', 'замок зажигания'],
  },
  en: {
    title: 'Product search',
    resultsFor: (q) => `Results for “${q}”`,
    showing: (count, hasNext) => `On this page: ${count.toLocaleString('en-US')} products${hasNext ? ', more results available' : ''}`,
    prompt: 'Enter a query to search products by name or SKU.',
    empty: "Didn't find the part you need? Message us — we'll help you choose.",
    contact: 'Contact us',
    prev: 'Previous',
    next: 'Next',
    pageCurrent: (page) => `Page ${page}`,
    buyableFilter: 'With price only',
    photoFilter: 'With photo only',
    browseCatalog: 'Browse the catalog',
    popularTitle: 'Popular searches',
    popular: ['carburetor', 'variator belt', 'variator', 'shock absorber', 'muffler', 'ignition lock'],
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
  const { q, page: pageRaw, sort: sortRaw, buyable: buyableRaw, photo: photoRaw } = await searchParams
  const query = (q ?? '').trim()
  const sort = normalizeSort(sortRaw)
  const page = Math.max(1, Number(pageRaw) || 1)
  const buyable = buyableRaw === '1'
  const withImage = photoRaw === '1'
  const locale = await getRequestLocale()
  const t = STRINGS[locale]
  const searchBase = localizedPath(locale, '/search')
  const contactHref = localizedPath(locale, '/contact')

  // Deliberately no `.catch(() => zero-results)` here: if the authoritative
  // bounded product query fails, surface the real application error rather than
  // telling a shopper that the catalog legitimately contains no matches.
  const { products, hasNext } = query.length >= 2
    ? await searchPublishedCatalogProductsFast(query, page, sort, buyable, withImage)
    : { products: [], hasNext: false }
  const sortQs = sort === 'featured' ? '' : `&sort=${sort}`
  const buyableQs = buyable ? '&buyable=1' : ''
  const photoQs = withImage ? '&photo=1' : ''
  // Toggle links preserve q + sort + the OTHER filter, flipping one.
  const chipBase = `${searchBase}?q=${encodeURIComponent(query)}${sortQs}`
  const paginationParams = {
    q: query,
    sort: sort === 'featured' ? undefined : sort,
    buyable: buyable ? '1' : undefined,
    photo: withImage ? '1' : undefined,
  }
  const paginationLabels = { prev: t.prev, next: t.next, pageCurrent: t.pageCurrent }
  const chip = (active: boolean, href: string, label: string) => (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active ? 'bg-honey-600 text-white border-honey-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {active && <span aria-hidden="true">✓</span>}
      {label}
    </Link>
  )
  const filterChips = (
    <div className="flex flex-wrap items-center gap-2">
      {chip(buyable, `${chipBase}${buyable ? '' : '&buyable=1'}${photoQs}`, t.buyableFilter)}
      {chip(withImage, `${chipBase}${buyableQs}${withImage ? '' : '&photo=1'}`, t.photoFilter)}
    </div>
  )

  return (
    <div className="bg-cream min-h-screen">
      {query.length >= 2 && <TrackSearch term={query} resultCount={products.length} />}
      {query.length >= 2 && (
        <SearchLogger query={query} locale={locale} resultCount={products.length} path={`/search?q=${encodeURIComponent(query)}`} />
      )}
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <p className="text-sm font-semibold text-bark">{t.showing(products.length, hasNext)}</p>
                {filterChips}
              </div>
              {(products.length > 1 || page > 1) && <CatalogSortSelect value={sort} locale={locale} />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((p) => (
                <CatalogProductCard key={p.id} product={p} categorySlug={p.category_slug ?? 'all'} locale={locale} />
              ))}
            </div>
            <Pagination
              page={page}
              baseHref={searchBase}
              params={paginationParams}
              labels={paginationLabels}
              hasNext={hasNext}
            />
          </>
        ) : (
          <div className="max-w-xl py-8">
            {/* If the buyable filter produced 0 results, let the user turn it off. */}
            {(buyable || withImage) && <div className="mb-4">{filterChips}</div>}
            <p className="text-bark font-medium mb-4">{t.empty}</p>
            {/* Recovery paths BEFORE the contact dead-end: a zero-result search is
                still a shopper with intent, so give them somewhere to go. */}
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-bark/50 mb-2">{t.popularTitle}</p>
              <div className="flex flex-wrap gap-2">
                {t.popular.map((term) => (
                  <Link
                    key={term}
                    href={`${searchBase}?q=${encodeURIComponent(term)}&buyable=1`}
                    className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-honey-300 hover:text-honey-700 transition-colors"
                  >
                    {term}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={localizedPath(locale, '/catalog')}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-honey-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-honey-800 transition-colors"
              >
                {t.browseCatalog}
              </Link>
              <Link
                href={contactHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-honey-300 px-5 py-2.5 text-sm font-semibold text-honey-700 hover:bg-honey-50 transition-colors"
              >
                {t.contact}
              </Link>
            </div>
            {page > 1 && (
              <Pagination
                page={page}
                baseHref={searchBase}
                params={paginationParams}
                labels={paginationLabels}
                hasNext={false}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
