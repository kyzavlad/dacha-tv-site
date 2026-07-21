export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { FlowerGrid } from '@/components/flowers/FlowerGrid'
import { FlowerInquiryForm } from '@/components/forms/FlowerInquiryForm'
import { getAllFlowerProducts } from '@/lib/supabase/queries'
import { FlowerCard } from '@/components/flowers/FlowerCard'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { manualDict } from '@/lib/i18n/sections/manual'

const FLOWERS_META: Record<'uk' | 'ru' | 'en', { title: string; description: string; ogDescription: string; ogAlt: string; twitterDescription: string }> = {
  uk: {
    title: 'Хризантеми',
    description: 'Хризантеми від домашнього розсадника на Харківщині: помпонові, кущові, великоквіткові та рідкісні сорти. Вирощуємо для букетів, подарунків і саду.',
    ogDescription: 'Понад 20 сортів хризантем від домашнього розсадника на Харківщині. Помпонові, кущові, великоквіткові.',
    ogAlt: 'Дача TV: Хризантеми',
    twitterDescription: 'Хризантеми від домашнього розсадника на Харківщині: помпонові, кущові та великоквіткові сорти.',
  },
  ru: {
    title: 'Хризантемы',
    description: 'Хризантемы от домашнего питомника на Харьковщине: помпонные, кустовые, крупноцветковые и редкие сорта. Выращиваем для букетов, подарков и сада.',
    ogDescription: 'Более 20 сортов хризантем от домашнего питомника на Харьковщине. Помпонные, кустовые, крупноцветковые.',
    ogAlt: 'Дача TV: Хризантемы',
    twitterDescription: 'Хризантемы от домашнего питомника на Харьковщине: помпонные, кустовые и крупноцветковые сорта.',
  },
  en: {
    title: 'Chrysanthemums',
    description: 'Chrysanthemums from a home nursery in the Kharkiv region: pompon, spray, exhibition and rare varieties. Grown for bouquets, gifts and the garden.',
    ogDescription: 'Over 20 chrysanthemum varieties from a home nursery in the Kharkiv region. Pompon, spray, exhibition.',
    ogAlt: 'Dacha TV: Chrysanthemums',
    twitterDescription: 'Chrysanthemums from a home nursery in the Kharkiv region: pompon, spray and exhibition varieties.',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const m = FLOWERS_META[locale]
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: '/flowers' },
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

const VARIETY_ORDER = [
  'Помпонова',
  'Кущова',
  'Великоквіткова',
  'Дрібноквіткова',
  'Компактна',
  'Анемонова',
  'Павукоподібна',
]

export default async function FlowersPage() {
  const locale = await getRequestLocale()
  const t = manualDict(locale)
  const allProducts = await getAllFlowerProducts().catch(() => [])

  const featured = allProducts.filter((p) => p.is_featured && (p.status === 'available' || p.status === 'preorder')).slice(0, 3)
  const available = allProducts.filter((p) => p.status === 'available' || p.status === 'preorder')

  // Group by variety for catalog sections
  const byVariety = VARIETY_ORDER.reduce<Record<string, typeof allProducts>>((acc, variety) => {
    const group = available.filter((p) => p.variety === variety)
    if (group.length > 0) acc[variety] = group
    return acc
  }, {})

  // Any variety not in our order list
  const otherVarieties = [...new Set(
    available
      .filter((p) => p.variety && !VARIETY_ORDER.includes(p.variety))
      .map((p) => p.variety!)
  )]
  otherVarieties.forEach((v) => {
    const group = available.filter((p) => p.variety === v)
    if (group.length > 0) byVariety[v] = group
  })

  const varietyEntries = Object.entries(byVariety)
  const totalCount = available.length

  return (
    <div className="bg-white min-h-screen">
      {/* Hero */}
      <div className="bg-gray-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
          <nav aria-label={t.flowersBreadcrumbCurrent} className="text-sm text-white/40 mb-8">
            <Link href={localizedPath(locale, '/')} className="hover:text-white/70 transition-colors">{t.flowersBreadcrumbHome}</Link>
            <span className="mx-2">›</span>
            <span className="text-white/70">{t.flowersBreadcrumbCurrent}</span>
          </nav>

          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              {t.flowersEyebrow}
            </p>
            <h1 className="font-serif text-4xl md:text-5xl font-bold mb-5 leading-tight">
              {t.flowersH1}
            </h1>
            <p className="text-white/60 text-lg leading-relaxed mb-8">
              {t.flowersIntro.replace('{count}', String(totalCount))}
            </p>

            {/* Quick-jump anchors */}
            {varietyEntries.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {varietyEntries.map(([variety]) => (
                  <a
                    key={variety}
                    href={`#${encodeURIComponent(variety)}`}
                    className="text-xs text-white/50 border border-white/20 px-3 py-1.5 rounded-full hover:text-white hover:border-white/50 transition-colors"
                  >
                    {variety}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Featured section */}
        {featured.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-6 h-px bg-gray-300" />
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {t.flowersFeatured}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {featured.map((p) => (
                <FlowerCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* By variety sections */}
        {varietyEntries.length > 0 ? (
          <div className="space-y-14">
            {varietyEntries.map(([variety, products]) => (
              <section key={variety} id={encodeURIComponent(variety)}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-px bg-gray-300" />
                    <h2 className="font-serif text-xl font-bold text-gray-900">
                      {variety}
                    </h2>
                    <span className="text-sm text-gray-400">
                      {products.length} {t.catalogVarietiesLabel}
                    </span>
                  </div>
                </div>
                <FlowerGrid products={products} />
              </section>
            ))}
          </div>
        ) : (
          <FlowerGrid products={[]} />
        )}
      </div>

      {/* Inquiry section */}
      <div className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-8">
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">
              {t.flowersInquiryTitle}
            </h2>
            <p className="text-gray-500 text-sm">
              {t.flowersInquiryBody}
            </p>
          </div>
          <FlowerInquiryForm source="/flowers" />
        </div>
      </div>
    </div>
  )
}
