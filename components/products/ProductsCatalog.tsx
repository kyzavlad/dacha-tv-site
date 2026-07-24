'use client'

import { useState } from 'react'
import type { HoneyProduct, ApiaryProduct, CatalogProduct } from '@/types'
import { HoneyCard } from '@/components/honey/HoneyCard'
import { ProductCard } from '@/components/products/ProductCard'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { isLocale, type Locale } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

type Tab = 'all' | 'honey' | 'apiary' | 'oils' | 'gifts' | 'natural' | 'saplings'

const GIFT_SET_CATEGORY = 'podarunkovi-nabory'
const OIL_CATEGORY = 'zhyvi-olii-holodnogo-vidzhymu'

function isSapling(p: CatalogProduct): boolean {
  return /саджан/i.test(p.name_ua)
}

function isGiftSet(p: CatalogProduct): boolean {
  return p.category_slug === GIFT_SET_CATEGORY
}

function isOil(p: CatalogProduct): boolean {
  return p.category_slug === OIL_CATEGORY
}

interface Props {
  honey: HoneyProduct[]
  apiary: ApiaryProduct[]
  natural: CatalogProduct[]
  // Active locale (from the server page) — threaded to every card so product
  // links keep the /ru prefix. Default uk when absent.
  locale?: string
}

// Unified /products catalog: one grid across honey, bee products and natural
// farm products, with simple client-side tabs. Each item keeps its own correct
// purchase/inquiry flow (honey → honey page, priced catalog → До кошика,
// inquiry/no-price → lead CTA) because we reuse the existing card components.
export function ProductsCatalog({ honey, apiary, natural, locale }: Props) {
  const loc: Locale = isLocale(locale) ? locale : 'uk'
  const [tab, setTab] = useState<Tab>('all')

  const saplings = natural.filter(isSapling)
  const giftSets = natural.filter(isGiftSet)
  const oils = natural.filter(isOil)
  const naturalOnly = natural.filter((p) => !isSapling(p) && !isGiftSet(p) && !isOil(p))

  const totalVisible = honey.length + apiary.length + natural.length

  const allTabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: tr({ uk: 'Усі', ru: 'Все' }, loc), count: totalVisible },
    { id: 'honey', label: tr({ uk: 'Мед', ru: 'Мёд' }, loc), count: honey.length },
    { id: 'oils', label: tr({ uk: 'Олії', ru: 'Масла' }, loc), count: oils.length },
    { id: 'gifts', label: tr({ uk: 'Подарункові набори', ru: 'Подарочные наборы' }, loc), count: giftSets.length },
    { id: 'apiary', label: tr({ uk: 'Продукти пасіки', ru: 'Продукты пасеки' }, loc), count: apiary.length },
    { id: 'natural', label: tr({ uk: 'Натуральні продукти', ru: 'Натуральные продукты' }, loc), count: naturalOnly.length },
    { id: 'saplings', label: tr({ uk: 'Саджанці', ru: 'Саженцы' }, loc), count: saplings.length },
  ]
  const tabs = allTabs.filter((t) => t.id === 'all' || t.count > 0)

  const showHoney = tab === 'all' || tab === 'honey'
  const showApiary = tab === 'all' || tab === 'apiary'
  const naturalToShow =
    tab === 'all' ? natural
      : tab === 'natural' ? naturalOnly
      : tab === 'oils' ? oils
      : tab === 'saplings' ? saplings
      : tab === 'gifts' ? giftSets
      : []

  const empty = (!showHoney || honey.length === 0) && (!showApiary || apiary.length === 0) && naturalToShow.length === 0

  return (
    <div>
      {/* Available-now count */}
      <p className="text-sm text-bark/60 mb-4">
        {tr({ uk: 'Доступно зараз:', ru: 'Доступно сейчас:' }, loc)} <span className="font-semibold text-bark">{totalVisible}</span>{' '}
        {loc === 'ru'
          ? (totalVisible === 1 ? 'товар' : totalVisible >= 2 && totalVisible <= 4 ? 'товара' : 'товаров')
          : (totalVisible === 1 ? 'товар' : totalVisible >= 2 && totalVisible <= 4 ? 'товари' : 'товарів')}
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8" role="tablist" aria-label={tr({ uk: 'Категорії продуктів', ru: 'Категории продуктов' }, loc)}>
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
        <p className="text-gray-500 py-12 text-center">{tr({ uk: 'У цій категорії поки немає товарів.', ru: 'В этой категории пока нет товаров.' }, loc)}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {showHoney && honey.map((p) => <HoneyCard key={`h-${p.id}`} product={p} locale={locale} />)}
          {showApiary && apiary.map((p) => <ProductCard key={`a-${p.id}`} product={p} locale={locale} />)}
          {naturalToShow.map((p) => (
            <CatalogProductCard key={`n-${p.id}`} product={p} categorySlug={p.category_slug ?? 'naturalni-produkty'} locale={locale} />
          ))}
        </div>
      )}
    </div>
  )
}
