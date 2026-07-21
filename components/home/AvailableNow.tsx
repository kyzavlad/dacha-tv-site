import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n'
import { homeDict } from '@/lib/i18n/sections/home'

// "Зараз доступно" — a small, calm availability strip. Because much of the range
// is seasonal or made-to-order, this block states plainly what a visitor can get
// right now and links each item to its existing page. Intentionally low-key
// (no prices shouted, no urgency) to match the warm, trustworthy tone.
interface AvailableItem {
  emoji: string
  title: string
  note: string
  href: string
}

export async function AvailableNow() {
  const t = homeDict(await getRequestLocale())

  const ITEMS: AvailableItem[] = [
    { emoji: '🍯', title: t.availHoneyTitle, note: t.availHoneyNote, href: '/honey' },
    { emoji: '🍫', title: t.availChocolateTitle, note: t.availChocolateNote, href: '/products' },
    { emoji: '🌱', title: t.availOilTitle, note: t.availOilNote, href: '/products' },
    { emoji: '🐝', title: t.availBeesTitle, note: t.availBeesNote, href: '/beekeeper' },
  ]

  return (
    <section className="bg-cream py-16 md:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">
          {t.availEyebrow}
        </span>
        <h2 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
          {t.availTitle}
        </h2>
        <p className="text-gray-500 text-base max-w-2xl mb-8">
          {t.availIntro}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {ITEMS.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group bg-white rounded-2xl border border-honey-100 p-5 shadow-sm hover:shadow-md hover:border-honey-300 transition-all flex flex-col"
            >
              <span className="text-3xl mb-3" aria-hidden="true">{item.emoji}</span>
              <h3 className="font-serif text-lg font-semibold text-bark mb-1 leading-tight group-hover:text-honey-700 transition-colors">
                {item.title}
              </h3>
              <p className="text-sm text-bark/60 mb-4">{item.note}</p>
              <span className="mt-auto text-sm font-medium text-honey-700">
                {t.availView}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
