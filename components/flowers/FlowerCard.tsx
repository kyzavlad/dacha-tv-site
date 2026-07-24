import Link from 'next/link'
import Image from 'next/image'
import type { FlowerProduct } from '@/types'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PC9zdmc+'

interface FlowerCardProps {
  product: FlowerProduct
}

function resolveImage(product: FlowerProduct): { src: string; alt: string } | null {
  const media = product.media ?? []
  const primary = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image')
  if (primary) return { src: primary.url, alt: primary.alt ?? product.name }
  if (!product.image_url) return null
  if (product.image_url.startsWith('http')) return { src: product.image_url, alt: product.image_alt ?? product.name }
  return null
}

export async function FlowerCard({ product }: FlowerCardProps) {
  const locale = await getRequestLocale()
  const img = resolveImage(product)
  const canBuy = Boolean(product.price_uah && product.price_uah > 0 && (product.status === 'available' || product.status === 'preorder'))

  return (
    <article className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-300 hover:shadow-xl transition-all duration-300 flex flex-col">
      <Link href={localizedPath(locale, `/flowers/${product.slug}`)} className="block relative aspect-square bg-gray-50 overflow-hidden">
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
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 gap-2">
            <span className="text-4xl opacity-40 group-hover:opacity-60 transition-opacity select-none" aria-hidden="true">🌸</span>
            <span className="text-gray-400 text-xs text-center px-4 leading-tight">{product.name}</span>
          </div>
        )}

        {product.is_featured && (
          <div className="absolute top-3 left-3">
            <span className="bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
              {tr({ uk: 'Популярна', ru: 'Популярный' }, locale)}
            </span>
          </div>
        )}

        {product.status !== 'available' && product.status !== 'preorder' && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px] flex items-center justify-center">
            <span className="bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-full">
              {tr({ uk: 'Немає в наявності', ru: 'Нет в наличии' }, locale)}
            </span>
          </div>
        )}
      </Link>

      <div className="p-4 flex flex-col flex-1">
        {product.variety && (
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
            {product.variety}
          </span>
        )}

        <h3 className="font-serif text-base font-bold text-gray-900 mb-1 leading-tight">
          {product.name}
        </h3>

        {product.short_description && (
          <p className="text-xs text-gray-500 leading-relaxed mb-2 line-clamp-2">
            {product.short_description}
          </p>
        )}

        {(product.color || product.bloom_season) && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {product.color && (
              <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                {product.color}
              </span>
            )}
            {product.bloom_season && (
              <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                {product.bloom_season}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto">
          {product.price_uah ? (
            <p className="text-lg font-bold text-gray-900 mb-3">
              {tr({ uk: 'від', ru: 'от' }, locale)} {Number(product.price_uah).toLocaleString('uk-UA')} грн
            </p>
          ) : null}

          {canBuy ? (
            <AddToCartButton
              item={{
                id: `flower-${product.slug}`,
                productType: 'flower',
                productSlug: product.slug,
                name: product.name,
                price: product.price_uah!,
                imageUrl: img?.src ?? undefined,
              }}
            />
          ) : null}
          <Link
            href={localizedPath(locale, `/flowers/${product.slug}`)}
            className="block text-center text-xs font-medium mt-2 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label={tr({ uk: `Детальніше про ${product.name}`, ru: `Подробнее о ${product.name}` }, locale)}
          >
            {tr({ uk: 'Детальніше →', ru: 'Подробнее →' }, locale)}
          </Link>
        </div>
      </div>
    </article>
  )
}
