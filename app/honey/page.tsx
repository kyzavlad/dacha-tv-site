export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { HoneyGrid } from '@/components/honey/HoneyGrid'
import { CTAButton } from '@/components/shared/CTAButton'
import { getAllHoneyProducts } from '@/lib/supabase/queries'

export const metadata: Metadata = {
  title: 'Наш мед',
  description:
    "Натуральний мед від сімейної пасіки на Харківщині — Акація, Липа, Сонях, Різнотрав'я, Сади, Ліс. Упаковка 1L пластик або скло. Замовляйте напряму від пасічника без посередників.",
  alternates: { canonical: '/honey' },
  openGraph: {
    title: 'Наш мед | Дача TV',
    description: "Сезонний мед без домішок: Акація, Липа, Сонях, Різнотрав'я від пасіки на Харківщині",
    type: 'website',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV — Натуральний мед' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Наш мед | Дача TV',
    description: "Натуральний мед від сімейної пасіки на Харківщині — Акація, Липа, Сонях та інші сорти. Напряму від пасічника.",
  },
}

export default async function HoneyPage() {
  const products = await getAllHoneyProducts().catch(() => [])

  return (
    <div className="bg-cream min-h-screen">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">Каталог</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            Наш мед
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl">
            Сезонний мед без домішок. Акація, Липа, Сонях — кожен сорт зібраний у свій час і відповідає природному циклу цвітіння.
          </p>
        </div>
      </div>

      {/* Products */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <HoneyGrid products={products} />
      </div>

      {/* Packaging note */}
      <div className="bg-honey-50 border-t border-honey-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="font-serif text-2xl font-bold text-bark mb-4">
            Про упаковку
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl p-5 border border-honey-200">
              <h3 className="font-semibold text-bark mb-2">1L пластик</h3>
              <p className="text-bark/70 text-sm leading-relaxed">
                Надійна й легка упаковка — зручна для щоденного використання та відправки Новою Поштою. Займає мінімум місця.
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-honey-200">
              <h3 className="font-semibold text-bark mb-2">1L скло</h3>
              <p className="text-bark/70 text-sm leading-relaxed">
                Ідеально для подарунка — виглядає красиво і підкреслює якість продукту. Скляна банка зберігає мед без впливу пластику.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="bg-bark py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-cream mb-4">
            Не знаєте, що обрати?
          </h2>
          <p className="text-cream/70 mb-6">
            Зателефонуйте нам або залиште заявку — ми допоможемо підібрати потрібний сорт
          </p>
          <CTAButton href="/contact" variant="white">
            Зв&apos;язатись з нами
          </CTAButton>
        </div>
      </div>
    </div>
  )
}
