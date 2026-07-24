import Link from 'next/link'
import Image from 'next/image'
import type { HoneyProduct } from '@/types'
import { honeyUnitPriceUah } from '@/lib/honey-pricing'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { DEFAULT_LOCALE, isLocale, localizedPath } from '@/lib/i18n'

interface HoneyCardProps {
  product: HoneyProduct
  // Active locale — keeps the /ru prefix on the product link. Default uk.
  locale?: string
}

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmJiZjI0Ii8+PC9zdmc+'

// Neutral brand placeholder label — never a specific honey variety (e.g.
// "Акація"), so custom honey products don't inherit a fixed variety visual.
const HONEY_PLACEHOLDER_LABEL = 'Мед Дача TV'

function resolveImage(product: HoneyProduct): { src: string; alt: string } | null {
  const media = product.media ?? []
  const primary = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image')
  if (primary) return { src: primary.url, alt: primary.alt ?? product.name }
  if (!product.image_url) return null
  return { src: product.image_url, alt: product.image_alt ?? product.name }
}

export function HoneyCard({ product, locale }: HoneyCardProps) {
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE
  const href = localizedPath(loc, `/honey/${product.slug}`)
  // Description no longer derives from `variety` — use the product's own copy,
  // else a neutral brand line.
  const shortDesc = product.short_description || 'Натуральний мед від пасіки Дача TV'
  const img = resolveImage(product)

  const price = honeyUnitPriceUah(product)
  // Buyable directly from the card when there is a valid price and the product is
  // orderable — same conditions the honey detail widget uses. Honey has a single
  // canonical unit price (1 л); no plastic/glass selector.
  const buyable = price != null && price > 0 && (product.status === 'available' || product.status === 'preorder')

  return (
    <article className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-bark/20 hover:shadow-xl transition-all duration-300 flex flex-col">
      {/* Image */}
      <div className="relative aspect-square bg-honey-50 overflow-hidden">
        {img ? (
          <Image
            src={img.src}
            alt={img.alt}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-honey-50 to-honey-200">
            <span className="text-honey-600 font-serif font-bold text-2xl text-center px-4">
              {HONEY_PLACEHOLDER_LABEL}
            </span>
          </div>
        )}

        {product.is_featured && (
          <div className="absolute top-3 left-3">
            <span className="bg-honey-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
              Популярний
            </span>
          </div>
        )}

        {product.status !== 'available' && product.status !== 'preorder' && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px] flex items-center justify-center">
            <span className="bg-bark text-white text-sm font-semibold px-4 py-2 rounded-full">
              Немає в наявності
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-serif text-lg font-bold text-bark mb-1.5">
          {product.name}
        </h3>

        <p className="text-sm text-gray-500 mb-3 leading-relaxed flex-1">
          {shortDesc}
        </p>

        {/* Packaging chips */}
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
            <span className="text-bark font-bold text-lg">{price} грн</span>
            <span className="text-bark/50 text-xs ml-1.5">/ 1 л</span>
          </div>
        )}

        {buyable ? (
          // Primary "До кошика" (reuses the shared cart button + honey item
          // shape from the detail-page widget: one price, unit "1 л"), with
          // "Детальніше" kept as a secondary link.
          <div className="space-y-2">
            <AddToCartButton
              item={{
                id: `honey-${product.slug}`,
                productType: 'honey' as const,
                productSlug: product.slug,
                name: product.name,
                price,
                imageUrl: img?.src ?? undefined,
                variant: '1 л',
              }}
            />
            <Link
              href={href}
              className="block text-center text-sm font-medium text-bark/50 hover:text-bark transition-colors"
              aria-label={`Детальніше про ${product.name}`}
            >
              Детальніше →
            </Link>
          </div>
        ) : (
          <Link
            href={href}
            className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-3 bg-bark text-white font-semibold text-sm rounded-full transition-colors hover:bg-bark-light min-h-[44px] group-hover:bg-honey-700"
            aria-label={`Детальніше про ${product.name}`}
          >
            Детальніше
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
    </article>
  )
}
