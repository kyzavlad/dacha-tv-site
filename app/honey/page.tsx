export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { HoneyGrid } from '@/components/honey/HoneyGrid'
import { CTAButton } from '@/components/shared/CTAButton'
import { getAllHoneyProducts } from '@/lib/supabase/queries'
import { getRequestLocale } from '@/lib/i18n'
import { manualDict } from '@/lib/i18n/sections/manual'

const HONEY_META: Record<'uk' | 'ru' | 'en', { title: string; description: string; ogDescription: string; ogAlt: string; twitterDescription: string }> = {
  uk: {
    title: 'Наш мед',
    description: "Натуральний мед від сімейної пасіки на Харківщині: Акація, Липа, Сонях, Різнотрав'я, Сади, Ліс. Упаковка 1L пластик або скло. Замовляйте напряму від пасічника без посередників.",
    ogDescription: "Сезонний мед без домішок: Акація, Липа, Сонях, Різнотрав'я від пасіки на Харківщині",
    ogAlt: 'Дача TV: Натуральний мед',
    twitterDescription: "Натуральний мед від сімейної пасіки на Харківщині: Акація, Липа, Сонях та інші сорти. Напряму від пасічника.",
  },
  ru: {
    title: 'Наш мёд',
    description: 'Натуральный мёд от семейной пасеки на Харьковщине: Акация, Липа, Подсолнух, Разнотравье, Сады, Лес. Упаковка 1L пластик или стекло. Заказывайте напрямую от пасечника без посредников.',
    ogDescription: 'Сезонный мёд без примесей: Акация, Липа, Подсолнух, Разнотравье от пасеки на Харьковщине',
    ogAlt: 'Дача TV: Натуральный мёд',
    twitterDescription: 'Натуральный мёд от семейной пасеки на Харьковщине: Акация, Липа, Подсолнух и другие сорта. Напрямую от пасечника.',
  },
  en: {
    title: 'Our honey',
    description: 'Natural honey from a family apiary in the Kharkiv region: Acacia, Linden, Sunflower, Wildflower, Orchard, Forest. Packed in 1L plastic or glass. Order directly from the beekeeper, no middlemen.',
    ogDescription: 'Seasonal, additive-free honey: Acacia, Linden, Sunflower, Wildflower from our Kharkiv-region apiary',
    ogAlt: 'Dacha TV: Natural honey',
    twitterDescription: 'Natural honey from a family apiary in the Kharkiv region: Acacia, Linden, Sunflower and other varieties. Direct from the beekeeper.',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const m = HONEY_META[locale]
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: '/honey' },
    openGraph: {
      title: m.title,
      description: m.ogDescription,
      type: 'website',
      images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: m.ogAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: m.title,
      description: m.twitterDescription,
    },
  }
}

export default async function HoneyPage() {
  const locale = await getRequestLocale()
  const t = manualDict(locale)
  const products = await getAllHoneyProducts().catch(() => [])

  return (
    <div className="bg-cream min-h-screen">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">{t.honeyEyebrow}</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            {t.honeyH1}
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl">
            {t.honeyIntro}
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
            {t.honeyPackagingTitle}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl p-5 border border-honey-200">
              <h3 className="font-semibold text-bark mb-2">{t.honeyPlasticTitle}</h3>
              <p className="text-bark/70 text-sm leading-relaxed">
                {t.honeyPlasticBody}
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-honey-200">
              <h3 className="font-semibold text-bark mb-2">{t.honeyGlassTitle}</h3>
              <p className="text-bark/70 text-sm leading-relaxed">
                {t.honeyGlassBody}
              </p>
            </div>
          </div>

          {/* Shipping insurance note */}
          <div className="mt-6 bg-white rounded-xl p-5 border border-honey-200 flex gap-3">
            <span className="text-xl flex-shrink-0" aria-hidden="true">🛡️</span>
            <p className="text-bark/70 text-sm leading-relaxed">
              {t.honeyInsuranceNote}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="bg-bark py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-cream mb-4">
            {t.honeyCtaTitle}
          </h2>
          <p className="text-cream/70 mb-6">
            {t.honeyCtaBody}
          </p>
          <CTAButton href="/contact" variant="white">
            {t.honeyCtaButton}
          </CTAButton>
        </div>
      </div>
    </div>
  )
}
