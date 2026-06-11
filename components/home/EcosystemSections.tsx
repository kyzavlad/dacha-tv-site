import Link from 'next/link'

// The full Dacha TV ecosystem — the homepage is no longer a honey-only landing.
// Each card links into one pillar of the site.
const SECTIONS = [
  {
    href: '/honey',
    emoji: '🍯',
    title: 'Мед і продукти пасіки',
    text: 'Сезонний мед, пилок, прополіс та бджолопакети напряму від сімейної пасіки.',
    accent: 'from-honey-50 to-honey-100 border-honey-200',
  },
  {
    href: '/products',
    emoji: '🌿',
    title: 'Натуральні продукти господарства',
    text: 'Жимолість, живі олії холодного віджиму, ферментований Іван-чай, озимий часник.',
    accent: 'from-forest-50 to-forest-100 border-forest-200',
  },
  {
    href: '/flowers',
    emoji: '🌸',
    title: 'Квіти',
    text: 'Сезонні квіти та композиції під замовлення.',
    accent: 'from-rose-50 to-rose-100 border-rose-200',
  },
  {
    href: '/lavender',
    emoji: '💜',
    title: 'Лаванда',
    text: 'Лавандове поле, фотозйомка та лавандові продукти.',
    accent: 'from-violet-50 to-violet-100 border-violet-200',
  },
  {
    href: '/catalog/metaloprofil-pokrivlia-komplektuiuchi',
    emoji: '🏗️',
    title: 'Металопрофіль і покрівля',
    text: 'Профнастил, металочерепиця, штахетник, комплектуючі та саморізи під розмір.',
    accent: 'from-slate-50 to-slate-100 border-slate-200',
  },
  {
    href: '/catalog',
    emoji: '🛒',
    title: 'Магазин товарів',
    text: 'Товари для дому, саду та господарства з доставкою по Україні.',
    accent: 'from-amber-50 to-amber-100 border-amber-200',
  },
]

export function EcosystemSections() {
  return (
    <section className="py-20 md:py-28 bg-white" aria-labelledby="ecosystem-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-12">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">
            Усе на одному сайті
          </span>
          <h2 id="ecosystem-heading" className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
            Що ми пропонуємо
          </h2>
          <p className="text-gray-500 text-base leading-relaxed">
            Дача TV — це більше, ніж мед. Натуральні продукти, квіти й лаванда, будівельні матеріали
            та магазин товарів для господарства.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SECTIONS.map(({ href, emoji, title, text, accent }) => (
            <Link
              key={href}
              href={href}
              className={`group bg-gradient-to-br ${accent} border rounded-2xl p-6 flex flex-col transition-all hover:shadow-md`}
            >
              <span className="text-3xl mb-4" aria-hidden="true">{emoji}</span>
              <h3 className="font-serif text-xl font-bold text-bark mb-2">{title}</h3>
              <p className="text-sm text-bark/60 leading-relaxed flex-1">{text}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-bark/80 group-hover:text-bark">
                Перейти
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
