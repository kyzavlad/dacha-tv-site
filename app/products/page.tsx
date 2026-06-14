export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { CTAButton } from '@/components/shared/CTAButton'
import { ProductsCatalog } from '@/components/products/ProductsCatalog'
import { getAllHoneyProducts, getAllApiaryProducts } from '@/lib/supabase/queries'
import { getNaturalProducts } from '@/lib/supabase/catalog'

export const metadata: Metadata = {
  title: 'Продукти',
  description:
    'Натуральні продукти, продукти пасіки та сезонні товари господарства з Харківщини: мед, пилок, прополіс, жимолость, живі олії, Іван-чай, часник, саджанці та інше.',
  alternates: { canonical: '/products' },
  openGraph: {
    title: 'Продукти',
    description: 'Натуральні продукти, продукти пасіки та сезонні товари господарства з Харківщини.',
    siteName: 'Дача TV',
    type: 'website',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Продукти',
    description: 'Натуральні продукти, продукти пасіки та сезонні товари господарства з Харківщини.',
  },
}

export default async function ProductsPage() {
  const [honey, apiary, natural] = await Promise.all([
    getAllHoneyProducts().catch(() => []),
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
            Натуральні продукти, продукти пасіки та сезонні товари господарства з Харківщини.
          </p>
        </div>
      </div>

      {/* Unified catalog: honey + bee products + natural farm products, one grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <ProductsCatalog honey={honey} apiary={apiary} natural={natural} />
      </div>

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
