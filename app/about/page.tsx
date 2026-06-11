import type { Metadata } from 'next'
import { existsSync } from 'fs'
import { join } from 'path'
import Image from 'next/image'
import { SocialIcons } from '@/components/shared/SocialIcons'
import { CTAButton } from '@/components/shared/CTAButton'
import { ApiaryTrust } from '@/components/shared/ApiaryTrust'
import { getSiteSettings } from '@/lib/supabase/queries'

export const metadata: Metadata = {
  title: 'Про нас',
  description:
    'Сімейна пасіка Дача TV — Коротич, Харківська область. Дізнайтесь нашу історію: як ми починали, що нас відрізняє, і чому ми відкрито показуємо всю нашу роботу на YouTube.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'Про нас | Дача TV',
    description: 'Сімейна пасіка на Харківщині — наша історія, наш підхід, наші бджоли.',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV — Сімейна пасіка' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Про нас | Дача TV',
    description: 'Сімейна пасіка на Харківщині — наша історія, наш підхід, наші бджоли.',
  },
}

const ABOUT_IMAGE = '/images/dacha-tv/about-apiary.jpg'

export default async function AboutPage() {
  const siteSettings = await getSiteSettings().catch(() => null)
  const hasAboutImage = existsSync(join(process.cwd(), 'public', ABOUT_IMAGE))

  return (
    <div className="bg-cream min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">Про нас</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            Наша пасіка, наша робота
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl">
            Сімейна пасіка на Харківщині — наша історія, наш підхід, наші бджоли.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 space-y-16">

        {/* Story */}
        <section aria-labelledby="story-heading">
          <h2 id="story-heading" className="font-serif text-3xl font-bold text-bark mb-6">
            Наша історія
          </h2>

          {hasAboutImage && (
            <div className="aspect-video rounded-2xl overflow-hidden mb-8 relative">
              <Image
                src={ABOUT_IMAGE}
                alt="Пасіка Дача TV — Коротич, Харківська область"
                fill
                className="object-cover"
                sizes="(max-width: 896px) 100vw, 896px"
                priority
              />
            </div>
          )}

          <div className="space-y-5 text-bark/80 leading-relaxed text-lg">
            <p>
              Дача TV — це сімейна пасіка на Харківщині. Ми тримаємо бджіл вже багато років, і кожен крок нашого виробництва — від підготовки вуликів навесні до фасування осіннього меду — це наша власна праця.
            </p>
            <p>
              Все починалося як особисте захоплення. Поступово кількість вуликів росла, якість меду покращувалася, і ми зрозуміли, що хочемо ділитися не лише продуктом, але й знаннями. Так з&apos;явився YouTube-канал.
            </p>
            <p>
              Сьогодні ми виробляємо мед кількох сортів, продаємо бджолопакети та вулики, і продовжуємо відкрито розповідати про свою роботу. Бо чесність — це не маркетинг. Це наш спосіб.
            </p>
          </div>
        </section>

        {/* Apiary */}
        <section aria-labelledby="apiary-heading">
          <h2 id="apiary-heading" className="font-serif text-3xl font-bold text-bark mb-6">
            Наша пасіка
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { label: 'Місцезнаходження', value: 'Коротич, Харківська область' },
              { label: 'Формат', value: 'Сімейна пасіка, пряма поставка' },
              { label: 'Продукти', value: 'Мед 6 сортів, пилок, прополіс, горіхи в меду' },
              { label: 'Бджолопакети', value: 'Buckfast, Українська степова, Карніка' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl p-5 border border-honey-100">
                <dt className="text-sm font-semibold text-honey-700 uppercase tracking-wider mb-1">{label}</dt>
                <dd className="font-serif text-lg text-bark">{value}</dd>
              </div>
            ))}
          </div>
        </section>

        {/* Approach */}
        <section aria-labelledby="approach-heading">
          <h2 id="approach-heading" className="font-serif text-3xl font-bold text-bark mb-6">
            Наш підхід
          </h2>
          <div className="space-y-4 text-bark/80 leading-relaxed text-lg">
            <p>
              Ми самі доглядаємо за вуликами, самі качаємо, самі пакуємо. Жодних посередників. Ніякого змішування сортів. Жодного підігріву меду вище природних температур.
            </p>
            <p>
              Кожен сорт збирається у свій природний час — коли конкретна культура цвіте і нектар дозріває. Акація в травні, липа в липні, соняшник наприкінці серпня. Це й робить смак кожного сорту особливим.
            </p>
            <p>
              Якщо меду немає — ми говоримо про це прямо. Сезонний продукт не може бути доступним цілий рік в необмеженій кількості. Ми не торгуємо тим, чого немає.
            </p>
          </div>
        </section>

        {/* YouTube */}
        <section aria-labelledby="youtube-about-heading">
          <h2 id="youtube-about-heading" className="font-serif text-3xl font-bold text-bark mb-4">
            YouTube та контент
          </h2>
          <p className="text-bark/70 text-lg mb-8 leading-relaxed">
            На нашому YouTube-каналі ми показуємо пасіку зсередини: підготовку до сезону, роботу з вуликами, збір та фасування меду. Підписуйтесь — ми нічого не приховуємо.
          </p>

          {/* YouTube channel card */}
          <div className="rounded-2xl bg-bark overflow-hidden mb-6">
            <div className="px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="w-14 h-14 bg-red-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-serif text-xl font-bold text-cream mb-1">Дача TV на YouTube</p>
                <p className="text-cream/60 text-sm leading-relaxed">
                  Пасіка зсередини: підготовка вуликів, качка меду, робота з бджолопакетами — відкрито, без прикрас.
                </p>
              </div>
              {siteSettings?.youtube_url && (
                <a
                  href={siteSettings.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-full transition-colors min-h-[48px] whitespace-nowrap"
                >
                  Відкрити канал
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SocialIcons
              siteSettings={siteSettings}
              className="flex items-center gap-2"
              iconClassName="text-bark/50 hover:text-honey-700 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            />
          </div>
        </section>

        {/* Apiary trust / passport */}
        <section aria-labelledby="trust-section-heading">
          <h2 id="trust-section-heading" className="font-serif text-3xl font-bold text-bark mb-6">
            Довіра та прозорість
          </h2>
          <ApiaryTrust />
        </section>

        {/* CTA */}
        <section className="bg-honey-50 rounded-2xl p-8 text-center">
          <h2 className="font-serif text-2xl font-bold text-bark mb-3">
            Готові замовити натуральний мед?
          </h2>
          <p className="text-bark/70 mb-6">Перегляньте наш каталог і оберіть улюблений сорт.</p>
          <CTAButton href="/honey" size="lg">Перейти до каталогу</CTAButton>
        </section>
      </div>
    </div>
  )
}
