import type { Metadata } from 'next'
import { SellerInfo } from '@/components/shared/SellerInfo'
import { getRequestLocale } from '@/lib/i18n'
import { pageDict } from '@/lib/i18n/pages'

export const metadata: Metadata = {
  title: 'Доставка',
  description:
    "Доставка замовлень по всій Україні: Нова Пошта, Укрпошта. Мед, натуральні продукти, квіти, товари магазину. Бджолопакети та вулики: самовивіз або за домовленістю.",
  alternates: { canonical: '/delivery' },
  openGraph: {
    title: 'Доставка',
    description: 'Доставка по всій Україні: Нова Пошта, Укрпошта. Товари магазину, мед, натуральні продукти, квіти.',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV: Доставка' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Доставка',
    description: 'Доставка по всій Україні: Нова Пошта, Укрпошта. Товари магазину, мед, натуральні продукти, квіти.',
  },
}

// The 5th section (index 4) is the payment anchor.
const SECTION_IDS = [undefined, undefined, undefined, undefined, 'payment'] as const

export default async function DeliveryPage() {
  const locale = await getRequestLocale()
  const t = pageDict(locale)
  return (
    <div className="bg-cream min-h-screen">
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">{t.delivery.eyebrow}</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            {t.delivery.title}
          </h1>
          <p className="text-gray-500 text-lg max-w-xl">
            {t.delivery.intro}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        {t.delivery.sections.map((section, idx) => (
          <article key={idx} id={SECTION_IDS[idx]} className="bg-white rounded-2xl p-6 border border-honey-100 shadow-sm">
            <h2 className="font-serif text-2xl font-bold text-bark mb-4">
              {section.heading}
            </h2>
            <div className="text-bark/80 leading-relaxed">
              <p>{section.body}</p>
            </div>
          </article>
        ))}

        <SellerInfo />

        {/* Questions CTA */}
        <div className="bg-honey-50 rounded-2xl p-6 border border-honey-200 text-center">
          <h2 className="font-serif text-xl font-bold text-bark mb-3">
            {t.delivery.questionsTitle}
          </h2>
          <p className="text-bark/70 mb-4">
            {t.delivery.questionsBody}
          </p>
          <a
            href="/contact"
            className="inline-flex items-center gap-2 bg-honey-700 hover:bg-honey-800 text-white font-semibold px-6 py-3 rounded-lg transition-colors min-h-[48px]"
          >
            {t.common.contactUs}
          </a>
        </div>
      </div>
    </div>
  )
}
