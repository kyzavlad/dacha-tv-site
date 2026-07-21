import type { Metadata } from 'next'
import { CTAButton } from '@/components/shared/CTAButton'
import { getRequestLocale } from '@/lib/i18n'
import { pageDict } from '@/lib/i18n/pages'

export const metadata: Metadata = {
  title: 'Сторінку не знайдено',
  description: 'Сторінку не знайдено — поверніться на головну',
}

export default async function NotFound() {
  const locale = await getRequestLocale()
  const t = pageDict(locale)
  return (
    <div className="bg-cream min-h-[70vh] flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 text-center py-16">
        <div className="w-20 h-20 bg-honey-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl font-serif font-bold text-honey-600">404</span>
        </div>

        <h1 className="font-serif text-3xl font-bold text-bark mb-4">
          {t.notFound.title}
        </h1>

        <p className="text-bark/70 text-lg mb-8 leading-relaxed">
          {t.notFound.body}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <CTAButton href="/" size="lg">
            {t.common.backHome}
          </CTAButton>
          <CTAButton href="/honey" size="lg" variant="outline">
            {t.notFound.honeyCatalog}
          </CTAButton>
        </div>
      </div>
    </div>
  )
}
