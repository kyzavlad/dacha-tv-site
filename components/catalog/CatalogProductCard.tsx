import Link from 'next/link'
import type { CatalogProduct } from '@/types'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { SafeImage } from '@/components/shared/SafeImage'
import { canAddToCart, displayProductName, formatCatalogPrice, getCatalogProductImage, hasDisplayablePrice } from '@/lib/supabase/catalog'

interface CatalogProductCardProps {
  product: CatalogProduct
  categorySlug: string
}

export function CatalogProductCard({ product, categorySlug }: CatalogProductCardProps) {
  const href = `/catalog/${categorySlug}/${product.slug}`
  const imageUrl = getCatalogProductImage(product)
  const name = displayProductName(product)
  const priceOk = hasDisplayablePrice(product)
  const buyable = canAddToCart(product)
  const priceLabel = formatCatalogPrice(product)
  const hasDiscount =
    priceOk && product.compare_price_uah != null && product.price_uah != null && product.compare_price_uah > product.price_uah

  return (
    <article className="group bg-white rounded-2xl overflow-hidden border border-honey-100 shadow-sm hover:shadow-md transition-all flex flex-col">
      <Link href={href} className="relative block aspect-square bg-honey-50 overflow-hidden">
        <SafeImage
          src={imageUrl}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-honey-50 to-forest-50 gap-3 px-4">
              <span className="text-5xl opacity-40" aria-hidden="true">🌿</span>
              <span className="text-forest-800/70 font-serif text-sm text-center leading-snug line-clamp-3">
                {name}
              </span>
              {product.supplier_sku && (
                <span className="text-xs text-bark/40 font-mono tracking-wide">
                  {product.supplier_sku}
                </span>
              )}
            </div>
          }
        />
        {product.is_featured && (
          <span className="absolute top-2 left-2 text-xs font-semibold bg-honey-700 text-white px-2 py-0.5 rounded-full">
            Хіт
          </span>
        )}
        {hasDiscount && (
          <span className="absolute top-2 right-2 text-xs font-semibold bg-green-600 text-white px-2 py-0.5 rounded-full">
            −{Math.round((1 - product.price_uah! / product.compare_price_uah!) * 100)}%
          </span>
        )}
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <Link href={href}>
          <h3 className="font-serif text-base font-semibold text-bark mb-1 leading-tight line-clamp-2 hover:text-honey-700 transition-colors">
            {name}
          </h3>
        </Link>

        {product.supplier_sku && (
          <p className="text-[10px] text-bark/35 font-mono mb-2 truncate" title={`Артикул: ${product.supplier_sku}`}>
            {product.supplier_sku}
          </p>
        )}

        {product.short_description && (
          <p className="text-xs text-bark/60 line-clamp-2 mb-3">{product.short_description}</p>
        )}

        <div className="mt-auto">
          {priceLabel ? (
            <div className="flex items-baseline gap-2 mb-3">
              <p className="text-lg font-bold text-bark">{priceLabel}</p>
              {hasDiscount && (
                <p className="text-xs text-gray-400 line-through">
                  {product.compare_price_uah!.toLocaleString('uk-UA')} грн
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm font-semibold text-honey-700 mb-3">Уточнити ціну</p>
          )}

          {buyable ? (
            <AddToCartButton
              item={{
                id: `catalog-${product.slug}`,
                productType: 'catalog',
                productSlug: product.slug,
                name: name,
                price: product.price_uah as number,
                imageUrl: imageUrl ?? undefined,
              }}
            />
          ) : product.status === 'published' ? (
            <Link
              href={href}
              className="flex items-center justify-center w-full py-2.5 px-4 text-sm font-semibold rounded-xl border border-honey-300 text-honey-700 hover:bg-honey-50 transition-colors"
            >
              Уточнити ціну
            </Link>
          ) : (
            <div className="text-xs text-gray-400 text-center py-2">Немає в наявності</div>
          )}
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
