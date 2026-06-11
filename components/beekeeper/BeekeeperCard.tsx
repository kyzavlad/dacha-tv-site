import Image from 'next/image'
import Link from 'next/link'
import type { BeekeeperProduct } from '@/types'

interface BeekeeperCardProps {
  product: BeekeeperProduct
}

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWE1YzM1Ii8+PC9zdmc+'

function resolveImage(product: BeekeeperProduct): { url: string; alt: string } | null {
  const media = product.media ?? []
  const primary = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image')
  if (primary) return { url: primary.url, alt: primary.alt ?? product.name }
  if (product.image_url) return { url: product.image_url, alt: product.image_alt ?? product.name }
  return null
}

export function BeekeeperCard({ product }: BeekeeperCardProps) {
  const img = resolveImage(product)
  const isUnavailable = product.status !== 'available' && product.status !== 'preorder'

  return (
    <article className="group bg-white rounded-2xl overflow-hidden border border-forest-100 hover:border-forest-300 hover:shadow-lg transition-all duration-300 flex flex-col">
      <Link href={`/beekeeper/${product.slug}`} className="block relative aspect-square bg-forest-50 overflow-hidden flex-shrink-0">
        {img ? (
          <Image
            src={img.url}
            alt={img.alt}
            fill
            className={`object-cover group-hover:scale-105 transition-transform duration-500${isUnavailable ? ' opacity-60' : ''}`}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-forest-50 to-forest-200">
            <span className="text-forest-600 font-serif font-bold text-xl text-center px-4">
              {product.name}
            </span>
          </div>
        )}

        {product.is_featured && (
          <div className="absolute top-3 left-3">
            <span className="bg-honey-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              Популярне
            </span>
          </div>
        )}
        {isUnavailable && (
          <div className="absolute top-3 right-3">
            <span className="bg-gray-800/80 text-white text-xs font-medium px-2.5 py-1 rounded-full">
              {product.status === 'preorder' ? 'Передзамовлення' : 'Немає'}
            </span>
          </div>
        )}
      </Link>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-serif text-lg font-bold text-bark mb-2 leading-snug">
          {product.name}
        </h3>

        {product.season_note && (
          <p className="text-forest-700 text-xs font-medium mb-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {product.season_note}
          </p>
        )}

        {product.breeds && product.breeds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {product.breeds.map((breed) => (
              <span key={breed} className="text-xs bg-forest-50 text-forest-700 border border-forest-200 px-2 py-0.5 rounded-full font-medium">
                {breed}
              </span>
            ))}
          </div>
        )}

        {product.description && (
          <p className="text-bark/60 text-sm leading-relaxed line-clamp-2 flex-1">
            {product.description}
          </p>
        )}

        {(product.price_uah != null || product.price_note) && (
          <div className="mt-3 flex items-baseline gap-2">
            {product.price_uah != null && (
              <span className="text-sm font-semibold text-bark">{product.price_uah} грн</span>
            )}
            {product.price_note && (
              <span className="text-xs text-bark/50">{product.price_note}</span>
            )}
          </div>
        )}

        <Link
          href={`/beekeeper/${product.slug}`}
          className="mt-4 inline-flex items-center justify-center w-full px-4 py-2.5 bg-forest-700 text-white font-semibold text-sm rounded-lg hover:bg-forest-800 transition-colors min-h-[44px]"
        >
          Детальніше
        </Link>
      </div>
    </article>
  )
}
