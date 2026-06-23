export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { CatalogCategory } from '@/types'
import {
  getPublishedCategories,
  getPublishedCategorySlugCounts,
  searchPublishedCatalogProducts,
} from '@/lib/supabase/catalog'
import { CategoryCard } from '@/components/catalog/CategoryCard'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { CatalogSearchBar } from '@/components/catalog/CatalogSearchBar'

export const metadata: Metadata = {
  title: 'Магазин',
  description: 'Магазин товарів для дому, саду та господарства: квіти, металопрофіль, покрівля та широкий асортимент від постачальників. Доставка по Україні.',
  alternates: { canonical: '/catalog' },
  openGraph: {
    title: 'Магазин товарів',
    description: 'Товари для дому, саду та господарства: квіти, металопрофіль, покрівля та широкий асортимент від постачальників.',
    siteName: 'Дача TV',
    type: 'website',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV: магазин товарів' }],
  },
}

function isNumericName(name: string | null | undefined): boolean {
  return !name || /^\d+$/.test(name.trim())
}

// Synthetic catch-all card for products that have no usable category (null,
// numeric, or pointing at an unpublished category). slug 'all' → /catalog/all.
const OTHER_CATEGORY: CatalogCategory = {
  id: '__other__',
  supplier_category_id: null,
  slug: 'all',
  name_ua: 'Інші товари',
  description: null,
  meta_title: null,
  meta_description: null,
  image_url: null,
  is_published: true,
  display_order: 9_999,
  created_at: '',
  updated_at: '',
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page: pageRaw } = await searchParams
  const query = (q ?? '').trim()

  // ── Search results (?q=) ──────────────────────────────────────────────────
  if (query) {
    const page = Math.max(1, Number(pageRaw) || 1)
    const { products } = await searchPublishedCatalogProducts(query, page).catch(() => ({ products: [], total: 0 }))
    const fullPage = products.length >= 24
    return (
      <div className="bg-cream min-h-screen">
        <div className="bg-white border-b border-gray-100 py-10 md:py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-4">Пошук у магазині</h1>
            <CatalogSearchBar defaultValue={query} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <p className="text-sm text-gray-500 mb-6">Результати за запитом «{query}»</p>
          {products.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map((p) => (
                  <CatalogProductCard key={p.id} product={p} categorySlug={p.category_slug ?? 'all'} />
                ))}
              </div>
              {(page > 1 || fullPage) && (
                <div className="flex justify-between items-center mt-10">
                  {page > 1 ? (
                    <Link href={`/catalog?q=${encodeURIComponent(query)}&page=${page - 1}`} className="text-honey-700 font-semibold hover:underline">← Попередня</Link>
                  ) : <span />}
                  {fullPage && (
                    <Link href={`/catalog?q=${encodeURIComponent(query)}&page=${page + 1}`} className="text-honey-700 font-semibold hover:underline">Наступна →</Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500">
              Нічого не знайдено. Спробуйте інший запит або{' '}
              <Link href="/catalog" className="text-honey-700 hover:underline">перегляньте категорії</Link>.
            </p>
          )}
        </div>
      </div>
    )
  }

  // Categories are derived from the products that are actually published, so the
  // grid renders regardless of whether the category_slug backfill/cron has run.
  const [allCategories, { bySlug, nullCount, total }] = await Promise.all([
    getPublishedCategories().catch(() => []),
    getPublishedCategorySlugCounts().catch(() => ({ bySlug: new Map<string, number>(), nullCount: 0, total: 0 })),
  ])

  // Eligible cards: published, human-readable (non-numeric) categories that
  // have at least one published product mapped to their slug.
  const usableCategories = allCategories.filter((cat) => !isNumericName(cat.name_ua))
  const usableSlugs = new Set(usableCategories.map((c) => c.slug))

  const visibleCategories = usableCategories
    .map((cat) => ({ cat, count: bySlug.get(cat.slug) ?? 0 }))
    .filter(({ count }) => count > 0)

  // Everything that doesn't land in a visible category → "Інші товари" bucket:
  // null slugs + slugs pointing at numeric / unpublished / missing categories.
  let otherCount = nullCount
  for (const [slug, n] of bySlug) {
    if (!usableSlugs.has(slug)) otherCount += n
  }

  const cards: Array<{ cat: CatalogCategory; count: number }> = [...visibleCategories]
  if (otherCount > 0) cards.push({ cat: OTHER_CATEGORY, count: otherCount })

  return (
    <div className="bg-cream min-h-screen">
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">
            Магазин
          </span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            Товари для дому, саду та господарства
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl mb-6">
            Товари для дому, саду та дачного господарства. Якість перевірена: доставка по Україні.
          </p>
          <CatalogSearchBar />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {cards.length > 0 ? (
          /* ── Category-first grid, derived from real published products ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {cards.map(({ cat, count }) => (
              <CategoryCard key={cat.id} category={cat} productCount={count} />
            ))}
          </div>
        ) : total > 0 ? (
          /* ── Products exist but none are presentable yet → browse-all path ── */
          <div className="max-w-xl mx-auto text-center py-16">
            <span className="text-5xl opacity-30 block mb-4" aria-hidden="true">🗂️</span>
            <p className="text-2xl font-serif text-bark mb-2">Усі товари</p>
            <p className="text-gray-500 text-sm mb-8">
              Перегляньте весь асортимент одним списком.
            </p>
            <Link
              href="/catalog/all"
              className="inline-flex items-center justify-center px-6 py-3 bg-honey-600 hover:bg-honey-700 text-white font-semibold rounded-xl transition-colors"
            >
              Переглянути всі товари →
            </Link>
          </div>
        ) : (
          /* ── True empty state ── */
          <div className="text-center py-20">
            <p className="text-2xl font-serif text-bark/40 mb-2">Незабаром</p>
            <p className="text-gray-400 text-sm">
              Каталог товарів готується. Заходьте пізніше або{' '}
              <Link href="/contact" className="text-honey-700 hover:underline">
                зв&apos;яжіться з нами
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
