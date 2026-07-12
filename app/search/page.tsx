export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { searchPublishedCatalogProducts, normalizeSort, CATALOG_PAGE_SIZE } from '@/lib/supabase/catalog'
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
  found: (n: number) => string
  showing: (from: number, to: number, total: number) => string
  prompt: string
  empty: string
  contact: string
  prev: string
  next: string
  pageOf: (page: number, total: number) => string
  buyableFilter: string
  photoFilter: string
}> = {
  uk: {
    title: 'Пошук товарів',
    resultsFor: (q) => `Результати за запитом «${q}»`,
    found: (n) => `Знайдено: ${n.toLocaleString('uk-UA')} товарів`,
    showing: (from, to, total) => `Показано ${from}–${to} з ${total.toLocaleString('uk-UA')}`,
    prompt: 'Введіть запит, щоб знайти товари за назвою або артикулом.',
    empty: 'Не знайшли потрібну деталь? Напишіть нам — допоможемо підібрати.',
    contact: "Зв'язатися з нами",
    prev: 'Попередня',
    next: 'Наступна',
    pageOf: (page, total) => `Сторінка ${page} з ${total}`,
    buyableFilter: 'Тільки з ціною',
    photoFilter: 'Тільки з фото',
  },
  ru: {
    title: 'Поиск товаров',
    resultsFor: (q) => `Результаты по запросу «${q}»`,
    found: (n) => `Найдено: ${n.toLocaleString('ru-RU')} товаров`,
    showing: (from, to, total) => `Показано ${from}–${to} из ${total.toLocaleString('ru-RU')}`,
    prompt: 'Введите запрос, чтобы найти товары по названию или артикулу.',
    empty: 'Не нашли нужную деталь? Напишите нам — поможем подобрать.',
    contact: 'Связаться с нами',
    prev: 'Предыдущая',
    next: 'Следующая',
    pageOf: (page, total) => `Страница ${page} из ${total}`,
    buyableFilter: 'Только с ценой',
    photoFilter: 'Только с фото',
  },
  en: {
    title: 'Product search',
    resultsFor: (q) => `Results for “${q}”`,
    found: (n) => `Found: ${n.toLocaleString('en-US')} products`,
    showing: (from, to, total) => `Showing ${from}–${to} of ${total.toLocaleString('en-US')}`,
    prompt: 'Enter a query to search products by name or SKU.',
    empty: "Didn't find the part you need? Message us — we'll help you choose.",
    contact: 'Contact us',
    prev: 'Previous',
    next: 'Next',
    pageOf: (page, total) => `Page ${page} of ${total}`,
    buyableFilter: 'With price only',
    photoFilter: 'With photo only',
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

  const { products, total } = query.length >= 2
    ? await searchPublishedCatalogProducts(query, page, sort, buyable, withImage).catch(() => ({ products: [], total: 0 }))
    : { products: [], total: 0 }
  const fullPage = products.length >= CATALOG_PAGE_SIZE
  const from = (page - 1) * CATALOG_PAGE_SIZE
  const rangeFrom = from + 1
  const rangeTo = from + products.length
  const sortQs = sort === 'featured' ? '' : `&sort=${sort}`
  const buyableQs = buyable ? '&buyable=1' : ''
  const photoQs = withImage ? '&photo=1' : ''
  // Toggle links preserve q + sort + the OTHER filter, flipping one.
  const chipBase = `${searchBase}?q=${encodeURIComponent(query)}${sortQs}`
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
                <div>
                  <p className="text-sm font-semibold text-bark">{t.found(total)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.showing(rangeFrom, rangeTo, total)}</p>
                </div>
                {filterChips}
              </div>
              {(products.length > 1 || page > 1) && <CatalogSortSelect value={sort} />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((p) => (
                <CatalogProductCard key={p.id} product={p} categorySlug={p.category_slug ?? 'all'} locale={locale} />
              ))}
            </div>
            <Pagination
              page={page}
              total={total}
              baseHref={searchBase}
              params={{ q: query, sort: sort === 'featured' ? undefined : sort, buyable: buyable ? '1' : undefined, photo: withImage ? '1' : undefined }}
              labels={{ prev: t.prev, next: t.next, pageOf: t.pageOf }}
              hasNext={fullPage}
            />
          </>
        ) : (
          <div className="max-w-xl py-8">
            {/* If the buyable filter produced 0 results, let the user turn it off. */}
            {(buyable || withImage) && <div className="mb-4">{filterChips}</div>}
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
