import { CTAButton } from '@/components/shared/CTAButton'

const DELIVERY_CARDS = [
  {
    title: 'Мед та продукти пасіки',
    description: 'Відправляємо по всій Україні — Новою Поштою або Укрпоштою. Надійна упаковка для безпечного транспортування.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  {
    title: 'Бджолопакети та вулики',
    description: 'Самовивіз або індивідуальна домовленість з доставкою. Уточніть деталі при оформленні заявки.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
      </svg>
    ),
  },
]

export function DeliveryTeaser() {
  return (
    <section className="py-20 md:py-28 bg-white" aria-labelledby="delivery-teaser-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Text side */}
          <div>
            <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-4 block">
              Доставка
            </span>
            <h2 id="delivery-teaser-heading" className="font-serif text-3xl md:text-4xl font-bold text-bark mb-5 leading-tight">
              По всій Україні — надійно і вчасно
            </h2>
            <p className="text-gray-500 text-lg mb-8 leading-relaxed">
              Ми на Харківщині, але відправляємо в будь-яку точку країни. Кожне замовлення — надійно упаковане, щоб мед дістався до вас у цілості.
            </p>
            <CTAButton href="/delivery" variant="outline">
              Детальніше про доставку
            </CTAButton>
          </div>

          {/* Cards side */}
          <div className="flex flex-col gap-4">
            {DELIVERY_CARDS.map(({ title, description, icon }) => (
              <div
                key={title}
                className="flex items-start gap-5 bg-gray-50 rounded-2xl p-6 border border-gray-100"
              >
                <div className="w-12 h-12 bg-honey-100 rounded-xl flex items-center justify-center flex-shrink-0 text-honey-700">
                  {icon}
                </div>
                <div>
                  <h3 className="font-semibold text-bark text-base mb-1.5">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
                </div>
              </div>
            ))}

            {/* Mini trust strip */}
            <div className="flex items-center gap-6 pt-2 pl-1">
              {['Нова Пошта', 'Укрпошта', 'Самовивіз'].map((method) => (
                <div key={method} className="flex items-center gap-1.5 text-sm text-gray-400">
                  <svg className="w-4 h-4 text-honey-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {method}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
