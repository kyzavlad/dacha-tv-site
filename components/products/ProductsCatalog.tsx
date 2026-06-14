'use client'

import { useState } from 'react'
import type { HoneyProduct, ApiaryProduct, CatalogProduct } from '@/types'
import { HoneyCard } from '@/components/honey/HoneyCard'
import { ProductCard } from '@/components/products/ProductCard'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'

type Tab = 'all' | 'honey' | 'apiary' | 'natural' | 'saplings'

function isSapling(p: CatalogProduct): boolean {
  return /саджан/i.test(p.name_ua)
}

interface Props {
  honey: HoneyProduct[]
  apiary: ApiaryProduct[]
  natural: CatalogProduct[]
}

// Unified /products catalog: one grid across honey, bee products and natural
// farm products, with simple client-side tabs. Each item keeps its own correct
// purchase/inquiry flow (honey → honey page, priced catalog → До кошика,
// inquiry/no-price → lead CTA) because we reuse the existing card components.
export function ProductsCatalog({ honey, apiary, natural }: Props) {
  const [tab, setTab] = useState<Tab>('all')

  const saplings = natural.filter(isSapling)
  const naturalOnly = natural.filter((p) => !isSapling(p))

  const allTabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'Усі', count: honey.length + apiary.length + natural.length },
    { id: 'honey', label: 'Мед', count: honey.length },
    { id: 'apiary', label: 'Продукти пасіки', count: apiary.length },
    { id: 'natural', label: 'Натуральні продукти', count: naturalOnly.length },
    { id: 'saplings', label: 'Саджанці', count: saplings.length },
  ]
  const tabs = allTabs.filter((t) => t.id === 'all' || t.count > 0)

  const showHoney = tab === 'all' || tab === 'honey'
  const showApiary = tab === 'all' || tab === 'apiary'
  const naturalToShow =
    tab === 'all' ? natural : tab === 'natural' ? naturalOnly : tab === 'saplings' ? saplings : []

  const empty = (!showHoney || honey.length === 0) && (!showApiary || apiary.length === 0) && naturalToShow.length === 0

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8" role="tablist" aria-label="Категорії продуктів">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'bg-honey-700 text-white'
                : 'bg-white border border-honey-200 text-bark/70 hover:border-honey-400 hover:text-bark'
            }`}
          >
            {t.label}
            <span className={tab === t.id ? 'text-white/70' : 'text-bark/40'}>{t.count}</span>
          </button>
        ))}
      </div>

      {empty ? (
        <p className="text-gray-500 py-12 text-center">У цій категорії поки немає товарів.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {showHoney && honey.map((p) => <HoneyCard key={`h-${p.id}`} product={p} />)}
          {showApiary && apiary.map((p) => <ProductCard key={`a-${p.id}`} product={p} />)}
          {naturalToShow.map((p) => (
            <CatalogProductCard key={`n-${p.id}`} product={p} categorySlug={p.category_slug ?? 'naturalni-produkty'} />
          ))}
        </div>
      )}
    </div>
  )
}
