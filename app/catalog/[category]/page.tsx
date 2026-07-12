export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCategoryBySlug, getPublishedProductsByCategory, CATALOG_PAGE_SIZE, categoryDisplayName, normalizeSort, getCategoryTranslation } from '@/lib/supabase/catalog'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { Breadcrumb } from '@/components/catalog/Breadcrumb'
import { Pagination } from '@/components/catalog/Pagination'
import { CatalogSortSelect } from '@/components/catalog/CatalogSortSelect'
import { StructuredData } from '@/components/shared/StructuredData'
import { FaqBlock } from '@/components/shared/FaqBlock'
import { breadcrumbSchema } from '@/lib/schema'
import { categoryFaq } from '@/lib/catalog-faq'
import { buildSocialMetadata, buildAlternates, stripBrand } from '@/lib/seo'
import { getRequestLocale, localizedPath, type Locale } from '@/lib/i18n'
import { resolveCategorySeo } from '@/lib/catalog/localized-seo'

interface Props {
  params: Promise<{ category: string }>
  searchParams: Promise<{ page?: string; sort?: string; buyable?: string }>
}

// Locale-only UI copy. Products/query are locale-independent — locale never
// filters the listing, only relabels it and localizes product-card names.
const CAT_STRINGS: Record<Locale, {
  home: string; catalog: string; noProducts: string
  products: (n: number) => string; page: (p: number, t: number) => string
  introFallback: (name: string) => string; about: (name: string) => string
  buyableFilter: string
}> = {
  uk: {
    home: 'Головна', catalog: 'Каталог', noProducts: 'У цій категорії поки немає товарів.',
    products: (n) => `${n} товарів`, page: (p, t) => ` · сторінка ${p} з ${t}`,
    introFallback: (name) => `${name} — замовляйте з доставкою по Україні. Оплата після підтвердження замовлення.`,
    about: (name) => `Про категорію «${name}»`,
    buyableFilter: 'Тільки з ціною',
  },
  ru: {
    home: 'Главная', catalog: 'Каталог', noProducts: 'В этой категории пока нет товаров.',
    products: (n) => `${n} товаров`, page: (p, t) => ` · страница ${p} из ${t}`,
    introFallback: (name) => `${name} — заказывайте с доставкой по Украине. Оплата после подтверждения заказа.`,
    about: (name) => `О категории «${name}»`,
    buyableFilter: 'Только с ценой',
  },
  en: {
    home: 'Home', catalog: 'Catalog', noProducts: 'No products in this category yet.',
    products: (n) => `${n} products`, page: (p, t) => ` · page ${p} of ${t}`,
    introFallback: (name) => `${name} — order with delivery across Ukraine. Payment after order confirmation.`,
    about: (name) => `About “${name}”`,
    buyableFilter: 'With price only',
  },
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params
  const cat = await getCategoryBySlug(slug).catch(() => null)
  if (!cat) return { title: 'Категорія не знайдена' }

  const displayName = categoryDisplayName(cat.name_ua)
  // Localized SEO: ru/en pull the translation row (per-field UA fallback); the
  // default uk locale skips the extra query.
  const locale = await getRequestLocale()
  const tx = locale === 'uk' ? null : await getCategoryTranslation(cat.id, locale).catch(() => null)
  const seo = resolveCategorySeo(locale, { meta_title: cat.seo_title || cat.meta_title, meta_description: cat.seo_description || cat.meta_description, description_ua: cat.description }, tx)

  const bareTitle = stripBrand(seo.meta_title) || displayName
  const description = seo.meta_description || cat.description || `Каталог товарів категорії «${displayName}». Замовляйте з доставкою по Україні.`
  const { canonical, languages } = buildAlternates(locale, `/catalog/${slug}`)

  return buildSocialMetadata({
    bareTitle,
    description,
    canonical,
    languages,
    image: cat.image_url,
    imageAlt: displayName,
  })
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params
  const { page: pageStr, sort: sortStr, buyable: buyableStr } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)
  const sort = normalizeSort(sortStr)
  const buyable = buyableStr === '1'

  const [cat, { products, total }] = await Promise.all([
    getCategoryBySlug(slug).catch(() => null),
    getPublishedProductsByCategory(slug, page, sort, buyable).catch(() => ({ products: [], total: 0 })),
  ])

  if (!cat) notFound()

  const locale = await getRequestLocale()
  const st = CAT_STRINGS[locale]
  const displayName = categoryDisplayName(cat.name_ua)
  const totalPages = Math.ceil(total / CATALOG_PAGE_SIZE)
  // Short intro (description) above the grid; longer SEO body (description_ua)
  // below it. Both are DB-driven and only render when present — never spammy.
  const intro = (cat.description ?? '').trim()
  const seoBody = (cat.description_ua ?? '').trim()

  const crumbs = [
    { label: st.home, href: localizedPath(locale, '/') },
    { label: st.catalog, href: localizedPath(locale, '/catalog') },
    { label: displayName },
  ]

  return (
    <div className="bg-cream min-h-screen">
      <StructuredData data={breadcrumbSchema(crumbs)} />
      <div className="bg-white border-b border-gray-100 py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={crumbs} />
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mt-4 mb-2">
            {displayName}
          </h1>
          {intro ? (
            <p className="text-gray-500 text-base max-w-2xl">{intro}</p>
          ) : (
            <p className="text-gray-500 text-base max-w-2xl">{st.introFallback(displayName)}</p>
          )}
          {total > 0 && (
            <p className="text-xs text-gray-400 mt-2">{st.products(total)}{page > 1 ? st.page(page, totalPages) : ''}</p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Filter/sort bar — shown when the category has products OR the buyable
            filter is active (so a filter that yields 0 results can still be
            toggled off). "Тільки з ціною" links preserve sort; default is off. */}
        {(products.length > 0 || buyable) && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <Link
              href={`${localizedPath(locale, `/catalog/${slug}`)}?${new URLSearchParams({
                ...(sort !== 'featured' ? { sort } : {}),
                ...(buyable ? {} : { buyable: '1' }),
              }).toString()}`}
              scroll={false}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                buyable
                  ? 'bg-honey-600 text-white border-honey-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
              aria-pressed={buyable}
            >
              {buyable && <span aria-hidden="true">✓</span>}
              {st.buyableFilter}
            </Link>
            {total > CATALOG_PAGE_SIZE / 4 && <CatalogSortSelect value={sort} />}
          </div>
        )}
        {products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-bark/40 text-sm">{st.noProducts}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {products.map((product) => (
                <CatalogProductCard key={product.id} product={product} categorySlug={slug} locale={locale} />
              ))}
            </div>
            <Pagination page={page} total={total} baseHref={localizedPath(locale, `/catalog/${slug}`)} params={{ sort: sort === 'featured' ? undefined : sort, buyable: buyable ? '1' : undefined }} />
          </>
        )}

        {seoBody && seoBody !== intro && (
          <section className="mt-14 border-t border-gray-100 pt-10">
            <h2 className="font-serif text-xl font-bold text-bark mb-3">{st.about(displayName)}</h2>
            <div className="prose prose-sm max-w-3xl text-gray-600 leading-relaxed whitespace-pre-line">
              {seoBody}
            </div>
          </section>
        )}

        {/* FAQ copy is Ukrainian-only static content — show it on uk to avoid
            mixing languages on ru/en category pages. */}
        {locale === 'uk' && <FaqBlock items={categoryFaq(displayName)} />}
      </div>
    </div>
  )
}
