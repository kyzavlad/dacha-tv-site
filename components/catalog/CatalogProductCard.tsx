import Link from 'next/link'
import type { CatalogProduct } from '@/types'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { SafeImage } from '@/components/shared/SafeImage'
import { canAddToCart, displayProductName, formatCatalogPrice, getCatalogProductImage, getCatalogPrimaryImageAlt, hasDisplayablePrice } from '@/lib/supabase/catalog'
import { stockStatus, stockLabel } from '@/lib/catalog/stock'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n'
import { pageDict } from '@/lib/i18n/pages'

interface CatalogProductCardProps {
  product: CatalogProduct
  categorySlug: string
  // Active locale ('ru' prefers the Russian supplier name; default Ukrainian).
  // Only affects the displayed name — never whether the card renders.
  locale?: string
}

// Label for the inquiry CTA on manual products that have a "від" price but are
// ordered by contact (gift sets, made-to-order oil). Falls back to the neutral
// "Уточнити ціну" for everything else (supplier catalog is unaffected — those
// buyable products never reach this branch).
const INQUIRY_CTA: Record<string, { uk: string; ru: string; en: string }> = {
  'podarunkovi-nabory': { uk: 'Замовити набір', ru: 'Заказать набор', en: 'Order set' },
  'zhyvi-olii-holodnogo-vidzhymu': { uk: 'Замовити олію', ru: 'Заказать масло', en: 'Order oil' },
}
function inquiryCtaLabel(product: CatalogProduct, loc: Locale, priceOnRequest: string): string {
  const e = product.category_slug ? INQUIRY_CTA[product.category_slug] : undefined
  return e ? (e[loc] ?? e.uk) : priceOnRequest
}

export function CatalogProductCard({ product, categorySlug, locale }: CatalogProductCardProps) {
  const loc: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE
  const t = pageDict(loc)
  const href = `/catalog/${categorySlug}/${product.slug}`
  const imageUrl = getCatalogProductImage(product)
  const name = displayProductName(product, locale)
  // Saved primary alt → localized product name fallback.
  const imageAlt = getCatalogPrimaryImageAlt(product, name)
  const priceOk = hasDisplayablePrice(product)
  const buyable = canAddToCart(product)
  const priceLabel = formatCatalogPrice(product)
  const stStatus = stockStatus(product)
  const stockIsOut = stStatus === 'out_of_stock'
  const stockText = stockLabel(stStatus, loc)
  const hasDiscount =
    priceOk && product.compare_price_uah != null && product.price_uah != null && product.compare_price_uah > product.price_uah

  return (
    <article className="group bg-white rounded-2xl overflow-hidden border border-honey-100 shadow-sm hover:shadow-md transition-all flex flex-col">
      <Link href={href} className="relative block aspect-square bg-honey-50 overflow-hidden">
        <SafeImage
          src={imageUrl}
          alt={imageAlt}
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
            {loc === 'ru' ? 'Хит' : loc === 'en' ? 'Top' : 'Хіт'}
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
            <p className="text-sm font-semibold text-honey-700 mb-3">{t.shop.priceOnRequest}</p>
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
              outOfStock={stockIsOut}
              outOfStockLabel={stockText}
            />
          ) : product.status === 'published' ? (
            <Link
              href={href}
              className="flex items-center justify-center w-full py-2.5 px-4 text-sm font-semibold rounded-xl border border-honey-300 text-honey-700 hover:bg-honey-50 transition-colors"
            >
              {inquiryCtaLabel(product, loc, t.shop.priceOnRequest)}
            </Link>
          ) : (
            <div className="text-xs text-gray-400 text-center py-2">{t.shop.outOfStock}</div>
          )}
          <Link
            href={href}
            className="block text-center text-xs font-medium mt-2 text-bark/50 hover:text-bark transition-colors"
          >
            {t.shop.more}
          </Link>
        </div>
      </div>
    </article>
  )
}
