export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { buildAlternates } from '@/lib/seo'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { StructuredData } from '@/components/shared/StructuredData'
import { YouTubeFacade } from '@/components/shared/YouTubeFacade'
import { ProductGallery } from '@/components/shared/ProductGallery'
import { BeekeeperInquiryForm } from '@/components/forms/BeekeeperInquiryForm'
import { BeekeeperCard } from '@/components/beekeeper/BeekeeperCard'
import { getBeekeeperProductBySlug, getAllBeekeeperProducts } from '@/lib/supabase/queries'
import { extractYouTubeId } from '@/lib/youtube'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { manualDict, type ManualDict } from '@/lib/i18n/sections/manual'
import { getManualTranslations, resolveManualField } from '@/lib/i18n/manual-translations'

interface Props {
  params: Promise<{ slug: string }>
}

function typeLabel(t: ManualDict, type: string): string {
  switch (type) {
    case 'bee_packages': return t.beekeeperTypeBeePackages
    case 'bee_colonies': return t.beekeeperTypeBeeColonies
    case 'empty_hives': return t.beekeeperTypeEmptyHives
    case 'hives_with_bees': return t.beekeeperTypeHivesWithBees
    case 'apiary_supply': return t.beekeeperTypeApiarySupply
    default: return type
  }
}

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWE1YzM1Ii8+PC9zdmc+'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  const { canonical, languages } = buildAlternates(locale, `/beekeeper/${slug}`)
  const t = manualDict(locale)
  const product = await getBeekeeperProductBySlug(slug).catch(() => null)
  if (!product) return { title: t.detailNotFound }

  const tr = locale === 'uk' ? null : (await getManualTranslations('beekeeper_product', [product.id], locale)).get(product.id)
  const name = resolveManualField(product.name, tr, 'name', locale)
  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image')
  const ogImage = primaryImg?.url ?? product.image_url ?? null

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const description = resolveManualField(product.description ?? null, tr, 'description', locale)
    || `${name} — Дача TV`
  return {
    title: name,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title: name,
      description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description,
      images: ogImage ? [ogImage] : [],
    },
  }
}

export default async function BeekeeperProductPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  const t = manualDict(locale)

  const [product, allProducts] = await Promise.all([
    getBeekeeperProductBySlug(slug).catch(() => null),
    getAllBeekeeperProducts().catch(() => []),
  ])

  if (!product) notFound()
  const tr = locale === 'uk' ? null : (await getManualTranslations('beekeeper_product', [product.id], locale)).get(product.id)
  const name = resolveManualField(product.name, tr, 'name', locale)
  const description = resolveManualField(product.description ?? null, tr, 'description', locale)
  const fullDesc = resolveManualField(product.full_description ?? null, tr, 'seo_description', locale) || product.full_description

  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image') ?? null
  const galleryImgs = media.filter((m) => m.media_type === 'image' && m !== primaryImg)
  const localVideo = media.find((m) => m.media_type === 'video') ?? null
  const ytItems = media.filter((m) => m.media_type === 'youtube')

  const heroImageSrc = primaryImg?.url ?? product.image_url ?? null
  const heroImage = heroImageSrc?.startsWith('http') ? heroImageSrc : null
  const heroImageAlt = primaryImg?.alt ?? product.image_alt ?? name

  const allImages = heroImage
    ? [
        { src: heroImage, alt: heroImageAlt },
        ...galleryImgs.map((m) => ({ src: m.url, alt: m.alt ?? name })),
      ]
    : []

  const videoUrl = localVideo?.url ?? product.video_url ?? null
  const youtubeId = ytItems[0] ? extractYouTubeId(ytItems[0].url) : extractYouTubeId(product.youtube_video_url)
  const extraYoutubeIds = ytItems.length > 1
    ? ytItems.slice(1).map((m) => extractYouTubeId(m.url)).filter(Boolean) as string[]
    : (product.youtube_video_urls ?? []).map(extractYouTubeId).filter(Boolean) as string[]

  const related = allProducts
    .filter((p) => p.id !== product.id && (p.status === 'available' || p.status === 'preorder'))
    .slice(0, 3)

  const isUnavailable = product.status !== 'available' && product.status !== 'preorder'

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.name,
    brand: { '@type': 'Brand', name: 'Дача TV' },
    offers: {
      '@type': 'Offer',
      ...(product.price_uah ? { priceCurrency: 'UAH', price: product.price_uah } : {}),
      availability: isUnavailable
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'Дача TV' },
    },
    image: heroImage ?? undefined,
  }

  return (
    <div className="bg-cream min-h-screen">
      <StructuredData data={productSchema} />

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav aria-label={t.detailBreadcrumbHome} className="text-sm text-bark/50">
          <Link href={localizedPath(locale, '/')} className="hover:text-honey-700">{t.detailBreadcrumbHome}</Link>
          <span className="mx-2">›</span>
          <Link href={localizedPath(locale, '/beekeeper')} className="hover:text-honey-700">{t.beekeeperEyebrow}</Link>
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
            isUnavailable={isUnavailable}
            featuredLabel={product.is_featured ? t.catalogFeatured : undefined}
            featuredBadgeClass="bg-honey-600"
          >
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-forest-50 to-forest-200">
              <span className="text-forest-600 font-serif font-bold text-3xl text-center px-6">
                {name}
              </span>
            </div>
          </ProductGallery>

          {/* Info */}
          <div>
            {product.product_type && (
              <span className="text-xs font-semibold text-forest-700 uppercase tracking-widest mb-2 block">
                {typeLabel(t, product.product_type)}
              </span>
            )}

            <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
              {name}
            </h1>

            {description && (
              <p className="text-bark/70 text-lg leading-relaxed mb-4">
                {description}
              </p>
            )}

            {isUnavailable && (
              <div className="bg-gray-100 text-gray-700 rounded-lg px-4 py-3 mb-4 text-sm font-medium">
                {t.detailOutOfStockNote}
              </div>
            )}

            {product.season_note && (
              <p className="text-forest-700 text-sm font-medium mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {product.season_note}
              </p>
            )}

            {product.breeds && product.breeds.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-bark/50 uppercase tracking-widest mb-2">
                  {t.detailAvailableBreeds}
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.breeds.map((breed) => (
                    <span
                      key={breed}
                      className="text-sm bg-forest-50 text-forest-700 border border-forest-200 px-3 py-1 rounded-full font-medium"
                    >
                      {breed}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(product.price_uah != null || product.price_note) && (
              <div className="flex items-baseline gap-3 mb-6 py-3 border-t border-b border-forest-100">
                {product.price_uah != null && (
                  <span className="text-2xl font-bold text-bark">{product.price_uah} грн</span>
                )}
                {product.price_note && (
                  <span className="text-sm text-bark/60">{product.price_note}</span>
                )}
              </div>
            )}

            {fullDesc && (
              <div className="text-bark/70 leading-relaxed mb-6">
                <p>{fullDesc}</p>
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

            {/* Inquiry form */}
            <div id="inquiry-form" className="bg-forest-50 rounded-2xl p-6 border border-forest-200">
              <h2 className="font-serif text-2xl font-bold text-bark mb-1">
                {t.beekeeperFormTitle}
              </h2>
              <p className="text-bark/60 text-sm mb-5">
                {t.beekeeperFormBody}
              </p>
              <BeekeeperInquiryForm source={`/beekeeper/${slug}`} />
            </div>
          </div>
        </div>

        {/* Related products */}
        {related.length > 0 && (
          <div className="mt-16 pt-12 border-t border-forest-100">
            <h2 className="font-serif text-2xl font-bold text-bark mb-8">
              {t.detailAlsoInterested}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map((p) => (
                <BeekeeperCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
