export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { ProductGrid } from '@/components/products/ProductGrid'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { CTAButton } from '@/components/shared/CTAButton'
import { getAllApiaryProducts } from '@/lib/supabase/queries'
import { getNaturalProducts } from '@/lib/supabase/catalog'

export const metadata: Metadata = {
  title: 'Продукти',
  description:
    'Продукти (пилок, прополіс, горіхи в меду) та натуральні продукти господарства: жимолость, живі олії холодного віджиму, Іван-чай, часник. Від сімейного господарства на Харківщині.',
  alternates: { canonical: '/products' },
  openGraph: {
    title: 'Продукти',
    description: 'Продукти та натуральні продукти господарства: пилок, прополіс, жимолость, живі олії, Іван-чай, часник.',
    siteName: 'Дача TV',
    type: 'website',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Продукти',
    description: 'Продукти та натуральні продукти господарства: від сімейного господарства на Харківщині.',
  },
}

export default async function ProductsPage() {
  const [products, naturalProducts] = await Promise.all([
    getAllApiaryProducts().catch(() => []),
    getNaturalProducts().catch(() => []),
  ])

  return (
    <div className="bg-cream min-h-screen">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">Продукти</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            Продукти господарства
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl">
            Натуральні продукти, продукти пасіки та сезонні товари господарства: пилок, прополіс, горіхи в меду, жимолость, живі олії, Іван-чай, часник та інше.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">Продукти</span>
        <h2 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-8">
          Продукти
        </h2>
        <ProductGrid products={products} />
      </div>

      {/* Natural / farm products: жимолость, олії, Іван-чай, часник тощо.
          Live in catalog_products (source='manual') but presented here, not in
          the /catalog shop. */}
      {naturalProducts.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="border-t border-gray-100 pt-12">
            <span className="text-xs font-semibold text-forest-700 uppercase tracking-widest mb-3 block">Натуральні продукти господарства</span>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
              Жимолость, живі олії, Іван-чай та інше
            </h2>
            <p className="text-gray-500 text-base max-w-2xl mb-8">
              Натуральні продукти від господарства. Наявність і ціни уточнюйте: залиште заявку на сторінці товару.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {naturalProducts.map((product) => (
                <CatalogProductCard
                  key={product.id}
                  product={product}
                  categorySlug={product.category_slug ?? 'naturalni-produkty'}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="bg-bark py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-cream mb-4">
            Потрібна допомога у виборі?
          </h2>
          <p className="text-cream/70 mb-6">
            Зателефонуйте або залиште заявку: ми відповімо на всі питання
          </p>
          <CTAButton href="/contact" variant="white">
            Зв&apos;язатись з нами
          </CTAButton>
        </div>
      </div>
    </div>
  )
}
