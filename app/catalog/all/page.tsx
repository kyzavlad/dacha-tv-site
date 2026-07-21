export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { getPublishedCatalogProducts, CATALOG_PAGE_SIZE, normalizeSort } from '@/lib/supabase/catalog'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { Breadcrumb } from '@/components/catalog/Breadcrumb'
import { Pagination } from '@/components/catalog/Pagination'
import { CatalogSortSelect } from '@/components/catalog/CatalogSortSelect'
import { buildAlternates } from '@/lib/seo'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { catalogDict } from '@/lib/i18n/sections/catalog'

interface Props {
  searchParams: Promise<{ page?: string; sort?: string }>
}

const META: Record<'uk' | 'ru' | 'en', { title: string; description: string }> = {
  uk: { title: 'Усі товари', description: 'Повний асортимент товарів для дому, саду та дачі з доставкою по Україні.' },
  ru: { title: 'Все товары', description: 'Полный ассортимент товаров для дома, сада и дачи с доставкой по Украине.' },
  en: { title: 'All products', description: 'The full assortment of home, garden and dacha goods, delivered across Ukraine.' },
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const { canonical, languages } = buildAlternates(locale, '/catalog/all')
  const m = META[locale]
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical, languages },
  }
}

export default async function AllCatalogProductsPage({ searchParams }: Props) {
  const { page: pageStr, sort: sortStr } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)
  const sort = normalizeSort(sortStr)

  const { products, total } = await getPublishedCatalogProducts(page, sort).catch(() => ({ products: [], total: 0 }))
  const totalPages = Math.ceil(total / CATALOG_PAGE_SIZE)

  const locale = await getRequestLocale()
  const t = catalogDict(locale)
  const numLocale = locale === 'ru' ? 'ru-RU' : locale === 'en' ? 'en-US' : 'uk-UA'

  return (
    <div className="bg-cream min-h-screen">
      <div className="bg-white border-b border-gray-100 py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[
            { label: t.crumbHome, href: localizedPath(locale, '/') },
            { label: t.crumbCatalog, href: localizedPath(locale, '/catalog') },
            { label: t.allTitle },
          ]} />
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mt-4 mb-2">
            {t.allTitle}
          </h1>
          {total > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              {total.toLocaleString(numLocale)} {t.items}{page > 1 ? ` · ${t.pageWord} ${page} ${t.of} ${totalPages}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-bark/40 text-sm">{t.emptyNoProducts}</p>
          </div>
        ) : (
          <>
            <div className="flex justify-end mb-6">
              <CatalogSortSelect value={sort} locale={locale} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {products.map((product) => (
                <CatalogProductCard
                  key={product.id}
                  product={product}
                  categorySlug={product.category_slug ?? 'all'}
                  locale={locale}
                />
              ))}
            </div>
            <Pagination
              page={page}
              total={total}
              baseHref={localizedPath(locale, '/catalog/all')}
              params={{ sort: sort === 'featured' ? undefined : sort }}
              labels={{ prev: t.prev, next: t.next, pageOf: (p, tot) => `${t.pageWordCap} ${p} ${t.of} ${tot}` }}
            />
          </>
        )}
      </div>
    </div>
  )
}
