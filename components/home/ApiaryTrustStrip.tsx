import Link from 'next/link'

const TRUST_ITEMS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    label: 'Офіційна реєстрація ФОП',
    detail: 'ФОП Козинець Д.С. — документи та чеки на вимогу',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    label: 'Доставка по Україні',
    detail: 'Нова Пошта та кур\'єр — у будь-яке місто',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    label: 'Відкрито на YouTube',
    detail: 'Садиба, пасіка, поля — весь процес без прикрас',
  },
]

export function ApiaryTrustStrip() {
  return (
    <section className="py-10 bg-gray-950" aria-label="Довіра та прозорість">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-4">
          {TRUST_ITEMS.map(({ icon, label, detail }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 text-white">
                {icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-white/30">
            Садиба Дача TV — с. Коротич, Харківська область. Документи та чеки — на вимогу.
          </p>
          <Link
            href="/about"
            className="text-xs text-white/50 hover:text-white transition-colors underline underline-offset-2"
          >
            Докладніше про нас
          </Link>
        </div>
      </div>
    </section>
  )
}
