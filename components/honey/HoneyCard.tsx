import Link from 'next/link'
import Image from 'next/image'
import type { HoneyProduct } from '@/types'
import { honeyUnitPriceUah } from '@/lib/honey-pricing'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { getRequestLocale, isLocale, localizedPath } from '@/lib/i18n'
import { getManualTranslations, resolveManualField } from '@/lib/i18n/manual-translations'
import { tr } from '@/lib/i18n/pages'

interface HoneyCardProps {
  product: HoneyProduct
  // Optional explicit locale. When omitted, resolve it from the active request so
  // cards rendered by grids/previews/related-products keep /ru and /en routes.
  locale?: string
}

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmJiZjI0Ii8+PC9zdmc+'

function resolveImage(product: HoneyProduct): { src: string; alt: string } | null {
  const media = product.media ?? []
  const primary = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image')
  if (primary) return { src: primary.url, alt: primary.alt ?? product.name }
  if (!product.image_url) return null
  return { src: product.image_url, alt: product.image_alt ?? product.name }
}

export async function HoneyCard({ product, locale }: HoneyCardProps) {
  const requestLocale = isLocale(locale) ? locale : await getRequestLocale()
  const loc = requestLocale
  const translation = loc === 'uk'
    ? null
    : (await getManualTranslations('honey_product', [product.id], loc)).get(product.id) ?? null

  const name = resolveManualField(product.name, translation, 'name', loc) || product.name
  const shortDesc = resolveManualField(product.short_description ?? null, translation, 'short_description', loc)
    || tr({
      uk: 'Натуральний мед від пасіки Дача TV',
      ru: 'Натуральный мёд от пасеки Дача TV',
      en: 'Natural honey from the Dacha TV apiary',
    }, loc)
  const href = localizedPath(loc, `/honey/${product.slug}`)
  const img = resolveImage(product)
  const imageAlt = translation?.image_alt?.trim() || (loc === 'uk' ? img?.alt : '') || name

  const placeholderLabel = tr({ uk: 'Мед Дача TV', ru: 'Мёд Дача TV', en: 'Dacha TV Honey' }, loc)
  const featuredLabel = tr({ uk: 'Популярний', ru: 'Популярный', en: 'Popular' }, loc)
  const unavailableLabel = tr({ uk: 'Немає в наявності', ru: 'Нет в наличии', en: 'Out of stock' }, loc)
  const detailsLabel = tr({ uk: 'Детальніше', ru: 'Подробнее', en: 'Details' }, loc)
  const currencyLabel = tr({ uk: 'грн', ru: 'грн', en: 'UAH' }, loc)
  const unitLabel = tr({ uk: '1 л', ru: '1 л', en: '1 L' }, loc)

  const price = honeyUnitPriceUah(product)
  // Buyable directly from the card when there is a valid price and the product is
  // orderable — same conditions the honey detail widget uses. Honey has a single
  // canonical unit price (1 L); no plastic/glass selector.
  const buyable = price != null && price > 0 && (product.status === 'available' || product.status === 'preorder')

  return (
    <article className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-bark/20 hover:shadow-xl transition-all duration-300 flex flex-col">
      {/* Image */}
      <div className="relative aspect-square bg-honey-50 overflow-hidden">
        {img ? (
          <Image
            src={img.src}
            alt={imageAlt}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-honey-50 to-honey-200">
            <span className="text-honey-600 font-serif font-bold text-2xl text-center px-4">
              {placeholderLabel}
            </span>
          </div>
        )}

        {product.is_featured && (
          <div className="absolute top-3 left-3">
            <span className="bg-honey-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
              {featuredLabel}
            </span>
          </div>
        )}

        {product.status !== 'available' && product.status !== 'preorder' && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px] flex items-center justify-center">
            <span className="bg-bark text-white text-sm font-semibold px-4 py-2 rounded-full">
              {unavailableLabel}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-serif text-lg font-bold text-bark mb-1.5">
          {name}
        </h3>

        <p className="text-sm text-gray-500 mb-3 leading-relaxed flex-1">
          {shortDesc}
        </p>

        {/* Packaging chips are stored product data, not static UI copy. */}
        {product.packaging && product.packaging.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {product.packaging.map((pack) => (
              <span
                key={pack}
                className="text-xs bg-honey-50 text-honey-800 border border-honey-200 px-2.5 py-1 rounded-full font-medium"
              >
                {pack}
              </span>
            ))}
          </div>
        )}

        {/* Price line */}
        {price != null && (
          <div className="mb-4">
            <span className="text-bark font-bold text-lg">{price} {currencyLabel}</span>
            <span className="text-bark/50 text-xs ml-1.5">/ {unitLabel}</span>
          </div>
        )}

        {buyable ? (
          <div className="space-y-2">
            <AddToCartButton
              item={{
                id: `honey-${product.slug}`,
                productType: 'honey' as const,
                productSlug: product.slug,
                name,
                price,
                imageUrl: img?.src ?? undefined,
                variant: unitLabel,
              }}
            />
            <Link
              href={href}
              className="block text-center text-sm font-medium text-bark/50 hover:text-bark transition-colors"
              aria-label={`${detailsLabel}: ${name}`}
            >
              {detailsLabel} →
            </Link>
          </div>
        ) : (
          <Link
            href={href}
            className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-3 bg-bark text-white font-semibold text-sm rounded-full transition-colors hover:bg-bark-light min-h-[44px] group-hover:bg-honey-700"
            aria-label={`${detailsLabel}: ${name}`}
          >
            {detailsLabel}
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
    </article>
  )
}
