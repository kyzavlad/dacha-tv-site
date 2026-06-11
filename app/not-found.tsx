import type { Metadata } from 'next'
import Link from 'next/link'
import { CTAButton } from '@/components/shared/CTAButton'

export const metadata: Metadata = {
  title: 'Сторінку не знайдено',
  description: 'Сторінку не знайдено — поверніться на головну',
}

export default function NotFound() {
  return (
    <div className="bg-cream min-h-[70vh] flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 text-center py-16">
        <div className="w-20 h-20 bg-honey-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl font-serif font-bold text-honey-600">404</span>
        </div>

        <h1 className="font-serif text-3xl font-bold text-bark mb-4">
          Сторінку не знайдено
        </h1>

        <p className="text-bark/70 text-lg mb-8 leading-relaxed">
          Схоже, ця сторінка не існує або була переміщена. Поверніться на головну або перейдіть до каталогу.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <CTAButton href="/" size="lg">
            На головну
          </CTAButton>
          <CTAButton href="/honey" size="lg" variant="outline">
            Каталог меду
          </CTAButton>
        </div>
      </div>
    </div>
  )
}
