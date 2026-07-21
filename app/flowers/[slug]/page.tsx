export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { buildAlternates } from '@/lib/seo'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FlowerInquiryForm } from '@/components/forms/FlowerInquiryForm'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { BuyNowButton } from '@/components/cart/BuyNowButton'
import { YouTubeFacade } from '@/components/shared/YouTubeFacade'
import { StructuredData } from '@/components/shared/StructuredData'
import { ProductGallery } from '@/components/shared/ProductGallery'
import { getFlowerProductBySlug, getAllFlowerProducts } from '@/lib/supabase/queries'
import { FlowerCard } from '@/components/flowers/FlowerCard'
import { extractYouTubeId } from '@/lib/youtube'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { manualDict } from '@/lib/i18n/sections/manual'
import { getManualTranslations, resolveManualField } from '@/lib/i18n/manual-translations'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  const { canonical, languages } = buildAlternates(locale, `/flowers/${slug}`)
  const t = manualDict(locale)
  const dbProduct = await getFlowerProductBySlug(slug).catch(() => null)
  if (!dbProduct) return { title: t.detailNotFound }
  const tr = locale === 'uk' ? null : (await getManualTranslations('flower_product', [dbProduct.id], locale)).get(dbProduct.id)
  const name = resolveManualField(dbProduct.name, tr, 'name', locale)
  const shortDesc = resolveManualField(dbProduct.short_description ?? null, tr, 'short_description', locale)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const media = dbProduct.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary)
    ?? media.find((m) => m.media_type === 'image')
  const ogImageUrl = primaryImg?.url ?? dbProduct.image_url ?? null
  const description = shortDesc || `${name}: ${t.detailChrysanthemum.toLowerCase()} — Дача TV`
  return {
    title: name,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: name,
      description: shortDesc || name,
      images: ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630, alt: name }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description,
      images: ogImageUrl ? [ogImageUrl] : [],
    },
  }
}

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PC9zdmc+'

export default async function FlowerProductPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  const t = manualDict(locale)

  const [product, allProducts] = await Promise.all([
    getFlowerProductBySlug(slug).catch(() => null),
    getAllFlowerProducts().catch(() => []),
  ])

  if (!product) notFound()
  const tr = locale === 'uk' ? null : (await getManualTranslations('flower_product', [product.id], locale)).get(product.id)
  const name = resolveManualField(product.name, tr, 'name', locale)
  const shortDesc = resolveManualField(product.short_description ?? null, tr, 'short_description', locale)
  const fullDesc = resolveManualField(product.full_description ?? null, tr, 'description', locale)

  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image') ?? null
  const galleryImgs = media.filter((m) => m.media_type === 'image' && m !== primaryImg)
  const localVideo = media.find((m) => m.media_type === 'video') ?? null
  const ytItems = media.filter((m) => m.media_type === 'youtube')
  const heroImageSrc = primaryImg?.url ?? product.image_url ?? null
  const heroImageAlt = primaryImg?.alt ?? product.image_alt ?? `${name} — Дача TV`
  const heroImage = heroImageSrc?.startsWith('http') ? heroImageSrc : null
  const videoUrl = localVideo?.url ?? product.video_url ?? null
  const youtubeId = ytItems[0] ? extractYouTubeId(ytItems[0].url) : extractYouTubeId(product.youtube_video_url)
  const extraYoutubeIds = ytItems.length > 1
    ? ytItems.slice(1).map((m) => extractYouTubeId(m.url)).filter(Boolean) as string[]
    : (product.youtube_video_urls ?? []).map(extractYouTubeId).filter(Boolean) as string[]
  const galleryImageSrcs = galleryImgs.length > 0
    ? galleryImgs.map((m) => ({ src: m.url, alt: m.alt ?? product.image_alt ?? product.name }))
    : (product.gallery_images ?? []).map((src) => ({ src, alt: product.image_alt ?? product.name }))
  const allImages = heroImage
    ? [{ src: heroImage, alt: heroImageAlt }, ...galleryImageSrcs]
    : galleryImageSrcs
  const related = allProducts
    .filter((p) => p.id !== product.id && (p.status === 'available' || p.status === 'preorder'))
    .slice(0, 3)

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.short_description || product.name,
    brand: { '@type': 'Brand', name: 'Дача TV' },
    offers: {
      '@type': 'Offer',
      ...(product.price_uah != null ? { priceCurrency: 'UAH', price: product.price_uah } : {}),
      availability: (product.status === 'available' || product.status === 'preorder')
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'Дача TV' },
    },
    image: primaryImg?.url ?? heroImage ?? product.image_url ?? undefined,
  }

  return (
    <div className="bg-white min-h-screen">
      <StructuredData data={productSchema} />

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav aria-label={t.detailBreadcrumbHome} className="text-sm text-gray-400">
          <Link href={localizedPath(locale, '/')} className="hover:text-gray-700 transition-colors">{t.detailBreadcrumbHome}</Link>
          <span className="mx-2">›</span>
          <Link href={localizedPath(locale, '/flowers')} className="hover:text-gray-700 transition-colors">{t.flowersBreadcrumbCurrent}</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-700">{name}</span>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Gallery */}
          <ProductGallery
            images={allImages}
            blurDataURL={BLUR_DATA_URL}
            priority
            isUnavailable={product.status !== 'available' && product.status !== 'preorder'}
            featuredLabel={product.is_featured ? t.catalogFeatured : undefined}
            featuredBadgeClass="bg-gray-900"
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
              <span className="text-6xl mb-3 select-none">🌸</span>
              <span className="text-gray-400 font-medium text-center px-6">{name}</span>
            </div>
          </ProductGallery>

          {/* Info */}
          <div>
            {product.variety && (
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                {product.category === 'chrysanthemum' ? t.detailChrysanthemum : product.category} · {product.variety}
              </p>
            )}

            <h1 className="font-serif text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {name}
            </h1>

            {shortDesc && (
              <p className="text-gray-600 text-lg leading-relaxed mb-5">
                {shortDesc}
              </p>
            )}

            {product.status !== 'available' && product.status !== 'preorder' && (
              <div className="bg-gray-100 text-gray-600 rounded-xl px-4 py-3 mb-5 text-sm">
                {t.detailFlowerOutOfStock}
              </div>
            )}

            {/* Details */}
            <dl className="space-y-3 mb-6 border-t border-gray-100 pt-5">
              {product.color && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-gray-400">{t.detailColorLabel}</dt>
                  <dd className="col-span-2 text-sm text-gray-800">{product.color}</dd>
                </div>
              )}
              {product.bloom_season && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-gray-400">{t.detailBlooming}</dt>
                  <dd className="col-span-2 text-sm text-gray-800">{product.bloom_season}</dd>
                </div>
              )}
              {product.height_cm && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-gray-400">{t.detailHeight}</dt>
                  <dd className="col-span-2 text-sm text-gray-800">{t.detailUpTo} {product.height_cm} см</dd>
                </div>
              )}
              {product.lighting && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-gray-400">{t.detailLighting}</dt>
                  <dd className="col-span-2 text-sm text-gray-800">{product.lighting}</dd>
                </div>
              )}
              {product.packaging_note && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-gray-400">{t.detailPackaging}</dt>
                  <dd className="col-span-2 text-sm text-gray-800">{product.packaging_note}</dd>
                </div>
              )}
            </dl>

            {product.price_uah && (
              <div className="flex items-baseline gap-2 mb-6 py-3 border-t border-b border-gray-100">
                <span className="text-2xl font-bold text-gray-900">{t.catalogFrom} {product.price_uah} грн</span>
              </div>
            )}

            {fullDesc && (
              <p className="text-gray-600 leading-relaxed mb-6">
                {fullDesc}
              </p>
            )}

            {videoUrl && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                  {t.detailVideoAboutFlower}
                </p>
                <video src={videoUrl} controls className="w-full rounded-xl" />
              </div>
            )}

            {youtubeId && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                  {videoUrl ? t.detailAlsoOnYoutube : t.detailVideoAboutFlower}
                </p>
                <YouTubeFacade videoId={youtubeId} title={`${name} — Дача TV`} />
              </div>
            )}

            {extraYoutubeIds.map((vid, i) => (
              <div key={i} className="mb-4">
                <YouTubeFacade videoId={vid} title={`${name} — Дача TV (${i + 2})`} />
              </div>
            ))}

            {/* Cart / CTA section */}
            {product.status === 'available' || product.status === 'preorder' ? (
              product.price_uah && product.price_uah > 0 ? (
                <div id="order-form" className="space-y-3 mt-4">
                  <AddToCartButton
                    item={{
                      id: `flower-${product.slug}`,
                      productType: 'flower',
                      productSlug: product.slug,
                      name,
                      price: product.price_uah,
                      imageUrl: allImages[0]?.src ?? product.image_url ?? undefined,
                    }}
                  />
                  <BuyNowButton
                    item={{
                      id: `flower-${product.slug}`,
                      productType: 'flower',
                      productSlug: product.slug,
                      name,
                      price: product.price_uah,
                      imageUrl: allImages[0]?.src ?? product.image_url ?? undefined,
                    }}
                  />
                </div>
              ) : (
                <div id="order-form" className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                  <h2 className="font-serif text-xl font-bold text-gray-900 mb-1">{t.detailOrderTitle2}</h2>
                  <p className="text-gray-500 text-sm mb-5">{t.detailOrderFlowerBody}</p>
                  <FlowerInquiryForm preselectedProduct={name} source={`/flowers/${slug}`} />
                </div>
              )
            ) : (
              <div className="bg-gray-100 text-gray-600 rounded-xl px-4 py-3 text-sm font-medium">
                {t.detailOutOfStockShort}
              </div>
            )}
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-16 pt-12 border-t border-gray-100">
            <h2 className="font-serif text-2xl font-bold text-gray-900 mb-8">
              {t.detailOtherVarieties}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map((p) => (
                <FlowerCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
