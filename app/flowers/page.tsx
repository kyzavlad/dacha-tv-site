export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { FlowerGrid } from '@/components/flowers/FlowerGrid'
import { FlowerInquiryForm } from '@/components/forms/FlowerInquiryForm'
import { getAllFlowerProducts } from '@/lib/supabase/queries'
import { FlowerCard } from '@/components/flowers/FlowerCard'

export const metadata: Metadata = {
  title: 'Хризантеми',
  description:
    'Хризантеми від домашнього розсадника на Харківщині — помпонові, кущові, великоквіткові та рідкісні сорти. Вирощуємо для букетів, подарунків і саду.',
  alternates: { canonical: '/flowers' },
  openGraph: {
    title: 'Хризантеми | Дача TV',
    description: 'Понад 20 сортів хризантем від домашнього розсадника на Харківщині. Помпонові, кущові, великоквіткові.',
    type: 'website',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV — Хризантеми' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Хризантеми | Дача TV',
    description: 'Хризантеми від домашнього розсадника на Харківщині — помпонові, кущові та великоквіткові сорти.',
  },
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
          <nav aria-label="Навігація" className="text-sm text-white/40 mb-8">
            <Link href="/" className="hover:text-white/70 transition-colors">Головна</Link>
            <span className="mx-2">›</span>
            <span className="text-white/70">Квіти</span>
          </nav>

          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              Домашній розсадник · Харківщина
            </p>
            <h1 className="font-serif text-4xl md:text-5xl font-bold mb-5 leading-tight">
              Хризантеми
            </h1>
            <p className="text-white/60 text-lg leading-relaxed mb-8">
              Понад {totalCount} сортів. Помпонові, кущові, великоквіткові і рідкісні.
              Вирощуємо вдома — для букетів, подарунків і саду.
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
                Рекомендовані
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
                      {products.length} сорт{products.length === 1 ? '' : products.length < 5 ? 'и' : 'ів'}
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
              Замовити квіти
            </h2>
            <p className="text-gray-500 text-sm">
              Уточнимо наявність, ціну і домовимося про передачу або доставку.
            </p>
          </div>
          <FlowerInquiryForm source="/flowers" />
        </div>
      </div>
    </div>
  )
}
