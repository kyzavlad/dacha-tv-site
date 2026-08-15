import type { Metadata } from 'next'
import Link from 'next/link'
import { StructuredData } from '@/components/shared/StructuredData'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { pageDict } from '@/lib/i18n/pages'
import { getStaticFaqItems } from '@/lib/i18n/static-faq'
import { buildAlternates, buildSocialMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const t = pageDict(locale)
  const { canonical, languages } = buildAlternates(locale, '/faq')

  return buildSocialMetadata({
    bareTitle: t.faq.title,
    description: t.faq.intro,
    canonical,
    languages,
    imageAlt: t.faq.title,
  })
}

type FaqCategory = 'products' | 'ordering' | 'delivery' | 'beekeeping'

const CATEGORIES: FaqCategory[] = ['products', 'ordering', 'delivery', 'beekeeping']

export default async function FaqPage() {
  const locale = await getRequestLocale()
  const t = pageDict(locale)
  const items = getStaticFaqItems(locale)

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }

  const grouped = CATEGORIES.reduce<Record<FaqCategory, typeof items>>(
    (acc, cat) => {
      acc[cat] = items.filter((item) => item.category === cat)
      return acc
    },
    { products: [], ordering: [], delivery: [], beekeeping: [] }
  )

  return (
    <div className="bg-cream min-h-screen">
      <StructuredData data={faqSchema} />

      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">{t.faq.eyebrow}</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            {t.faq.title}
          </h1>
          <p className="text-gray-500 text-lg max-w-xl">
            {t.faq.intro}
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {CATEGORIES.map((cat) => {
          const catItems = grouped[cat]
          if (catItems.length === 0) return null

          return (
            <section key={cat} aria-labelledby={`faq-${cat}`}>
              <h2 id={`faq-${cat}`} className="font-serif text-2xl font-bold text-bark mb-6">
                {t.faq.categories[cat]}
              </h2>
              <div className="space-y-3">
                {catItems.map((item) => (
                  <details
                    key={item.id}
                    className="bg-white rounded-xl border border-honey-100 shadow-sm overflow-hidden group"
                  >
                    <summary className="flex items-center justify-between gap-4 p-5 cursor-pointer font-semibold text-bark hover:text-honey-700 transition-colors min-h-[56px]">
                      <span>{item.question}</span>
                      <svg
                        className="w-5 h-5 flex-shrink-0 text-bark/40 group-open:rotate-180 transition-transform"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div className="px-5 pb-5 text-bark/80 leading-relaxed border-t border-honey-50 pt-4">
                      {item.answer}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )
        })}

        <div className="bg-honey-50 rounded-2xl p-6 border border-honey-200 text-center">
          <h2 className="font-serif text-xl font-bold text-bark mb-3">{t.faq.ctaTitle}</h2>
          <p className="text-bark/70 mb-4">{t.faq.ctaBody}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={localizedPath(locale, '/catalog')}
              className="inline-flex items-center gap-2 bg-honey-700 hover:bg-honey-800 text-white font-semibold px-6 py-3 rounded-lg transition-colors min-h-[48px]"
            >
              {t.common.toCatalog}
            </Link>
            <Link
              href={localizedPath(locale, '/contact')}
              className="inline-flex items-center gap-2 border border-honey-700 text-honey-800 hover:bg-honey-100 font-semibold px-6 py-3 rounded-lg transition-colors min-h-[48px]"
            >
              {t.common.contactUs}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
