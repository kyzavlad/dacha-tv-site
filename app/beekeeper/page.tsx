export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { buildAlternates } from '@/lib/seo'
import type { BeekeeperProduct } from '@/types'
import { BeekeeperCard } from '@/components/beekeeper/BeekeeperCard'
import { BeekeeperInquiryForm } from '@/components/forms/BeekeeperInquiryForm'
import { PhoneLink } from '@/components/shared/PhoneLink'
import { getAllBeekeeperProducts } from '@/lib/supabase/queries'
import { LAUNCH_PHONE } from '@/lib/launch-defaults'
import { getRequestLocale } from '@/lib/i18n'
import { manualDict, type ManualDict } from '@/lib/i18n/sections/manual'

const BEEKEEPER_META: Record<'uk' | 'ru' | 'en', { title: string; description: string; ogDescription: string; ogAlt: string; twitterDescription: string }> = {
  uk: {
    title: 'Для пасічників',
    description: "Бджолопакети (Buckfast, Карніка), бджолосім'ї, вулики та товари пасічника від власної пасіки на Харківщині. Без посередників: напряму від пасічника.",
    ogDescription: "Бджолопакети, бджолосім'ї, вулики та товари пасічника від пасіки Дача TV на Харківщині",
    ogAlt: 'Дача TV: Для пасічників',
    twitterDescription: "Бджолопакети Buckfast та Карніка, бджолосім'ї, вулики: напряму від пасічника на Харківщині.",
  },
  ru: {
    title: 'Для пчеловодов',
    description: 'Пчелопакеты (Buckfast, Карника), пчелосемьи, ульи и товары пчеловода от собственной пасеки на Харьковщине. Без посредников: напрямую от пчеловода.',
    ogDescription: 'Пчелопакеты, пчелосемьи, ульи и товары пчеловода от пасеки Дача TV на Харьковщине',
    ogAlt: 'Дача TV: Для пчеловодов',
    twitterDescription: 'Пчелопакеты Buckfast и Карника, пчелосемьи, ульи: напрямую от пчеловода на Харьковщине.',
  },
  en: {
    title: 'For beekeepers',
    description: 'Bee packages (Buckfast, Carnica), bee colonies, hives and beekeeping supplies from our own apiary in the Kharkiv region. No middlemen — direct from the beekeeper.',
    ogDescription: 'Bee packages, bee colonies, hives and beekeeping supplies from the Dacha TV apiary in the Kharkiv region',
    ogAlt: 'Dacha TV: For beekeepers',
    twitterDescription: 'Buckfast and Carnica bee packages, bee colonies, hives: direct from the beekeeper in the Kharkiv region.',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const { canonical, languages } = buildAlternates(locale, '/beekeeper')
  const m = BEEKEEPER_META[locale]
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical, languages },
    openGraph: {
      title: m.title,
      description: m.ogDescription,
      type: 'website',
      images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: m.ogAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: m.title,
      description: m.twitterDescription,
    },
  }
}

const TYPE_ORDER = ['bee_packages', 'bee_colonies', 'empty_hives', 'hives_with_bees', 'apiary_supply'] as const

function typeHeading(t: ManualDict, type: string): string {
  switch (type) {
    case 'bee_packages': return t.beekeeperTypeBeePackages
    case 'bee_colonies': return t.beekeeperTypeBeeColonies
    case 'empty_hives': return t.beekeeperTypeEmptyHives
    case 'hives_with_bees': return t.beekeeperTypeHivesWithBees
    case 'apiary_supply': return t.beekeeperTypeApiarySupply
    default: return type
  }
}

export default async function BeekeeperPage() {
  const locale = await getRequestLocale()
  const t = manualDict(locale)
  const BEEKEEPER_OFFERS = [
    { title: t.beekeeperOfferColoniesTitle, note: t.beekeeperOfferColoniesNote },
    { title: t.beekeeperOfferSplitsTitle, note: t.beekeeperOfferSplitsNote },
    { title: t.beekeeperOfferHivesTitle, note: t.beekeeperOfferHivesNote },
    { title: t.beekeeperOfferConsultTitle, note: t.beekeeperOfferConsultNote },
  ]
  const products = await getAllBeekeeperProducts().catch(() => [])

  const byType: Record<string, BeekeeperProduct[]> = {}
  for (const p of products) {
    if (!byType[p.product_type]) byType[p.product_type] = []
    byType[p.product_type].push(p)
  }

  const activeTypes = [...new Set([...TYPE_ORDER, ...Object.keys(byType)])].filter((type) => byType[type]?.length)

  return (
    <div className="bg-cream min-h-screen">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">{t.beekeeperEyebrow}</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            {t.beekeeperH1}
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl">
            {t.beekeeperIntro}
          </p>

          {/* Type quick-jump links */}
          {activeTypes.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {activeTypes.map((type) => (
                <a
                  key={type}
                  href={`#${type}`}
                  className="text-xs text-bark/50 border border-bark/20 px-3 py-1.5 rounded-full hover:text-bark hover:border-bark/40 transition-colors"
                >
                  {typeHeading(t, type)}
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
                {t.beekeeperOffersTitle}
              </h2>
              <p className="text-bark/60 text-sm mb-5">
                {t.beekeeperOffersSubtitle}
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
                  {t.beekeeperLeaveInquiry}
                </a>
                <span className="text-sm text-bark/60">
                  {t.beekeeperOrCall}{' '}
                  <PhoneLink phone={LAUNCH_PHONE} showIcon location="beekeeper-offers" className="text-sm" />
                </span>
              </div>
            </section>

            {activeTypes.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-forest-100 text-center">
                <p className="text-bark/60">
                  {t.beekeeperEmptyState}
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
                        {typeHeading(t, type)}
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
              <h3 className="font-semibold text-bark mb-2">{t.beekeeperImportantTitle}</h3>
              <p className="text-bark/70 text-sm leading-relaxed">
                {t.beekeeperImportantBody}
              </p>
            </div>
          </div>

          {/* Sticky inquiry form */}
          <div className="lg:col-span-1">
            <div id="inquiry-form" className="lg:sticky lg:top-24">
              <div className="bg-forest-50 rounded-2xl p-6 border border-forest-200">
                <h2 className="font-serif text-2xl font-bold text-bark mb-2">
                  {t.beekeeperFormTitle}
                </h2>
                <p className="text-bark/60 text-sm mb-6">
                  {t.beekeeperFormBody}
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
