export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import type { BeekeeperProduct } from '@/types'
import { BeekeeperCard } from '@/components/beekeeper/BeekeeperCard'
import { BeekeeperInquiryForm } from '@/components/forms/BeekeeperInquiryForm'
import { PhoneLink } from '@/components/shared/PhoneLink'
import { getAllBeekeeperProducts } from '@/lib/supabase/queries'
import { LAUNCH_PHONE } from '@/lib/launch-defaults'

// High-ticket beekeeper offering, presented as a compact block (not mixed into
// the general products grid). Відводки and ППУ вулики have no dedicated product
// rows yet, so they live here and route to the inquiry form / phone.
const BEEKEEPER_OFFERS: { title: string; note: string }[] = [
  { title: "Бджолосімʼї", note: 'Сильні сімʼї від власної пасіки, з урахуванням сезону та породи.' },
  { title: 'Відводки', note: 'Відводки на замовлення — уточнюйте наявність та терміни.' },
  { title: 'Вулики ППУ', note: 'Вулики з пінополіуретану — легкі, теплі. Наявність за запитом.' },
  { title: 'Консультація / підбір', note: 'Допоможемо підібрати рішення під вашу пасіку.' },
]

export const metadata: Metadata = {
  title: 'Для пасічників',
  description:
    "Бджолопакети (Buckfast, Карніка), бджолосім'ї, вулики та товари пасічника від власної пасіки на Харківщині. Без посередників: напряму від пасічника.",
  alternates: { canonical: '/beekeeper' },
  openGraph: {
    title: 'Для пасічників',
    description: "Бджолопакети, бджолосім'ї, вулики та товари пасічника від пасіки Дача TV на Харківщині",
    type: 'website',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV: Для пасічників' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Для пасічників',
    description: "Бджолопакети Buckfast та Карніка, бджолосім'ї, вулики: напряму від пасічника на Харківщині.",
  },
}

const TYPE_HEADINGS: Record<string, string> = {
  bee_packages: 'Бджолопакети',
  bee_colonies: "Бджолосім'ї",
  empty_hives: 'Порожні вулики',
  hives_with_bees: 'Вулики з бджолами',
  apiary_supply: 'Товари пасічника',
}

const TYPE_ORDER = ['bee_packages', 'bee_colonies', 'empty_hives', 'hives_with_bees', 'apiary_supply']

export default async function BeekeeperPage() {
  const products = await getAllBeekeeperProducts().catch(() => [])

  const byType: Record<string, BeekeeperProduct[]> = {}
  for (const p of products) {
    if (!byType[p.product_type]) byType[p.product_type] = []
    byType[p.product_type].push(p)
  }

  const activeTypes = [...new Set([...TYPE_ORDER, ...Object.keys(byType)])].filter((t) => byType[t]?.length)

  return (
    <div className="bg-cream min-h-screen">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">Для пасічників</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            Бджолопакети та вулики
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl">
            Ми пасічники, і розуміємо, що вам потрібно. Пропонуємо бджолопакети, бджолосім&apos;ї та вулики: з індивідуальним підходом.
          </p>

          {/* Type quick-jump links */}
          {activeTypes.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {activeTypes.map((t) => (
                <a
                  key={t}
                  href={`#${t}`}
                  className="text-xs text-bark/50 border border-bark/20 px-3 py-1.5 rounded-full hover:text-bark hover:border-bark/40 transition-colors"
                >
                  {TYPE_HEADINGS[t] ?? t}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

          {/* Product catalog */}
          <div className="lg:col-span-2 space-y-14">

            {/* Offering block — бджолосімʼї / відводки / ППУ вулики / консультація.
                Kept out of the generic grid; routes to the inquiry form / phone. */}
            <section aria-labelledby="offers-heading" className="bg-white rounded-2xl p-6 border border-forest-100">
              <h2 id="offers-heading" className="font-serif text-2xl font-bold text-bark mb-1">
                Що пропонуємо пасічникам
              </h2>
              <p className="text-bark/60 text-sm mb-5">
                Напряму від пасічника. Наявність і ціни залежать від сезону — уточнюйте.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {BEEKEEPER_OFFERS.map((o) => (
                  <div key={o.title} className="rounded-xl border border-forest-100 bg-forest-50/40 p-4">
                    <h3 className="font-semibold text-bark mb-1">{o.title}</h3>
                    <p className="text-bark/70 text-sm leading-relaxed">{o.note}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-5">
                <a
                  href="#inquiry-form"
                  className="inline-flex items-center justify-center rounded-lg bg-forest-700 text-white text-sm font-semibold px-5 py-2.5 hover:bg-forest-800 transition-colors"
                >
                  Залишити заявку
                </a>
                <span className="text-sm text-bark/60">
                  або зателефонуйте:{' '}
                  <PhoneLink phone={LAUNCH_PHONE} showIcon location="beekeeper-offers" className="text-sm" />
                </span>
              </div>
            </section>

            {activeTypes.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-forest-100 text-center">
                <p className="text-bark/60">
                  Каталог поповнюється. Залиште заявку: ми зв&apos;яжемося для обговорення.
                </p>
              </div>
            ) : (
              activeTypes.map((type) => {
                const group = byType[type] ?? []
                return (
                  <section key={type} id={type} aria-labelledby={`${type}-heading`}>
                    <div className="flex items-center gap-3 mb-6">
                      <span className="w-6 h-px bg-forest-300" />
                      <h2 id={`${type}-heading`} className="font-serif text-2xl font-bold text-bark">
                        {TYPE_HEADINGS[type] ?? type}
                      </h2>
                      <span className="text-sm text-bark/40">{group.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {group.map((p) => (
                        <BeekeeperCard key={p.id} product={p} />
                      ))}
                    </div>
                  </section>
                )
              })
            )}

            {/* Important note */}
            <div className="bg-honey-50 rounded-2xl p-6 border border-honey-200">
              <h3 className="font-semibold text-bark mb-2">Важливо знати</h3>
              <p className="text-bark/70 text-sm leading-relaxed">
                Всі бджолопродукти: живі тварини зі складною сезонною логістикою. Ціни залежать від сезону, породи та кількості. Ми завжди повідомляємо про реальну наявність. Залиште заявку: і ми зв&apos;яжемося для обговорення деталей.
              </p>
            </div>
          </div>

          {/* Sticky inquiry form */}
          <div className="lg:col-span-1">
            <div id="inquiry-form" className="lg:sticky lg:top-24">
              <div className="bg-forest-50 rounded-2xl p-6 border border-forest-200">
                <h2 className="font-serif text-2xl font-bold text-bark mb-2">
                  Залишити заявку
                </h2>
                <p className="text-bark/60 text-sm mb-6">
                  Щоб дізнатись наявність та вартість: залиште заявку або зателефонуйте
                </p>
                <BeekeeperInquiryForm source="/beekeeper" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
