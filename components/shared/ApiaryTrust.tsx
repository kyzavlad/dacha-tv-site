import { existsSync } from 'fs'
import { join } from 'path'
import Image from 'next/image'

const PASSPORT_IMAGE = '/images/dacha-tv/documents/apiary-passport.jpg'

const TRUST_POINTS = [
  {
    title: 'Пасіка зареєстрована',
    body: 'Офіційна реєстрація пасіки відповідно до законодавства України.',
  },
  {
    title: 'Є ветеринарно-санітарний паспорт пасіки',
    body: 'Документ державного зразка, що підтверджує санітарний стан та відповідність норм.',
  },
  {
    title: 'Працюємо відкрито та прозоро',
    body: 'Вся робота задокументована. Документи надаємо на вимогу.',
  },
]

export function ApiaryTrust() {
  const hasPassportImage = existsSync(join(process.cwd(), 'public', PASSPORT_IMAGE))

  return (
    <section aria-labelledby="trust-apiary-heading" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 md:p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <h3 id="trust-apiary-heading" className="font-serif text-xl font-bold text-gray-900">
              Офіційно зареєстрована пасіка
            </h3>
            <p className="text-gray-500 text-sm mt-0.5">
              Документи підтверджують якість і відкритість нашого виробництва
            </p>
          </div>
        </div>

        <ul className="space-y-4 mb-6">
          {TRUST_POINTS.map(({ title, body }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-green-50 border border-green-200 flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{title}</p>
                <p className="text-gray-500 text-xs leading-relaxed mt-0.5">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        {hasPassportImage ? (
          <div className="mb-5">
            <a
              href={PASSPORT_IMAGE}
              target="_blank"
              rel="noopener"
              className="block relative aspect-[16/10] rounded-xl overflow-hidden border border-gray-100 hover:border-gray-300 transition-colors bg-gray-50"
              aria-label="Відкрити ветеринарно-санітарний паспорт пасіки у повному розмірі"
            >
              <Image
                src={PASSPORT_IMAGE}
                alt="Ветеринарно-санітарний паспорт пасіки Дача TV"
                fill
                className="object-contain object-center"
                sizes="(max-width: 768px) 100vw, 700px"
              />
            </a>
            <a
              href={PASSPORT_IMAGE}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mt-2 transition-colors"
            >
              Відкрити документ
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        ) : (
          <div className="aspect-[16/10] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 mb-5">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm text-gray-400">Фото паспорта пасіки</p>
            <p className="text-xs text-gray-300">public/images/dacha-tv/documents/apiary-passport.jpg</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {['Офіційна реєстрація', 'Ветеринарний нагляд', 'Прозоре виробництво'].map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" aria-hidden="true" />
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
