export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  getPublishedProductBySlug,
  getPublishedProductBySlugOnly,
  getCategoryBySlug,
  getRelatedCatalogProducts,
  getCatalogProductImages,
  getCatalogProductImage,
  displayProductName,
  hasDisplayablePrice,
  canAddToCart,
  formatCatalogPrice,
  categoryDisplayName,
} from '@/lib/supabase/catalog'
import { buildSocialMetadata, stripBrand } from '@/lib/seo'
import { breadcrumbSchema } from '@/lib/schema'
import { Breadcrumb } from '@/components/catalog/Breadcrumb'
import { StructuredData } from '@/components/shared/StructuredData'
import { SafeImage } from '@/components/shared/SafeImage'
import { CatalogProductCard } from '@/components/catalog/CatalogProductCard'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { BuyNowButton } from '@/components/cart/BuyNowButton'
import { ProductOptions } from '@/components/catalog/ProductOptions'
import { ManualLeadForm } from '@/components/catalog/ManualLeadForm'
import type { ManualLeadType } from '@/types'

interface Props {
  params: Promise<{ category: string; product: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, product: productSlug } = await params
  const product = await getPublishedProductBySlug(category, productSlug).catch(() => null)
  if (!product) return { title: 'Товар не знайдено' }

  const bareTitle = stripBrand(product.meta_title) || displayProductName(product)
  const priceStr = formatCatalogPrice(product)
  const priceLine = priceStr ? ` Ціна ${priceStr}.` : ''
  const description = product.meta_description || product.short_description || `Купити ${displayProductName(product)} з доставкою по Україні.${priceLine}`

  return buildSocialMetadata({
    bareTitle,
    description,
    canonical: `/catalog/${category}/${productSlug}`,
    image: getCatalogProductImage(product),
    imageAlt: displayProductName(product),
  })
}

export default async function ProductPage({ params }: Props) {
  const { category: categorySlug, product: productSlug } = await params

  const [cat, productByCat] = await Promise.all([
    getCategoryBySlug(categorySlug).catch(() => null),
    getPublishedProductBySlug(categorySlug, productSlug).catch(() => null),
  ])

  // Fall back to slug-only lookup (e.g. reached via /catalog/all where the
  // category segment may not match the product's stored category_slug).
  const product = productByCat ?? (await getPublishedProductBySlugOnly(productSlug).catch(() => null))

  if (!product) notFound()

  // Related products from the same category (cheap, single query). Use the
  // product's own stored category_slug so /catalog/all entries still get a rail.
  const related = await getRelatedCatalogProducts(
    product.category_slug ?? categorySlug,
    product.slug,
    4,
  ).catch(() => [])

  // Resolve images from every known field (main_image_url may be null while the
  // URL lives in images[]/raw_data), normalized + deduped, primary first.
  const images: string[] = getCatalogProductImages(product)

  const priceOk = hasDisplayablePrice(product)
  const buyable = canAddToCart(product)
  const priceLabel = formatCatalogPrice(product)
  const hasDiscount =
    priceOk && product.compare_price_uah != null && product.price_uah != null && product.compare_price_uah > product.price_uah

  // JSON-LD structured data: only advertise an offer when the price is valid.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: displayProductName(product),
    description: product.short_description ?? product.description ?? undefined,
    image: images[0] ?? undefined,
    ...(priceOk
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: 'UAH',
            price: product.price_uah,
            availability: 'https://schema.org/InStock',
            url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.dachatv.com'}/catalog/${categorySlug}/${productSlug}`,
          },
        }
      : {}),
  }

  const productTitle = displayProductName(product)
  const crumbs = [
    { label: 'Головна', href: '/' },
    { label: 'Каталог', href: '/catalog' },
    { label: cat ? categoryDisplayName(cat.name_ua) : 'Категорія', href: `/catalog/${categorySlug}` },
    { label: productTitle },
  ]

  return (
    <div className="bg-cream min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StructuredData data={breadcrumbSchema(crumbs)} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <Breadcrumb crumbs={crumbs} />

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
          {/* Image */}
          <div>
            <div className="relative aspect-square bg-white rounded-2xl overflow-hidden shadow-sm border border-honey-100">
              <SafeImage
                src={images[0] ?? null}
                alt={displayProductName(product)}
                className="absolute inset-0 h-full w-full object-contain p-4"
                fallback={
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-honey-50 to-forest-50 gap-3">
                    <span className="text-5xl opacity-30">📦</span>
                    <span className="text-forest-700 font-serif font-semibold text-base text-center px-8 leading-snug opacity-60">
                      {displayProductName(product)}
                    </span>
                  </div>
                }
              />
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {images.slice(1, 6).map((url, i) => (
                  <div key={url} className="relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-white border border-honey-100">
                    <SafeImage
                      src={url}
                      alt={`${displayProductName(product)} фото ${i + 2}`}
                      className="absolute inset-0 h-full w-full object-contain p-1"
                      fallback={<div className="absolute inset-0 flex items-center justify-center text-lg opacity-30">📦</div>}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col">
            {product.is_featured && (
              <span className="inline-block text-xs font-semibold bg-honey-100 text-honey-700 px-2.5 py-1 rounded-full mb-3 w-fit">
                Хіт продажів
              </span>
            )}

            <h1 className="font-serif text-2xl md:text-3xl font-bold text-bark mb-4 leading-tight">
              {displayProductName(product)}
            </h1>

            <div className="flex items-baseline gap-3 mb-6">
              {priceLabel ? (
                <>
                  <span className="text-3xl font-bold text-bark">{priceLabel}</span>
                  {hasDiscount && (
                    <span className="text-lg text-gray-400 line-through">
                      {product.compare_price_uah!.toLocaleString('uk-UA')} грн
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xl font-semibold text-honey-700">Ціна за запитом</span>
              )}
            </div>

            {product.short_description && (
              <p className="text-gray-600 text-base leading-relaxed mb-6">
                {product.short_description}
              </p>
            )}

            {/* CTA */}
            <div className="space-y-3 mb-6">
              {buyable ? (
                <>
                  <AddToCartButton
                    item={{
                      id: `catalog-${product.slug}`,
                      productType: 'catalog',
                      productSlug: product.slug,
                      name: displayProductName(product),
                      price: product.price_uah as number,
                      imageUrl: images[0] ?? undefined,
                    }}
                  />
                  <BuyNowButton
                    item={{
                      id: `catalog-${product.slug}`,
                      productType: 'catalog',
                      productSlug: product.slug,
                      name: displayProductName(product),
                      price: product.price_uah as number,
                      imageUrl: images[0] ?? undefined,
                    }}
                  />
                </>
              ) : product.status === 'published' ? (
                // Inquiry / no-price product. Show inline lead form when we have
                // a lead_type or the product is explicitly inquiry_only; otherwise
                // fall back to the contact page.
                (product.lead_type || product.inquiry_only) ? (
                  <ManualLeadForm
                    productName={displayProductName(product)}
                    productSlug={product.slug}
                    leadType={(product.lead_type as ManualLeadType) ?? 'natural_products'}
                    category={categorySlug}
                    options={product.options}
                    source={`/catalog/${categorySlug}/${productSlug}`}
                  />
                ) : (
                  <a href="/contact" className="inline-flex items-center justify-center w-full py-3 px-6 text-base font-semibold rounded-xl border border-honey-300 text-honey-700 hover:bg-honey-50 transition-colors">
                    Уточнити ціну
                  </a>
                )
              ) : (
                <div className="bg-gray-100 text-gray-600 rounded-xl px-4 py-3 text-sm font-medium text-center">
                  Немає в наявності
                </div>
              )}
            </div>

            {/* Metal products: always surface the direct order phone + delivery
                terms, regardless of buyable/inquiry state. */}
            {product.lead_type === 'metal' && (
              <div className="rounded-xl border border-honey-200 bg-honey-50/60 p-4 mb-6 text-sm">
                <div className="font-semibold text-bark mb-1">Замовлення та консультація</div>
                <a href="tel:+380996480485" className="text-honey-700 font-bold text-lg hover:underline">
                  +380 99 648 04 85
                </a>
                <p className="text-bark/70 mt-2 text-xs leading-relaxed">
                  Доставка по Харківській та Полтавській областях — за домовленістю.
                  Інші регіони — індивідуально після підтвердження.
                  Самовивіз і наявність — за підтвердженням.
                </p>
              </div>
            )}

            <ProductOptions options={product.options} />

            {/* Generic "Доставка по Україні" is hidden for metal — metal has its own
                regional delivery terms above and is not shipped nationwide. */}
            {product.lead_type !== 'metal' && (
              <div className="flex items-center gap-2 text-sm text-green-700 mb-6">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                Доставка по Україні
              </div>
            )}

            {/* Delivery / payment / guarantee trust block. Static, no client JS —
                reassures the buyer before they commit (EVA/MAKEUP-style). */}
            {product.lead_type !== 'metal' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <div className="rounded-xl border border-honey-100 bg-honey-50/50 p-3">
                  <div className="text-lg" aria-hidden="true">🚚</div>
                  <div className="text-xs font-semibold text-bark mt-1">Доставка по Україні</div>
                  <p className="text-[11px] text-bark/60 leading-snug mt-0.5">Нова Пошта та інші служби</p>
                </div>
                <div className="rounded-xl border border-honey-100 bg-honey-50/50 p-3">
                  <div className="text-lg" aria-hidden="true">💳</div>
                  <div className="text-xs font-semibold text-bark mt-1">Зручна оплата</div>
                  <p className="text-[11px] text-bark/60 leading-snug mt-0.5">Після підтвердження замовлення</p>
                </div>
                <div className="rounded-xl border border-honey-100 bg-honey-50/50 p-3">
                  <div className="text-lg" aria-hidden="true">✅</div>
                  <div className="text-xs font-semibold text-bark mt-1">Підтвердження</div>
                  <p className="text-[11px] text-bark/60 leading-snug mt-0.5">Менеджер зв&apos;яжеться з вами</p>
                </div>
              </div>
            )}

            {product.description && (
              <div className="border-t border-gray-100 pt-6">
                <h2 className="font-semibold text-bark mb-3 text-sm uppercase tracking-wide">Опис</h2>
                <div className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                  {product.description}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Related / similar products from the same category */}
        {related.length > 0 && (
          <section className="mt-16 border-t border-gray-100 pt-10">
            <h2 className="font-serif text-2xl font-bold text-bark mb-6">Схожі товари</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {related.map((p) => (
                <CatalogProductCard
                  key={p.id}
                  product={p}
                  categorySlug={p.category_slug ?? categorySlug}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
