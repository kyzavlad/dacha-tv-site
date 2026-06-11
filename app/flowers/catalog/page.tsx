export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllFlowerProducts } from '@/lib/supabase/queries'
import type { FlowerProduct } from '@/types'
import { FlowerInquiryForm } from '@/components/forms/FlowerInquiryForm'

export const metadata: Metadata = {
  title: 'Каталог хризантем',
  description: 'Колекція хризантем від домашнього розсадника. Понад 50 сортів: помпонові, кущові, великоквіткові, рідкісні. Харківщина.',
  alternates: { canonical: '/flowers/catalog' },
  openGraph: {
    title: 'Каталог хризантем | Дача TV',
    description: 'Понад 50 сортів хризантем від домашнього розсадника на Харківщині — помпонові, кущові, великоквіткові.',
    type: 'website',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV — Хризантеми' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Каталог хризантем | Дача TV',
    description: 'Понад 50 сортів хризантем від домашнього розсадника на Харківщині.',
  },
}

const VARIETY_ORDER = ['Помпонова', 'Кущова', 'Великоквіткова', 'Дрібноквіткова', 'Компактна', 'Анемонова', 'Павукоподібна']

const VARIETY_EN: Record<string, string> = {
  'Помпонова': 'Pompon', 'Кущова': 'Spray', 'Великоквіткова': 'Exhibition',
  'Дрібноквіткова': 'Micro', 'Компактна': 'Compact', 'Анемонова': 'Anemone', 'Павукоподібна': 'Spider',
}

const VARIETY_DESC: Record<string, string> = {
  'Помпонова': 'Щільні кулясті суцвіття 3–6 см. Класика флористики.',
  'Кущова': 'Один стебель — безліч квіток. Природна пишність.',
  'Великоквіткова': 'Одна квітка до 25 см. Виставковий формат.',
  'Дрібноквіткова': 'Хмарка з сотень крихітних суцвіть.',
  'Компактна': 'До 35 см. Для вазонів і балконів.',
  'Анемонова': 'Плоскі пелюстки + пухнастий центр.',
  'Павукоподібна': 'Довгі звивисті пелюстки. Екзотика.',
}

function colorClass(color: string | null): string {
  if (!color) return 'bg-gray-200'
  const c = color.toLowerCase()
  if (c.includes('біл') || c.includes('кремов') || c.includes('вершк')) return 'bg-stone-100 ring-1 ring-stone-300'
  if (c.includes('жовт') || c.includes('золот') || c.includes('лимон')) return 'bg-yellow-300'
  if (c.includes('рожев') || c.includes('персик')) return 'bg-pink-300'
  if (c.includes('малин') || c.includes('бордо') || c.includes('бургун') || c.includes('оксамит')) return 'bg-rose-700'
  if (c.includes('помаранч') || c.includes('оранж')) return 'bg-orange-400'
  if (c.includes('бронз') || c.includes('теракот') || c.includes('рудий') || c.includes('мідн')) return 'bg-amber-600'
  if (c.includes('лілов') || c.includes('фіолет') || c.includes('бузков')) return 'bg-purple-400'
  if (c.includes('лаванд')) return 'bg-violet-300'
  if (c.includes('зелен') || c.includes('салат') || c.includes('лайм')) return 'bg-green-400'
  if (c.includes('шоколад') || c.includes('коричн')) return 'bg-amber-900'
  return 'bg-gray-300'
}

export default async function FlowersCatalogPage() {
  const allProducts = await getAllFlowerProducts().catch(() => [])
  const available = allProducts.filter((p) => p.status === 'available' || p.status === 'preorder')

  const byVariety = VARIETY_ORDER.reduce<Record<string, FlowerProduct[]>>((acc, v) => {
    const g = available.filter((p) => p.variety === v)
    if (g.length) acc[v] = g
    return acc
  }, {})
  const extra = [...new Set(available.filter((p) => p.variety && !VARIETY_ORDER.includes(p.variety)).map((p) => p.variety!))]
  for (const v of extra) byVariety[v] = available.filter((p) => p.variety === v)

  const featured = available.filter((p) => p.is_featured).slice(0, 6)
  const total = available.length

  return (
    <div className="bg-white min-h-screen">

      {/* ── HERO ── dark, full-bleed, typographic */}
      <div className="bg-[#0c0c0c] text-white min-h-[60vh] flex flex-col justify-end">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 pb-16 pt-24 w-full">
          <nav className="text-[11px] text-white/25 mb-12 flex gap-2">
            <Link href="/" className="hover:text-white/50 transition-colors">Головна</Link>
            <span>/</span>
            <Link href="/flowers" className="hover:text-white/50 transition-colors">Квіти</Link>
            <span>/</span>
            <span className="text-white/40">Каталог</span>
          </nav>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-10 items-end">
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-[0.25em] mb-6">
                Домашній розсадник · Харківщина · Хризантеми
              </p>
              <h1 className="font-serif text-6xl sm:text-7xl md:text-8xl font-bold leading-[0.9] tracking-tight mb-8">
                Колекція
              </h1>
              <div className="flex items-center gap-6">
                <span className="font-serif text-5xl font-bold text-white/15 tabular-nums">{String(total).padStart(2,'0')}</span>
                <div>
                  <p className="text-sm text-white/60">сортів хризантем</p>
                  <p className="text-xs text-white/30">{Object.keys(byVariety).length} різновидів</p>
                </div>
              </div>
            </div>
            {/* Variety pills */}
            <div className="hidden md:flex flex-col gap-2">
              {Object.keys(byVariety).map((v) => (
                <a key={v} href={`#${encodeURIComponent(v)}`}
                  className="flex items-center justify-between text-sm text-white/40 hover:text-white border-b border-white/10 hover:border-white/30 pb-2 transition-all group">
                  <span>{v}</span>
                  <span className="text-white/20 group-hover:text-white/50 tabular-nums">{byVariety[v].length}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURED STRIP ── */}
      {featured.length > 0 && (
        <div className="bg-[#111] border-b border-white/5">
          <div className="max-w-6xl mx-auto px-6 sm:px-10 py-8">
            <p className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.2em] mb-5">Рекомендовані</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {featured.map((p) => (
                <Link key={p.id} href={`/flowers/${p.slug}`}
                  className="group flex flex-col gap-2">
                  <div className={`h-1.5 rounded-full ${colorClass(p.color)} transition-opacity group-hover:opacity-80`} />
                  <p className="text-xs text-white/60 group-hover:text-white transition-colors leading-snug line-clamp-2">{p.name}</p>
                  {p.price_uah && <p className="text-[10px] text-white/25">{p.price_uah} грн</p>}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CATALOG BODY ── white, editorial */}
      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-16 md:py-24">

        {/* Mobile variety nav */}
        <div className="md:hidden flex overflow-x-auto gap-3 mb-12 pb-3 -mx-6 px-6 scrollbar-none">
          {Object.keys(byVariety).map((v) => (
            <a key={v} href={`#${encodeURIComponent(v)}`}
              className="whitespace-nowrap text-xs font-semibold text-gray-500 border border-gray-200 hover:border-gray-800 hover:text-gray-900 px-4 py-2 rounded-full transition-all flex-shrink-0">
              {v} <span className="text-gray-300 ml-1">{byVariety[v].length}</span>
            </a>
          ))}
        </div>

        <div className="space-y-24">
          {Object.entries(byVariety).map(([variety, products]) => (
            <section key={variety} id={encodeURIComponent(variety)}>

              {/* Section header — large typographic */}
              <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 md:gap-12 items-start mb-10 pb-6 border-b-2 border-gray-900">
                <div>
                  <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.25em] mb-1">
                    {VARIETY_EN[variety] ?? variety} · {String(products.length).padStart(2,'0')}
                  </p>
                  <h2 className="font-serif text-4xl md:text-5xl font-bold text-gray-900 leading-none">
                    {variety}
                  </h2>
                </div>
                <div className="md:pt-8">
                  <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
                    {VARIETY_DESC[variety] ?? ''}
                  </p>
                </div>
              </div>

              {/* Products — alternating dense list */}
              <div className="divide-y divide-gray-50">
                {products.map((p, i) => (
                  <Link key={p.id} href={`/flowers/${p.slug}`}
                    className="group grid grid-cols-[auto_1fr_auto] gap-4 md:gap-8 items-center py-4 hover:bg-gray-50 transition-colors px-2 -mx-2 rounded-lg">
                    {/* Color swatch */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs tabular-nums text-gray-200 w-5 text-right">{String(i + 1).padStart(2,'0')}</span>
                      <span className={`w-4 h-4 rounded-full flex-shrink-0 ${colorClass(p.color)}`} aria-hidden="true" />
                    </div>
                    {/* Name + desc */}
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="font-serif text-base md:text-lg font-bold text-gray-900 group-hover:text-gray-600 transition-colors">
                          {p.name}
                        </span>
                        {p.is_featured && (
                          <span className="text-[9px] font-bold text-white bg-gray-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Хіт
                          </span>
                        )}
                      </div>
                      <div className="hidden sm:flex items-center gap-3 mt-0.5">
                        {p.color && <span className="text-xs text-gray-400">{p.color}</span>}
                        {p.bloom_season && <span className="text-xs text-gray-300">{p.bloom_season}</span>}
                      </div>
                    </div>
                    {/* Price + arrow */}
                    <div className="text-right flex-shrink-0">
                      {p.price_uah && (
                        <span className="text-sm font-semibold text-gray-900">від {p.price_uah} грн</span>
                      )}
                      <span className="ml-2 text-gray-300 group-hover:text-gray-700 transition-colors text-lg leading-none">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* ── CTA ── */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-2 gap-12 items-start pt-16 border-t-2 border-gray-900">
          <div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
              Не знаєте що обрати?
            </h2>
            <p className="text-gray-500 leading-relaxed mb-6">
              Підберемо сорти за кольором, строком цвітіння і бюджетом.
              Залиште заявку — зв&apos;яжемося протягом дня.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/flowers"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 border border-gray-300 hover:border-gray-700 px-5 py-2.5 rounded-full transition-colors">
                ← Фото каталог
              </Link>
            </div>
          </div>
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <p className="text-sm font-semibold text-gray-900 mb-4">Замовити квіти</p>
            <FlowerInquiryForm source="/flowers/catalog" />
          </div>
        </div>
      </div>
    </div>
  )
}
