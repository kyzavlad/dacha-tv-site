export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { HoneyCartWidget } from '@/components/cart/HoneyCartWidget'
import { HoneyCard } from '@/components/honey/HoneyCard'
import { StructuredData } from '@/components/shared/StructuredData'
import { YouTubeFacade } from '@/components/shared/YouTubeFacade'
import { ProductGallery } from '@/components/shared/ProductGallery'
import {
  getHoneyProductBySlug,
  getAllHoneyProducts,
} from '@/lib/supabase/queries'
import { honeyUnitPriceUah } from '@/lib/honey-pricing'
import { extractYouTubeId } from '@/lib/youtube'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { manualDict } from '@/lib/i18n/sections/manual'
import { getManualTranslations, resolveManualField } from '@/lib/i18n/manual-translations'
import { VARIETY_DETAILS } from '@/lib/honey/variety-details'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  const t = manualDict(locale)
  const product = await getHoneyProductBySlug(slug).catch(() => null)
  if (!product) return { title: t.detailNotFound }

  const tr = locale === 'uk' ? null : (await getManualTranslations('honey_product', [product.id], locale)).get(product.id)
  const name = resolveManualField(product.name, tr, 'name', locale)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary)
    ?? media.find((m) => m.media_type === 'image')
  const ogImageUrl = primaryImg?.url ?? product.image_url ?? null

  const description = resolveManualField(null, tr, 'seo_description', locale)
    || `Натуральний ${name.toLowerCase()} від сімейної пасіки на Харківщині.${product.packaging?.length ? ' ' + product.packaging.join(', ') + '.' : ''} Замовляйте напряму від пасічника без посередників.`
  return {
    title: name,
    description,
    alternates: { canonical: siteUrl ? `${siteUrl}/honey/${slug}` : `/honey/${slug}` },
    openGraph: {
      title: name,
      description,
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
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmJiZjI0Ii8+PC9zdmc+'

export default async function HoneyProductPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  const t = manualDict(locale)

  const [product, allProducts] = await Promise.all([
    getHoneyProductBySlug(slug).catch(() => null),
    getAllHoneyProducts().catch(() => []),
  ])

  if (!product) notFound()
  const tr = locale === 'uk' ? null : (await getManualTranslations('honey_product', [product.id], locale)).get(product.id)
  const name = resolveManualField(product.name, tr, 'name', locale)
  const shortDesc = resolveManualField(product.short_description ?? null, tr, 'short_description', locale)
  const fullDesc = resolveManualField(product.full_description ?? null, tr, 'description', locale)
  const details = VARIETY_DETAILS[product.variety]?.[locale]
  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image') ?? null
  const galleryImgs = media.filter((m) => m.media_type === 'image' && m !== primaryImg)
  const localVideo = media.find((m) => m.media_type === 'video') ?? null
  const ytItems = media.filter((m) => m.media_type === 'youtube')
  // Fall back to legacy columns when media table is empty (migration not yet applied)
  const heroImageSrc = primaryImg?.url ?? product.image_url ?? null
  const heroImageAlt = primaryImg?.alt ?? product.image_alt ?? `${name} — Дача TV`
  const heroImage = heroImageSrc?.startsWith('http') ? heroImageSrc : null
  const youtubeId = ytItems[0] ? extractYouTubeId(ytItems[0].url) : extractYouTubeId(product.youtube_video_link)
  const extraYoutubeIds = ytItems.length > 1
    ? ytItems.slice(1).map((m) => extractYouTubeId(m.url)).filter(Boolean) as string[]
    : (product.youtube_video_urls ?? []).map(extractYouTubeId).filter(Boolean) as string[]
  const videoUrl = localVideo?.url ?? product.video_url ?? null
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
    description: product.short_description || details?.taste || `Натуральний ${product.name} від пасіки на Харківщині`,
    brand: { '@type': 'Brand', name: 'Дача TV' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'UAH',
      price: honeyUnitPriceUah(product),
      availability: (product.status === 'available' || product.status === 'preorder')
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'Дача TV' },
    },
    image: primaryImg?.url ?? heroImage ?? product.image_url ?? undefined,
  }

  return (
    <div className="bg-cream min-h-screen">
      <StructuredData data={productSchema} />

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav aria-label={t.detailBreadcrumbHome} className="text-sm text-bark/50">
          <Link href={localizedPath(locale, '/')} className="hover:text-honey-700">{t.detailBreadcrumbHome}</Link>
          <span className="mx-2">›</span>
          <Link href={localizedPath(locale, '/honey')} className="hover:text-honey-700">{t.honeyH1}</Link>
          <span className="mx-2">›</span>
          <span className="text-bark">{name}</span>
        </nav>
      </div>

      {/* Product detail */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Gallery */}
          <ProductGallery
            images={allImages}
            blurDataURL={BLUR_DATA_URL}
            priority
            featuredLabel={product.is_featured ? t.detailMostPopular : undefined}
            featuredBadgeClass="bg-honey-600"
          >
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-honey-100 to-honey-300">
              <span className="text-honey-700 font-serif font-bold text-3xl text-center px-4">
                Дача TV
              </span>
            </div>
          </ProductGallery>

          {/* Info */}
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
              {name}
            </h1>

            {(shortDesc || details?.taste) && (
              <p className="text-bark/70 text-base leading-relaxed mb-4">
                {shortDesc || details?.taste}
              </p>
            )}

            {product.status !== 'available' && product.status !== 'preorder' && (
              <div className="bg-gray-100 text-gray-700 rounded-lg px-4 py-3 mb-4 text-sm font-medium">
                {t.detailOutOfStockNote}
              </div>
            )}

            {/* Packaging */}
            {product.packaging && product.packaging.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {product.packaging.map((pack) => (
                  <span key={pack} className="text-sm bg-honey-50 text-honey-700 border border-honey-200 px-3 py-1 rounded-full font-medium">
                    {pack}
                  </span>
                ))}
              </div>
            )}

            {/* Price block: canonical per-litre price from the shared source */}
            <div className="flex items-baseline gap-2 mb-6 py-3 border-t border-b border-honey-100">
              <span className="text-2xl font-bold text-bark">
                {honeyUnitPriceUah(product)} грн
              </span>
              <span className="text-sm text-bark/50">{t.detailPerLiter}</span>
            </div>

            {/* Details table */}
            <dl className="space-y-3 mb-6">
              {details?.season && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">{t.detailSeason}</dt>
                  <dd className="col-span-2 text-sm text-bark">{details.season}</dd>
                </div>
              )}
              {product.aroma_notes && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">{t.detailAroma}</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.aroma_notes}</dd>
                </div>
              )}
              {(product.taste_notes || details?.taste) && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">{t.detailTaste}</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.taste_notes || details?.taste}</dd>
                </div>
              )}
              {product.color_note && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">{t.detailColor}</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.color_note}</dd>
                </div>
              )}
              {(product.crystallization_note || details?.crystallisation) && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">{t.detailCrystallization}</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.crystallization_note || details?.crystallisation}</dd>
                </div>
              )}
              {details?.storage && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">{t.detailStorage}</dt>
                  <dd className="col-span-2 text-sm text-bark">{details.storage}</dd>
                </div>
              )}
              {(product.recommended_use || details?.uses) && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">{t.detailRecommended}</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.recommended_use || details?.uses}</dd>
                </div>
              )}
              {product.packaging_note && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">{t.detailPackaging}</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.packaging_note}</dd>
                </div>
              )}
            </dl>

            {fullDesc && (
              <div className="prose prose-sm text-bark/80 mb-6 leading-relaxed">
                <p>{fullDesc}</p>
              </div>
            )}

            {videoUrl && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-bark/50 uppercase tracking-widest mb-2">
                  {t.detailVideoAbout}
                </p>
                <video src={videoUrl} controls className="w-full rounded-xl" />
              </div>
            )}

            {youtubeId && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-bark/50 uppercase tracking-widest mb-2">
                  {videoUrl ? t.detailAlsoOnYoutube : t.detailVideoAbout}
                </p>
                <YouTubeFacade
                  videoId={youtubeId}
                  title={`${name} — Дача TV`}
                />
              </div>
            )}

            {extraYoutubeIds.map((vid, i) => (
              <div key={i} className="mb-4">
                <YouTubeFacade videoId={vid} title={`${name} — Дача TV (${i + 2})`} />
              </div>
            ))}

            {/* Cart / CTA section — single price, one "До кошика" button */}
            <HoneyCartWidget
              productSlug={product.slug}
              productName={name}
              price={honeyUnitPriceUah(product)}
              imageUrl={product.image_url}
              status={product.status}
            />

            {/* Packaging + shipping trust block. Calm, low-key, matches the
                honey/cream palette — no loud guarantees beyond the exact copy. */}
            <div className="mt-5 rounded-xl border border-honey-100 bg-honey-50/50 p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <svg className="w-4 h-4 mt-0.5 text-honey-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-sm text-bark/75 leading-relaxed">
                  {t.detailPackagingNote}
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <svg className="w-4 h-4 mt-0.5 text-honey-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-sm text-bark/75 leading-relaxed">
                  {t.detailShippingNote}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Related products */}
        {related.length > 0 && (
          <div className="mt-16">
            <h2 className="font-serif text-2xl font-bold text-bark mb-8">
              {t.detailAlsoInterested}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map((p) => (
                <HoneyCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
