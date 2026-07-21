import type { Metadata } from 'next'
import { buildAlternates } from '@/lib/seo'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { BuyNowButton } from '@/components/cart/BuyNowButton'
import { StructuredData } from '@/components/shared/StructuredData'
import { YouTubeFacade } from '@/components/shared/YouTubeFacade'
import { ProductGallery } from '@/components/shared/ProductGallery'
import { getApiaryProductBySlug } from '@/lib/supabase/queries'
import { extractYouTubeId } from '@/lib/youtube'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { manualDict } from '@/lib/i18n/sections/manual'
import { getManualTranslations, resolveManualField } from '@/lib/i18n/manual-translations'

interface Props {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  const { canonical, languages } = buildAlternates(locale, `/products/${slug}`)
  const t = manualDict(locale)
  const product = await getApiaryProductBySlug(slug).catch(() => null)

  if (!product) {
    return { title: t.detailNotFound }
  }

  const tr = locale === 'uk' ? null : (await getManualTranslations('apiary_product', [product.id], locale)).get(product.id)
  const name = resolveManualField(product.name, tr, 'name', locale)
  const shortDesc = resolveManualField(product.short_description ?? null, tr, 'short_description', locale)
  const desc = resolveManualField(product.description ?? null, tr, 'description', locale)
  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image')
  const ogImageUrl = primaryImg?.url ?? product.image_url ?? null
  const description = shortDesc || desc || `${name} — Дача TV`
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  return {
    title: name,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: name,
      description: shortDesc || desc || name,
      images: ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630 }] : [],
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
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmJiZjI0Ii8+PC9zdmc+'

export default async function ApiaryProductPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  const t = manualDict(locale)
  const product = await getApiaryProductBySlug(slug).catch(() => null)

  if (!product) notFound()
  const tr = locale === 'uk' ? null : (await getManualTranslations('apiary_product', [product.id], locale)).get(product.id)
  const name = resolveManualField(product.name, tr, 'name', locale)
  const shortDesc = resolveManualField(product.short_description ?? null, tr, 'short_description', locale)
  const fullDesc = resolveManualField(product.full_description ?? product.description ?? null, tr, 'description', locale)

  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image') ?? null
  const galleryImgs = media.filter((m) => m.media_type === 'image' && m !== primaryImg)
  const localVideo = media.find((m) => m.media_type === 'video') ?? null
  const ytItems = media.filter((m) => m.media_type === 'youtube')
  // Fall back to legacy columns when media table is empty
  const allImages = media.length > 0
    ? [
        ...(primaryImg ? [{ src: primaryImg.url, alt: primaryImg.alt ?? name }] : []),
        ...galleryImgs.map((m) => ({ src: m.url, alt: m.alt ?? name })),
      ]
    : [
        ...(product.image_url ? [{ src: product.image_url, alt: product.image_alt || name }] : []),
        ...(product.gallery_images || []).map((src) => ({ src, alt: name })),
      ]
  const videoUrl = localVideo?.url ?? product.video_url ?? null
  const youtubeId = ytItems[0] ? extractYouTubeId(ytItems[0].url) : extractYouTubeId(product.youtube_video_url)
  const extraYoutubeIds = ytItems.length > 1
    ? ytItems.slice(1).map((m) => extractYouTubeId(m.url)).filter(Boolean) as string[]
    : (product.youtube_video_urls ?? []).map(extractYouTubeId).filter(Boolean) as string[]

  const primaryImgForSchema = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image')
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.short_description || product.description || product.name,
    brand: { '@type': 'Brand', name: 'Дача TV' },
    offers: {
      '@type': 'Offer',
      ...(product.price_uah != null ? { priceCurrency: 'UAH', price: product.price_uah } : {}),
      availability: (product.status === 'available' || product.status === 'preorder')
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'Дача TV' },
    },
    image: primaryImgForSchema?.url ?? product.image_url ?? undefined,
  }

  return (
    <div className="bg-cream min-h-screen">
      <StructuredData data={productSchema} />

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav aria-label={t.detailBreadcrumbHome} className="text-sm text-bark/50">
          <Link href={localizedPath(locale, '/')} className="hover:text-honey-700">{t.detailBreadcrumbHome}</Link>
          <span className="mx-2">›</span>
          <Link href={localizedPath(locale, '/products')} className="hover:text-honey-700">{t.productsH1}</Link>
          <span className="mx-2">›</span>
          <span className="text-bark">{name}</span>
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
          >
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-forest-50 to-forest-100">
              <span className="text-forest-600 font-serif font-bold text-3xl text-center px-6">
                {name}
              </span>
            </div>
          </ProductGallery>

          {/* Info */}
          <div>
            {product.weight_g && (
              <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-2 block">
                {product.weight_g}г
              </span>
            )}

            <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
              {name}
            </h1>

            {shortDesc && (
              <p className="text-bark/70 text-lg leading-relaxed mb-6">
                {shortDesc}
              </p>
            )}

            {product.status !== 'available' && product.status !== 'preorder' && (
              <div className="bg-gray-100 text-gray-700 rounded-lg px-4 py-3 mb-4 text-sm font-medium">
                {t.detailOutOfStockNote}
              </div>
            )}

            {/* Packaging tags */}
            {product.packaging && product.packaging.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {product.packaging.map((pack) => (
                  <span
                    key={pack}
                    className="text-sm bg-honey-50 text-honey-700 border border-honey-200 px-3 py-1 rounded-full font-medium"
                  >
                    {pack}
                  </span>
                ))}
              </div>
            )}

            {/* Price */}
            {product.price_uah && (
              <div className="flex items-baseline gap-2 mb-6 py-3 border-t border-b border-honey-100">
                <span className="text-2xl font-bold text-bark">{product.price_uah} грн</span>
                <span className="text-sm text-bark/50">{t.detailPerUnit}</span>
              </div>
            )}

            {/* Full description (preferred) or regular description */}
            {fullDesc && (
              <p className="text-bark/70 leading-relaxed mb-6">
                {fullDesc}
              </p>
            )}

            {/* Composition */}
            {product.composition && (
              <div className="mb-5">
                <h2 className="font-semibold text-bark text-sm uppercase tracking-wide mb-1.5">{t.detailComposition}</h2>
                <p className="text-bark/70 text-sm leading-relaxed">{product.composition}</p>
              </div>
            )}

            {/* Usage */}
            {product.usage_notes && (
              <div className="mb-5">
                <h2 className="font-semibold text-bark text-sm uppercase tracking-wide mb-1.5">{t.detailUsage}</h2>
                <p className="text-bark/70 text-sm leading-relaxed">{product.usage_notes}</p>
              </div>
            )}

            {/* Storage */}
            {product.storage_info && (
              <div className="mb-8">
                <h2 className="font-semibold text-bark text-sm uppercase tracking-wide mb-1.5">{t.detailStorage}</h2>
                <p className="text-bark/70 text-sm leading-relaxed">{product.storage_info}</p>
              </div>
            )}

            {videoUrl && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-bark/50 uppercase tracking-widest mb-2">
                  {t.detailVideoAboutProduct}
                </p>
                <video src={videoUrl} controls className="w-full rounded-xl" />
              </div>
            )}

            {youtubeId && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-bark/50 uppercase tracking-widest mb-2">
                  {videoUrl ? t.detailAlsoOnYoutube : t.detailVideoAboutProduct}
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
                <div className="space-y-3">
                  <AddToCartButton
                    item={{
                      id: `apiary-${product.slug}`,
                      productType: 'apiary',
                      productSlug: product.slug,
                      name,
                      price: product.price_uah,
                      imageUrl: allImages[0]?.src ?? product.image_url ?? undefined,
                    }}
                  />
                  <BuyNowButton
                    item={{
                      id: `apiary-${product.slug}`,
                      productType: 'apiary',
                      productSlug: product.slug,
                      name,
                      price: product.price_uah,
                      imageUrl: allImages[0]?.src ?? product.image_url ?? undefined,
                    }}
                  />
                </div>
              ) : (
                <Link href={localizedPath(locale, '/contact')} className="inline-flex items-center justify-center w-full py-3 px-6 text-base font-semibold rounded-xl border border-honey-300 text-honey-700 hover:bg-honey-50 transition-colors">
                  {t.detailPriceOnRequest2}
                </Link>
              )
            ) : (
              <div className="bg-gray-100 text-gray-600 rounded-xl px-4 py-3 text-sm font-medium text-center">
                {t.detailOutOfStockNotify}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
