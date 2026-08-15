import Link from 'next/link'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { homeDict } from '@/lib/i18n/sections/home'
import { tr } from '@/lib/i18n/pages'
import { honeyUnitPriceUah } from '@/lib/honey-pricing'
import {
  getAllApiaryProducts,
  getAllBeekeeperProducts,
  getAllFlowerProducts,
  getAllHoneyProducts,
} from '@/lib/supabase/queries'

interface AvailableItem {
  emoji: string
  title: string
  note: string
  href: string
}

function isOrderable(status: string | null | undefined) {
  return status === 'available' || status === 'preorder'
}

export async function AvailableNow() {
  const locale = await getRequestLocale()
  const t = homeDict(locale)

  // This section says "available now", so its availability and prices must come
  // from the same production data used by the actual storefront. Never put a
  // manually maintained price or product availability claim back here.
  const [honeyProducts, apiaryProducts, beekeeperProducts, flowerProducts] = await Promise.all([
    getAllHoneyProducts().catch(() => []),
    getAllApiaryProducts().catch(() => []),
    getAllBeekeeperProducts().catch(() => []),
    getAllFlowerProducts().catch(() => []),
  ])

  const availableLabel = tr({ uk: 'є в наявності', ru: 'в наличии', en: 'in stock' }, locale)
  const preorderLabel = tr({ uk: 'під замовлення', ru: 'под заказ', en: 'made to order' }, locale)
  const priceOnRequestLabel = tr({ uk: 'ціна за запитом', ru: 'цена по запросу', en: 'price on request' }, locale)
  const beekeeperNote = tr({ uk: 'для пасічників', ru: 'для пчеловодов', en: 'for beekeepers' }, locale)
  const flowerTitle = tr({ uk: 'Хризантеми', ru: 'Хризантемы', en: 'Chrysanthemums' }, locale)
  const currency = locale === 'en' ? 'UAH' : 'грн'

  const lindenHoney = honeyProducts.find((p) => p.slug === 'linden-honey' && isOrderable(p.status))
  const sunflowerOil = apiaryProducts.find((p) => p.slug === 'cold-pressed-sunflower-oil' && isOrderable(p.status))
  const beeColonies = beekeeperProducts.find((p) => p.slug === 'bee-colonies' && isOrderable(p.status))
  const featuredFlower = flowerProducts.find((p) => isOrderable(p.status) && typeof p.price_uah === 'number' && p.price_uah > 0)

  const items: AvailableItem[] = []

  if (lindenHoney) {
    const price = honeyUnitPriceUah(lindenHoney)
    items.push({
      emoji: '🍯',
      title: t.availHoneyTitle,
      note: `${price.toLocaleString(locale === 'ru' ? 'ru-RU' : 'uk-UA')} ${currency} / 1 л · ${lindenHoney.status === 'preorder' ? preorderLabel : availableLabel}`,
      href: `/honey/${lindenHoney.slug}`,
    })
  }

  if (sunflowerOil) {
    const price = typeof sunflowerOil.price_uah === 'number' && sunflowerOil.price_uah > 0
      ? `${sunflowerOil.price_uah.toLocaleString(locale === 'ru' ? 'ru-RU' : 'uk-UA')} ${currency}`
      : priceOnRequestLabel
    items.push({
      emoji: '🌱',
      title: t.availOilTitle,
      note: `${price} · ${sunflowerOil.status === 'preorder' ? preorderLabel : availableLabel}`,
      href: `/products/${sunflowerOil.slug}`,
    })
  }

  if (featuredFlower) {
    const price = typeof featuredFlower.price_uah === 'number' && featuredFlower.price_uah > 0
      ? `${featuredFlower.price_uah.toLocaleString(locale === 'ru' ? 'ru-RU' : 'uk-UA')} ${currency}`
      : priceOnRequestLabel
    items.push({
      emoji: '🌸',
      title: flowerTitle,
      note: `${price} · ${featuredFlower.status === 'preorder' ? preorderLabel : availableLabel}`,
      href: `/flowers/${featuredFlower.slug}`,
    })
  }

  if (beeColonies) {
    items.push({
      emoji: '🐝',
      title: t.availBeesTitle,
      note: `${beekeeperNote} · ${beeColonies.status === 'preorder' ? preorderLabel : availableLabel}`,
      href: `/beekeeper/${beeColonies.slug}`,
    })
  }

  // If production data is temporarily unavailable, omit the entire "available
  // now" claim rather than rendering stale hardcoded availability or prices.
  if (items.length === 0) return null

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
          {items.map((item) => (
            <Link
              key={`${item.href}:${item.title}`}
              href={localizedPath(locale, item.href)}
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
