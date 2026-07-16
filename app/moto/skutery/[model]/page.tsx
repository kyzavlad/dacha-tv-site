export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getScooterModelProducts, CATALOG_PAGE_SIZE, displayProductName, hasValidPrice } from '@/lib/supabase/catalog'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { Breadcrumb } from '@/components/catalog/Breadcrumb'
import { StructuredData } from '@/components/shared/StructuredData'
import { FaqBlock } from '@/components/shared/FaqBlock'
import { PhoneLink } from '@/components/shared/PhoneLink'
import { ModelListAnalytics } from '@/components/moto/ModelListAnalytics'
import { breadcrumbSchema, itemListSchema } from '@/lib/schema'
import { buildAlternates, buildSocialMetadata } from '@/lib/seo'
import { getRequestLocale, localizedPath, type Locale } from '@/lib/i18n'
import { LAUNCH_PHONE } from '@/lib/launch-defaults'
import type { AnalyticsItem } from '@/lib/analytics/gtag'
import { SCOOTER_CATEGORY_SLUG, getScooterModel, MODEL_SLUGS, type ScooterModel } from '@/lib/moto/scooter-models'

interface Props {
  params: Promise<{ model: string }>
  searchParams: Promise<{ page?: string; mod?: string }>
}

// Config carries uk/ru copy only. EN is not supported for these landings — the
// page 404s and no EN hreflang is advertised (see generateMetadata / notFound).
type L = 'uk' | 'ru'
const lang = (locale: Locale): L => (locale === 'ru' ? 'ru' : 'uk')

// Localized plural for "товар" — used for the honest page-1 "showing N products"
// copy. We never claim a grand total (the query no longer computes one), so this
// only ever pluralizes the count actually rendered on the current page.
const ukProduct = (n: number): string => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return 'товарів'
  if (mod10 === 1) return 'товар'
  if (mod10 >= 2 && mod10 <= 4) return 'товари'
  return 'товарів'
}
const ruProduct = (n: number): string => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return 'товаров'
  if (mod10 === 1) return 'товар'
  if (mod10 >= 2 && mod10 <= 4) return 'товара'
  return 'товаров'
}

const STR: Record<L, {
  home: string; catalog: string; scooters: string
  shown: (from: number, to: number, count: number, page: number) => string
  prev: string; next: string; pageLabel: (page: number) => string
  mods: string; allMods: string
  benefitsTitle: string; benefits: string[]
  deliveryTitle: string; delivery: string; payment: string
  findPart: string; order: string; callUs: string
  empty: string; faqHeading: string; productsHint: string
}> = {
  uk: {
    home: 'Головна', catalog: 'Каталог', scooters: 'Скутери',
    shown: (from, to, count, page) =>
      page > 1 ? `Показано товари ${from}–${to}` : `Показано ${count} ${ukProduct(count)}`,
    prev: 'Попередня', next: 'Наступна', pageLabel: (p) => `Сторінка ${p}`,
    mods: 'Модифікації', allMods: 'Усі',
    benefitsTitle: 'Чому зручно замовляти в нас',
    benefits: ['Підбір за моделлю та рамою', 'Актуальні позиції з каталогу', 'Доставка Новою Поштою по Україні', 'Консультація щодо сумісності'],
    deliveryTitle: 'Доставка та оплата',
    delivery: 'Відправляємо Новою Поштою по всій Україні — на відділення або в поштомат.',
    payment: 'Оплата: накладений платіж (при отриманні) або передоплата на картку/ФОП за домовленістю.',
    findPart: 'Знайти потрібну деталь', order: 'Замовити', callUs: 'Зателефонувати',
    empty: 'Наразі немає доступних позицій для цієї моделі. Залиште заявку або зателефонуйте — знайдемо потрібну деталь.',
    faqHeading: 'Часті запитання',
    productsHint: 'Наявність уточнюється при підтвердженні замовлення.',
  },
  ru: {
    home: 'Главная', catalog: 'Каталог', scooters: 'Скутеры',
    shown: (from, to, count, page) =>
      page > 1 ? `Показаны товары ${from}–${to}` : `Показано ${count} ${ruProduct(count)}`,
    prev: 'Предыдущая', next: 'Следующая', pageLabel: (p) => `Страница ${p}`,
    mods: 'Модификации', allMods: 'Все',
    benefitsTitle: 'Почему удобно заказывать у нас',
    benefits: ['Подбор по модели и раме', 'Актуальные позиции из каталога', 'Доставка Новой Почтой по Украине', 'Консультация по совместимости'],
    deliveryTitle: 'Доставка и оплата',
    delivery: 'Отправляем Новой Почтой по всей Украине — на отделение или в почтомат.',
    payment: 'Оплата: наложенный платёж (при получении) или предоплата на карту/ФОП по договорённости.',
    findPart: 'Найти нужную деталь', order: 'Заказать', callUs: 'Позвонить',
    empty: 'Сейчас нет доступных позиций для этой модели. Оставьте заявку или позвоните — найдём нужную деталь.',
    faqHeading: 'Частые вопросы',
    productsHint: 'Наличие уточняется при подтверждении заказа.',
  },
}

export function generateStaticParams() {
  return MODEL_SLUGS.map((model) => ({ model }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model: slug } = await params
  const model = getScooterModel(slug)
  if (!model) return { title: 'Не знайдено' }
  const locale = await getRequestLocale()
  // These landings have no EN content — never index EN nor advertise it.
  if (locale === 'en') return { title: model.metaTitle.uk, robots: { index: false, follow: false } }
  const l = lang(locale)
  // Canonical → base model URL (mod views are UX filters, not separate indexable
  // pages). hreflang only for the locales that actually have content (uk, ru).
  const { canonical, languages } = buildAlternates(locale, `/moto/skutery/${model.slug}`, ['uk', 'ru'])
  return buildSocialMetadata({
    bareTitle: model.metaTitle[l],
    description: model.metaDescription[l],
    canonical,
    languages,
    imageAlt: model.h1[l],
  })
}

export default async function ScooterModelPage({ params, searchParams }: Props) {
  const { model: slug } = await params
  const { page: pageStr, mod: modStr } = await searchParams
  const model = getScooterModel(slug)
  if (!model) notFound()
  const m = model as ScooterModel

  const locale = await getRequestLocale()
  if (locale === 'en') notFound() // no EN content for these landings
  const l = lang(locale)
  const t = STR[l]
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)
  const activeMod = m.mods.find((x) => x.slug === modStr) ?? null

  // No silent catch: a real DB/PostgREST failure must surface (500 + logs), not
  // masquerade as a valid empty product page.
  const { products, hasNext } = await getScooterModelProducts(
    SCOOTER_CATEGORY_SLUG,
    m.tokens,
    page,
    activeMod?.tokens,
  )

  const rangeFrom = (page - 1) * CATALOG_PAGE_SIZE + 1
  const rangeTo = (page - 1) * CATALOG_PAGE_SIZE + products.length

  const basePath = `/moto/skutery/${m.slug}`
  const catalogHref = localizedPath(locale, `/catalog/${SCOOTER_CATEGORY_SLUG}`)
  // "Honda Dio" etc. — brand+model already, no double brand.
  const modelLabel = m.h1[l].replace(/^Запч[а-я]+ для /i, '')

  const crumbs = [
    { label: t.home, href: localizedPath(locale, '/') },
    { label: t.catalog, href: localizedPath(locale, '/catalog') },
    { label: t.scooters, href: catalogHref },
    { label: modelLabel },
  ]

  // Analytics items (serializable) for view_item_list / select_item.
  const analyticsItems: AnalyticsItem[] = products.map((p) => ({
    item_id: p.id,
    item_name: displayProductName(p, locale),
    price: hasValidPrice(p.price_uah) ? (p.price_uah as number) : undefined,
    item_category: `scooter/${m.slug}`,
  }))

  // Localized product URLs (RU → /ru/catalog/...) and global positions across
  // pagination (page 2 starts at 25).
  const itemListLd = itemListSchema(
    products.map((p) => ({ name: displayProductName(p, locale), url: localizedPath(locale, `/catalog/${SCOOTER_CATEGORY_SLUG}/${p.slug}`) })),
    (page - 1) * CATALOG_PAGE_SIZE,
  )

  const modHref = (modSlug: string | null) => {
    const sp = new URLSearchParams()
    if (modSlug) sp.set('mod', modSlug)
    const qs = sp.toString()
    return `${localizedPath(locale, basePath)}${qs ? `?${qs}` : ''}`
  }

  // Pagination hrefs — preserve the active mod filter and set the target page.
  // page=1 is left out of the query (it is the canonical/default).
  const pageHref = (p: number) => {
    const sp = new URLSearchParams()
    if (activeMod?.slug) sp.set('mod', activeMod.slug)
    if (p > 1) sp.set('page', String(p))
    const qs = sp.toString()
    return `${localizedPath(locale, basePath)}${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="bg-cream min-h-screen">
      <StructuredData data={breadcrumbSchema(crumbs)} />
      {products.length > 0 && <StructuredData data={itemListLd} />}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumb crumbs={crumbs} />
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mt-4 mb-2">{m.h1[l]}</h1>
          <p className="text-gray-500 text-base max-w-2xl">{m.intro[l]}</p>

          {/* CTA row — scroll to this page's own product grid, never back to /search */}
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <a href="#model-products" className="inline-flex items-center justify-center rounded-xl bg-honey-700 text-white text-sm font-semibold px-5 py-2.5 hover:bg-honey-800 transition-colors">
              {t.findPart}
            </a>
            <span className="text-sm text-bark/60">
              {t.callUs}: <PhoneLink phone={LAUNCH_PHONE} showIcon location={`moto-${m.slug}`} className="text-sm" />
            </span>
          </div>

          {/* Modification chips */}
          {m.mods.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t.mods}</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={modHref(null)}
                  aria-pressed={!activeMod}
                  className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${!activeMod ? 'bg-bark text-white border-bark' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                >
                  {t.allMods}
                </Link>
                {m.mods.map((mod) => (
                  <Link
                    key={mod.slug}
                    href={modHref(mod.slug)}
                    aria-pressed={activeMod?.slug === mod.slug}
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${activeMod?.slug === mod.slug ? 'bg-honey-600 text-white border-honey-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                  >
                    {mod.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div id="model-products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 scroll-mt-24">
        {/* Result summary — honest count of what is actually on this page. We no
            longer compute an exact grand total (it caused a production statement
            timeout), so the copy never claims one. */}
        {products.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-bark">{t.shown(rangeFrom, rangeTo, products.length, page)}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.productsHint}</p>
          </div>
        )}

        {/* Product grid */}
        {products.length === 0 ? (
          <div className="rounded-2xl border border-honey-100 bg-white p-8 text-center">
            <p className="text-bark/70 mb-4">{t.empty}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <PhoneLink phone={LAUNCH_PHONE} showIcon location={`moto-${m.slug}-empty`} />
              <Link href={localizedPath(locale, '/contact')} className="text-sm font-medium text-honey-700 hover:underline">{t.order}</Link>
            </div>
          </div>
        ) : (
          <>
            <ModelListAnalytics listId={m.listId} listName={m.listName} items={analyticsItems}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {products.map((p) => (
                  <div key={p.id} data-item-id={p.id}>
                    <CatalogProductCard product={p} categorySlug={SCOOTER_CATEGORY_SLUG} locale={locale} />
                  </div>
                ))}
              </div>
            </ModelListAnalytics>
            {/* Landing-specific Prev/Next — driven by `hasNext` (page-size+1
                lookahead), not an exact total. Prev shows when page > 1, Next only
                when another page exists. No numbered pages / total (unavailable). */}
            {(page > 1 || hasNext) && (
              <nav className="mt-10 flex items-center justify-between gap-4" aria-label={t.pageLabel(page)}>
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    rel="prev"
                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-bark hover:border-gray-300 transition-colors"
                  >
                    ← {t.prev}
                  </Link>
                ) : (
                  <span aria-hidden="true" />
                )}
                <span className="text-sm text-gray-500">{t.pageLabel(page)}</span>
                {hasNext ? (
                  <Link
                    href={pageHref(page + 1)}
                    rel="next"
                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-bark hover:border-gray-300 transition-colors"
                  >
                    {t.next} →
                  </Link>
                ) : (
                  <span aria-hidden="true" />
                )}
              </nav>
            )}
          </>
        )}

        {/* Benefits + delivery/payment */}
        <section className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-honey-100 bg-white p-6">
            <h2 className="font-serif text-xl font-bold text-bark mb-3">{t.benefitsTitle}</h2>
            <ul className="space-y-2">
              {t.benefits.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-bark/70">
                  <span className="text-honey-600 mt-0.5" aria-hidden="true">✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-honey-100 bg-white p-6">
            <h2 className="font-serif text-xl font-bold text-bark mb-3">{t.deliveryTitle}</h2>
            <p className="text-sm text-bark/70 leading-relaxed">{t.delivery}</p>
            <p className="text-sm text-bark/70 leading-relaxed mt-2">{t.payment}</p>
            {/* No direct checkout link — checkout is reached via the cart after a
                product is selected. Scroll to the grid instead. */}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <a href="#model-products" className="inline-flex items-center justify-center rounded-lg bg-forest-700 text-white text-sm font-semibold px-4 py-2 hover:bg-forest-800 transition-colors">
                {t.findPart}
              </a>
              <Link href={catalogHref} className="text-sm font-medium text-honey-700 hover:underline">{t.scooters} →</Link>
            </div>
          </div>
        </section>

        <FaqBlock items={m.faq[l]} heading={t.faqHeading} />
      </div>
    </div>
  )
}
