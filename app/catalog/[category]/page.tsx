export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCategoryBySlug, getPublishedProductsByCategory, CATALOG_PAGE_SIZE } from '@/lib/supabase/catalog'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { Breadcrumb } from '@/components/catalog/Breadcrumb'
import { Pagination } from '@/components/catalog/Pagination'
import { buildSocialMetadata, stripBrand } from '@/lib/seo'

interface Props {
  params: Promise<{ category: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params
  const cat = await getCategoryBySlug(slug).catch(() => null)
  if (!cat) return { title: 'Категорія не знайдена' }

  const bareTitle = stripBrand(cat.meta_title) || cat.name_ua
  const description = cat.meta_description || cat.description || `Каталог товарів категорії «${cat.name_ua}». Замовляйте з доставкою по Україні.`

  return buildSocialMetadata({
    bareTitle,
    description,
    canonical: `/catalog/${slug}`,
    image: cat.image_url,
    imageAlt: cat.name_ua,
  })
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params
  const { page: pageStr } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)

  const [cat, { products, total }] = await Promise.all([
    getCategoryBySlug(slug).catch(() => null),
    getPublishedProductsByCategory(slug, page).catch(() => ({ products: [], total: 0 })),
  ])

  if (!cat) notFound()

  const totalPages = Math.ceil(total / CATALOG_PAGE_SIZE)

  return (
    <div className="bg-cream min-h-screen">
      <div className="bg-white border-b border-gray-100 py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={[
            { label: 'Головна', href: '/' },
            { label: 'Каталог', href: '/catalog' },
            { label: cat.name_ua },
          ]} />
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mt-4 mb-2">
            {cat.name_ua}
          </h1>
          {cat.description && (
            <p className="text-gray-500 text-base max-w-2xl">{cat.description}</p>
          )}
          {total > 0 && (
            <p className="text-xs text-gray-400 mt-2">{total} товарів{page > 1 ? ` · сторінка ${page} з ${totalPages}` : ''}</p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-bark/40 text-sm">У цій категорії поки немає товарів.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {products.map((product) => (
                <CatalogProductCard key={product.id} product={product} categorySlug={slug} />
              ))}
            </div>
            <Pagination page={page} total={total} baseHref={`/catalog/${slug}`} />
          </>
        )}
      </div>
    </div>
  )
}
