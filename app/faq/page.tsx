import type { Metadata } from 'next'
import type { FaqItem } from '@/types'
import { getAllFaqItems } from '@/lib/supabase/queries'
import { StructuredData } from '@/components/shared/StructuredData'

export const metadata: Metadata = {
  title: 'Часті запитання',
  description:
    'Відповіді на часті запитання про мед, замовлення, доставку та бджільництво від пасіки Дача TV на Харківщині.',
  alternates: { canonical: '/faq' },
  openGraph: {
    title: 'FAQ | Дача TV',
    description: 'Часті запитання про мед, замовлення, доставку та бджільництво від пасіки Дача TV.',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV — FAQ' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FAQ | Дача TV',
    description: 'Часті запитання про мед, замовлення, доставку та бджільництво від пасіки Дача TV.',
  },
}

type FaqCategory = 'products' | 'ordering' | 'delivery' | 'beekeeping'

const CATEGORY_LABELS: Record<FaqCategory, string> = {
  products: 'Про продукти',
  ordering: 'Замовлення',
  delivery: 'Доставка',
  beekeeping: 'Бджільництво',
}

const CATEGORIES: FaqCategory[] = ['products', 'ordering', 'delivery', 'beekeeping']

const STATIC_FAQ: FaqItem[] = [
  { id: 's1', question: 'Як замовити мед?', answer: 'Ви можете залишити заявку на сайті або зателефонувати нам напряму. Ми уточнимо сорт, упаковку та спосіб доставки.', category: 'ordering', display_order: 1 },
  { id: 's2', question: 'Які сорти меду у вас є?', answer: 'Наявність залежить від сезону. Основні сорти: акація, липа, сонях, різнотрав\'я, садовий та лісовий мед.', category: 'products', display_order: 1 },
  { id: 's3', question: 'У якій упаковці доступний мед?', answer: 'Основні варіанти: 1 л пластик та 1 л скло.', category: 'products', display_order: 2 },
  { id: 's4', question: 'Чи є доставка по Україні?', answer: 'Так, ми відправляємо замовлення по Україні службами доставки.', category: 'delivery', display_order: 1 },
  { id: 's5', question: 'Чи можна замовити самовивіз?', answer: 'Так, деталі самовивозу узгоджуються під час оформлення.', category: 'delivery', display_order: 2 },
  { id: 's6', question: 'Як швидко ви відповідаєте?', answer: 'Зазвичай відповідаємо протягом кількох годин.', category: 'ordering', display_order: 2 },
  { id: 's7', question: 'Чи є у вас продукція для пасічників?', answer: 'Так, окрім меду, ми маємо продукцію для пасічників, зокрема приманку для роїв.', category: 'beekeeping', display_order: 1 },
  { id: 's8', question: 'Чи весь мед натуральний?', answer: 'Так, ми продаємо натуральний мед із власної сімейної пасіки.', category: 'products', display_order: 3 },
  { id: 's9', question: 'Чому деяких сортів може тимчасово не бути?', answer: 'Мед є сезонним продуктом, тому окремі сорти можуть бути недоступні в окремі періоди.', category: 'products', display_order: 4 },
  { id: 's10', question: 'Чи можна уточнити деталі перед замовленням?', answer: 'Так, ми завжди можемо проконсультувати перед оформленням заявки.', category: 'ordering', display_order: 3 },
]

export default async function FaqPage() {
  const dbItems = await getAllFaqItems().catch(() => [])
  const items = dbItems.length > 0 ? dbItems : STATIC_FAQ

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
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">FAQ</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            Часті запитання
          </h1>
          <p className="text-gray-500 text-lg max-w-xl">
            Відповіді на найпоширеніші запитання про наш мед, замовлення та доставку.
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
                {CATEGORY_LABELS[cat]}
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
          <h2 className="font-serif text-xl font-bold text-bark mb-3">Не знайшли відповіді?</h2>
          <p className="text-bark/70 mb-4">Зателефонуйте або напишіть — відповімо на будь-яке питання</p>
          <a
            href="/contact"
            className="inline-flex items-center gap-2 bg-honey-700 hover:bg-honey-800 text-white font-semibold px-6 py-3 rounded-lg transition-colors min-h-[48px]"
          >
            Зв&apos;язатись з нами
          </a>
        </div>
      </div>
    </div>
  )
}
