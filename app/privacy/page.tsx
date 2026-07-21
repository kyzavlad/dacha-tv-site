import type { Metadata } from 'next'
import { getRequestLocale } from '@/lib/i18n'
import { pageDict } from '@/lib/i18n/pages'

export const metadata: Metadata = {
  title: 'Політика конфіденційності',
  description: 'Політика конфіденційності сайту Дача TV',
  alternates: { canonical: '/privacy' },
  robots: { index: false, follow: false },
}

export default async function PrivacyPage() {
  const locale = await getRequestLocale()
  const t = pageDict(locale)
  return (
    <div className="bg-cream min-h-screen">
      <div className="bg-honey-50 border-b border-honey-200 py-10 md:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark">
            {t.privacy.title}
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 text-bark/80 leading-relaxed">
        {t.privacy.sections.map((section, idx) => (
          <section key={idx}>
            <h2 className="font-serif text-2xl font-bold text-bark mb-4">{section.heading}</h2>
            <p className="whitespace-pre-line">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
