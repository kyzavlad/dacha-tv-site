import { CTAButton } from '@/components/shared/CTAButton'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

const BEEKEEPER_FEATURES = [
  'Бджолопакети Buckfast',
  'Українська степова',
  'Карніка',
  'Бджолосім\'ї',
  'Вулики',
]

export async function BeekeeperTeaser() {
  const locale = await getRequestLocale()
  return (
    <section className="py-20 md:py-28 bg-cream" aria-labelledby="beekeeper-teaser-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-br from-bark via-forest-950 to-bark overflow-hidden">
          <div className="px-8 py-14 md:px-16 md:py-20 lg:px-20">
            <div className="max-w-2xl">
              <span className="text-xs font-semibold text-forest-400 uppercase tracking-widest mb-5 block">
                {tr({ uk: 'Для пасічників', ru: 'Для пасечников' }, locale)}
              </span>
              <h2 id="beekeeper-teaser-heading" className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-5 leading-tight">
                {tr({ uk: 'Ми пасічники. Розуміємо, що вам потрібно.', ru: 'Мы пасечники. Понимаем, что вам нужно.' }, locale)}
              </h2>
              <p className="text-white/60 text-lg mb-8 leading-relaxed">
                {tr({ uk: 'Пропонуємо бджолопакети, бджолосім’ї та вулики — з індивідуальним підходом і без зайвих слів.', ru: 'Предлагаем пчелопакеты, пчелосемьи и ульи — с индивидуальным подходом и без лишних слов.' }, locale)}
              </p>

              {/* Feature tags */}
              <div className="flex flex-wrap gap-2 mb-10">
                {BEEKEEPER_FEATURES.map((feature) => (
                  <span
                    key={feature}
                    className="text-sm text-white/70 bg-white/8 border border-white/15 px-4 py-1.5 rounded-full"
                  >
                    {feature}
                  </span>
                ))}
              </div>

              <CTAButton href={localizedPath(locale, '/beekeeper')} variant="white" size="lg">
                {tr({ uk: 'Дізнатись більше', ru: 'Узнать больше' }, locale)}
              </CTAButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
