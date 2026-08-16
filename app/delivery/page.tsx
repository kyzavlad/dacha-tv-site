import type { Metadata } from 'next'
import { SellerInfo } from '@/components/shared/SellerInfo'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { pageDict } from '@/lib/i18n/pages'
import { buildAlternates, buildSocialMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const t = pageDict(locale)
  const { canonical, languages } = buildAlternates(locale, '/delivery')

  return buildSocialMetadata({
    bareTitle: t.delivery.title,
    description: t.delivery.intro,
    canonical,
    languages,
    imageAlt: t.delivery.title,
  })
}

// The payment section is always the LAST one in t.delivery.sections, so the
// #payment anchor is derived rather than pinned to a hardcoded index — adding a
// section (e.g. catalog delivery) can no longer move the anchor onto the wrong
// article.
const paymentAnchorIndex = (sections: readonly unknown[]) => sections.length - 1

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
          <article
            key={idx}
            id={idx === paymentAnchorIndex(t.delivery.sections) ? 'payment' : undefined}
            className="bg-white rounded-2xl p-6 border border-honey-100 shadow-sm"
          >
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
            href={localizedPath(locale, '/contact')}
            className="inline-flex items-center gap-2 bg-honey-700 hover:bg-honey-800 text-white font-semibold px-6 py-3 rounded-lg transition-colors min-h-[48px]"
          >
            {t.common.contactUs}
          </a>
        </div>
      </div>
    </div>
  )
}
