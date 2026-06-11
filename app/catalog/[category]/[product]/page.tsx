export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import type { Metadata } from 'next'
import {
  getPublishedProductBySlug,
  getPublishedProductBySlugOnly,
  getCategoryBySlug,
  hasDisplayablePrice,
  canAddToCart,
  formatCatalogPrice,
} from '@/lib/supabase/catalog'
import { buildSocialMetadata, stripBrand } from '@/lib/seo'
import { Breadcrumb } from '@/components/catalog/Breadcrumb'
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

  const bareTitle = stripBrand(product.meta_title) || product.name_ua
  const priceStr = formatCatalogPrice(product)
  const priceLine = priceStr ? ` Ціна ${priceStr}.` : ''
  const description = product.meta_description || product.short_description || `Купити ${product.name_ua} з доставкою по Україні.${priceLine}`

  return buildSocialMetadata({
    bareTitle,
    description,
    canonical: `/catalog/${category}/${productSlug}`,
    image: product.main_image_url,
    imageAlt: product.name_ua,
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

  const images: string[] = [
    ...(product.main_image_url ? [product.main_image_url] : []),
    ...((product.images as string[] | null ?? []).filter((u) => u !== product.main_image_url)),
  ]

  const priceOk = hasDisplayablePrice(product)
  const buyable = canAddToCart(product)
  const priceLabel = formatCatalogPrice(product)
  const hasDiscount =
    priceOk && product.compare_price_uah != null && product.price_uah != null && product.compare_price_uah > product.price_uah

  // JSON-LD structured data — only advertise an offer when the price is valid.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name_ua,
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

  return (
    <div className="bg-cream min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <Breadcrumb crumbs={[
          { label: 'Головна', href: '/' },
          { label: 'Каталог', href: '/catalog' },
          { label: cat?.name_ua ?? categorySlug, href: `/catalog/${categorySlug}` },
          { label: product.name_ua },
        ]} />

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
          {/* Image */}
          <div>
            <div className="relative aspect-square bg-white rounded-2xl overflow-hidden shadow-sm border border-honey-100">
              {images[0] ? (
                <Image
                  src={images[0]}
                  alt={product.name_ua}
                  fill
                  className="object-contain p-4"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-honey-50 to-forest-50 gap-3">
                  <span className="text-5xl opacity-30">📦</span>
                  <span className="text-forest-700 font-serif font-semibold text-base text-center px-8 leading-snug opacity-60">
                    {product.name_ua}
                  </span>
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {images.slice(1, 6).map((url, i) => (
                  <div key={url} className="relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-white border border-honey-100">
                    <Image src={url} alt={`${product.name_ua} фото ${i + 2}`} fill className="object-contain p-1" />
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
              {product.name_ua}
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
                      name: product.name_ua,
                      price: product.price_uah as number,
                      imageUrl: product.main_image_url ?? undefined,
                    }}
                  />
                  <BuyNowButton
                    item={{
                      id: `catalog-${product.slug}`,
                      productType: 'catalog',
                      productSlug: product.slug,
                      name: product.name_ua,
                      price: product.price_uah as number,
                      imageUrl: product.main_image_url ?? undefined,
                    }}
                  />
                </>
              ) : product.status === 'published' ? (
                // Inquiry / no-price product. Manual products with a lead_type get
                // an inline lead form routed to the right Telegram thread; others
                // fall back to the contact page.
                product.lead_type ? (
                  <ManualLeadForm
                    productName={product.name_ua}
                    productSlug={product.slug}
                    leadType={product.lead_type as ManualLeadType}
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
                </p>
              </div>
            )}

            <ProductOptions options={product.options} />

            <div className="flex items-center gap-2 text-sm text-green-700 mb-6">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              Доставка по Україні
            </div>

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
      </div>
    </div>
  )
}
