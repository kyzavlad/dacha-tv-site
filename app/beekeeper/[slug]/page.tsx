export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { StructuredData } from '@/components/shared/StructuredData'
import { YouTubeFacade } from '@/components/shared/YouTubeFacade'
import { ProductGallery } from '@/components/shared/ProductGallery'
import { BeekeeperInquiryForm } from '@/components/forms/BeekeeperInquiryForm'
import { BeekeeperCard } from '@/components/beekeeper/BeekeeperCard'
import { getBeekeeperProductBySlug, getAllBeekeeperProducts } from '@/lib/supabase/queries'
import { extractYouTubeId } from '@/lib/youtube'

interface Props {
  params: Promise<{ slug: string }>
}

const TYPE_LABELS: Record<string, string> = {
  bee_packages: 'Бджолопакети',
  bee_colonies: "Бджолосім'ї",
  empty_hives: 'Порожні вулики',
  hives_with_bees: 'Вулики з бджолами',
  apiary_supply: 'Товари пасічника',
}

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWE1YzM1Ii8+PC9zdmc+'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const product = await getBeekeeperProductBySlug(slug).catch(() => null)
  if (!product) return { title: 'Продукт не знайдено' }

  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image')
  const ogImage = primaryImg?.url ?? product.image_url ?? null

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const description = product.description || `${product.name} від пасіки Дача TV на Харківщині. Пряма комунікація з пасічником — без посередників.`
  return {
    title: product.name,
    description,
    alternates: { canonical: siteUrl ? `${siteUrl}/beekeeper/${slug}` : `/beekeeper/${slug}` },
    openGraph: {
      title: `${product.name} | Дача TV`,
      description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | Дача TV`,
      description,
      images: ogImage ? [ogImage] : [],
    },
  }
}

export default async function BeekeeperProductPage({ params }: Props) {
  const { slug } = await params

  const [product, allProducts] = await Promise.all([
    getBeekeeperProductBySlug(slug).catch(() => null),
    getAllBeekeeperProducts().catch(() => []),
  ])

  if (!product) notFound()

  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image') ?? null
  const galleryImgs = media.filter((m) => m.media_type === 'image' && m !== primaryImg)
  const localVideo = media.find((m) => m.media_type === 'video') ?? null
  const ytItems = media.filter((m) => m.media_type === 'youtube')

  const heroImageSrc = primaryImg?.url ?? product.image_url ?? null
  const heroImage = heroImageSrc?.startsWith('http') ? heroImageSrc : null
  const heroImageAlt = primaryImg?.alt ?? product.image_alt ?? product.name

  const allImages = heroImage
    ? [
        { src: heroImage, alt: heroImageAlt },
        ...galleryImgs.map((m) => ({ src: m.url, alt: m.alt ?? product.name })),
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
        <nav aria-label="Навігація" className="text-sm text-bark/50">
          <Link href="/" className="hover:text-honey-700">Головна</Link>
          <span className="mx-2">›</span>
          <Link href="/beekeeper" className="hover:text-honey-700">Для пасічників</Link>
          <span className="mx-2">›</span>
          <span className="text-bark">{product.name}</span>
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
            featuredLabel={product.is_featured ? 'Популярне' : undefined}
            featuredBadgeClass="bg-honey-600"
          >
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-forest-50 to-forest-200">
              <span className="text-forest-600 font-serif font-bold text-3xl text-center px-6">
                {product.name}
              </span>
            </div>
          </ProductGallery>

          {/* Info */}
          <div>
            {product.product_type && (
              <span className="text-xs font-semibold text-forest-700 uppercase tracking-widest mb-2 block">
                {TYPE_LABELS[product.product_type] ?? product.product_type}
              </span>
            )}

            <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
              {product.name}
            </h1>

            {product.description && (
              <p className="text-bark/70 text-lg leading-relaxed mb-4">
                {product.description}
              </p>
            )}

            {isUnavailable && (
              <div className="bg-gray-100 text-gray-700 rounded-lg px-4 py-3 mb-4 text-sm font-medium">
                Наразі немає в наявності. Залиште заявку — ми повідомимо, коли з&apos;явиться.
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
                  Доступні породи
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

            {product.full_description && (
              <div className="text-bark/70 leading-relaxed mb-6">
                <p>{product.full_description}</p>
              </div>
            )}

            {videoUrl && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-bark/50 uppercase tracking-widest mb-2">
                  Відео про цей продукт
                </p>
                <video src={videoUrl} controls className="w-full rounded-xl" />
              </div>
            )}

            {youtubeId && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-bark/50 uppercase tracking-widest mb-2">
                  {videoUrl ? 'Також на YouTube' : 'Відео про цей продукт'}
                </p>
                <YouTubeFacade videoId={youtubeId} title={`Відео: ${product.name}`} />
              </div>
            )}

            {extraYoutubeIds.map((vid, i) => (
              <div key={i} className="mb-4">
                <YouTubeFacade videoId={vid} title={`Відео ${i + 2}: ${product.name}`} />
              </div>
            ))}

            {/* Inquiry form */}
            <div id="inquiry-form" className="bg-forest-50 rounded-2xl p-6 border border-forest-200">
              <h2 className="font-serif text-2xl font-bold text-bark mb-1">
                Залишити заявку
              </h2>
              <p className="text-bark/60 text-sm mb-5">
                Щоб дізнатись наявність та вартість — залиште заявку або зателефонуйте
              </p>
              <BeekeeperInquiryForm source={`/beekeeper/${slug}`} />
            </div>
          </div>
        </div>

        {/* Related products */}
        {related.length > 0 && (
          <div className="mt-16 pt-12 border-t border-forest-100">
            <h2 className="font-serif text-2xl font-bold text-bark mb-8">
              Також може зацікавити
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
