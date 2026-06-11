import type { Metadata } from 'next'
import { SellerInfo } from '@/components/shared/SellerInfo'

export const metadata: Metadata = {
  title: 'Доставка',
  description:
    "Доставка меду та продуктів пасіки по всій Україні — Нова Пошта, Укрпошта. Бджолопакети та вулики — самовивіз або індивідуальна домовленість.",
  alternates: { canonical: '/delivery' },
  openGraph: {
    title: 'Доставка | Дача TV',
    description: 'Доставка меду та продуктів пасіки по всій Україні — Нова Пошта, Укрпошта.',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV — Доставка' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Доставка | Дача TV',
    description: 'Доставка меду та продуктів пасіки по всій Україні — Нова Пошта, Укрпошта.',
  },
}

const STATIC_SECTIONS = [
  {
    heading: 'Мед та продукти пасіки',
    body: 'Відправляємо по всій Україні — Новою Поштою або Укрпоштою. Орієнтовний термін доставки: 1–3 робочих дні залежно від регіону. Мінімальне замовлення не встановлено.',
  },
  {
    heading: 'Упаковка для відправки',
    body: 'Банки упаковуються в захисну пінопластову або картонну упаковку, яка запобігає пошкодженням при транспортуванні. Скляні банки упаковуємо окремо з додатковим захистом.',
  },
  {
    heading: 'Міжнародна доставка',
    body: 'Можливе відправлення за кордон — уточнюйте при замовленні. Конкретні умови залежать від країни призначення та поточних регуляцій.',
  },
  {
    heading: 'Бджолопакети та вулики',
    body: 'Живі тварини та вулики відправляємо виключно самовивозом або індивідуальною домовленістю. Передача відбувається особисто в Коротичі, Харківська область, або за домовленістю.',
  },
  {
    heading: 'Оплата',
    body: 'Приймаємо оплату банківським переказом (Monobank) або готівкою при самовивозі. Оплата накладеним платежем також можлива при відправці Новою Поштою. Деталі уточнюйте при оформленні замовлення.',
  },
]

export default function DeliveryPage() {
  return (
    <div className="bg-cream min-h-screen">
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">Доставка та оплата</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            Доставка
          </h1>
          <p className="text-gray-500 text-lg max-w-xl">
            Відправляємо по всій Україні — Новою Поштою або Укрпоштою.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        {STATIC_SECTIONS.map((section, idx) => (
          <article key={idx} className="bg-white rounded-2xl p-6 border border-honey-100 shadow-sm">
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
            Є питання щодо доставки?
          </h2>
          <p className="text-bark/70 mb-4">
            Зателефонуйте або напишіть — відповімо швидко
          </p>
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
