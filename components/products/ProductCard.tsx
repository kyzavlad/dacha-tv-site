import Link from 'next/link'
import Image from 'next/image'
import type { ApiaryProduct } from '@/types'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { DEFAULT_LOCALE, isLocale, localizedPath } from '@/lib/i18n'

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmJiZjI0Ii8+PC9zdmc+'

interface ProductCardProps {
  product: ApiaryProduct
  // Active locale — keeps the /ru prefix on the product link. Default uk.
  locale?: string
}

function resolveImage(product: ApiaryProduct): { src: string; alt: string } | null {
  const media = product.media ?? []
  const primary = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image')
  if (primary) return { src: primary.url, alt: primary.alt ?? product.name }
  if (!product.image_url) return null
  if (product.image_url.startsWith('http')) return { src: product.image_url, alt: product.image_alt ?? product.name }
  return null
}

export function ProductCard({ product, locale }: ProductCardProps) {
  const loc = isLocale(locale) ? locale : DEFAULT_LOCALE
  const href = localizedPath(loc, `/products/${product.slug}`)
  const img = resolveImage(product)
  const blurb = product.short_description || product.description || null
  const canBuy = Boolean(product.price_uah && product.price_uah > 0 && (product.status === 'available' || product.status === 'preorder'))

  return (
    <article className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-honey-100 flex flex-col">
      <Link href={href} className="block relative aspect-square bg-honey-50">
        {img ? (
          <Image
            src={img.src}
            alt={img.alt}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-honey-50 to-honey-100 gap-2">
            <span className="text-4xl opacity-30" aria-hidden="true">🍯</span>
            <span className="text-honey-800/50 font-serif text-sm text-center px-4 leading-tight">
              {product.name}
            </span>
          </div>
        )}
        {product.status !== 'available' && product.status !== 'preorder' && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="bg-gray-800 text-white text-sm font-semibold px-3 py-1.5 rounded-full">
              Немає в наявності
            </span>
          </div>
        )}
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-serif text-base font-semibold text-bark mb-1 leading-tight">
          {product.name}
        </h3>

        {blurb && (
          <p className="text-sm text-bark/60 leading-relaxed mb-3 line-clamp-2">
            {blurb}
          </p>
        )}

        {product.packaging && product.packaging.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {product.packaging.map((pack) => (
              <span
                key={pack}
                className="text-xs bg-honey-50 text-honey-700 border border-honey-200 px-2 py-0.5 rounded-full"
              >
                {pack}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto">
          {product.price_uah ? (
            <p className="text-lg font-bold text-bark mb-3">
              від {product.price_uah.toLocaleString('uk-UA')} грн
            </p>
          ) : null}

          {canBuy ? (
            <AddToCartButton
              item={{
                id: `apiary-${product.slug}`,
                productType: 'apiary',
                productSlug: product.slug,
                name: product.name,
                price: product.price_uah!,
                imageUrl: img?.src ?? undefined,
              }}
            />
          ) : null}
          <Link
            href={href}
            className="block text-center text-xs font-medium mt-2 text-bark/50 hover:text-bark transition-colors"
          >
            Детальніше →
          </Link>
        </div>
      </div>
    </article>
  )
}
