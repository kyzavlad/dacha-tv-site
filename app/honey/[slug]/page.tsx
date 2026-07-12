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

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const product = await getHoneyProductBySlug(slug).catch(() => null)
  if (!product) return { title: 'Продукт не знайдено' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary)
    ?? media.find((m) => m.media_type === 'image')
  const ogImageUrl = primaryImg?.url ?? product.image_url ?? null

  const description = `Натуральний ${product.name.toLowerCase()} від сімейної пасіки на Харківщині.${product.packaging?.length ? ' ' + product.packaging.join(', ') + '.' : ''} Замовляйте напряму від пасічника без посередників.`
  return {
    title: product.name,
    description,
    alternates: { canonical: siteUrl ? `${siteUrl}/honey/${slug}` : `/honey/${slug}` },
    openGraph: {
      title: `${product.name}`,
      description: `Натуральний ${product.name.toLowerCase()} від пасіки Дача TV на Харківщині`,
      images: ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630, alt: product.name }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name}`,
      description,
      images: ogImageUrl ? [ogImageUrl] : [],
    },
  }
}

const VARIETY_DETAILS: Record<string, {
  season: string
  taste: string
  crystallisation: string
  storage: string
  uses: string
}> = {
  Акація: {
    season: 'Кінець травня: початок червня',
    taste: 'Ніжний, квітковий, злегка вершковий. Один з найсвітліших сортів.',
    crystallisation: 'Кристалізується дуже повільно: іноді залишається рідким до року і більше.',
    storage: 'Зберігати в прохолодному темному місці. Не ставити в холодильник: зайва вологість.',
    uses: 'Щоденне вживання, чай, дитяче харчування, подарунки. Ідеальний для тих, хто не любить дуже насиченого смаку.',
  },
  Липа: {
    season: 'Липень',
    taste: 'Насичений, квітковий аромат з легкою гірчинкою. Традиційно вважається найбільш корисним.',
    crystallisation: 'Кристалізується за 2–3 місяці після відкачки. Кристали середнього розміру.',
    storage: 'Зберігати в прохолодному темному місці при температурі до +20°C.',
    uses: 'Підтримка імунітету, чай при застуді, щоденне вживання. Класичний вибір.',
  },
  Сонях: {
    season: 'Серпень: початок вересня',
    taste: 'Насичений, жирний, з характерним смаком соняшника. Дуже ситний.',
    crystallisation: 'Кристалізується дуже швидко: вже через 2–4 тижні після відкачки. Кристали дрібні та тверді.',
    storage: 'Зберігати при кімнатній температурі. Після кристалізації можна злегка підігріти на водяній бані.',
    uses: 'Намазати на хліб, додати в кашу. Ідеально підходить для тривалого зберігання.',
  },
  "Різнотрав'я": {
    season: 'Червень: серпень',
    taste: 'Складний, багатошаровий смак від різноманіття польових квітів. Кожна партія трохи відрізняється.',
    crystallisation: 'Кристалізується за 1–3 місяці. Залежить від складу нектару.',
    storage: 'Зберігати в прохолодному темному місці.',
    uses: 'Універсальний. Щоденне вживання, випічка, чай.',
  },
  Сади: {
    season: 'Квітень: травень',
    taste: "Ніжний, квітковий, з легким яблуневим або грушевим нотками залежно від садів.",
    crystallisation: "Кристалізується за 2–3 місяці. Кристали м'які та дрібні.",
    storage: 'Зберігати в прохолодному темному місці.',
    uses: 'Ідеально в чай, з сиром, як добавка до десертів.',
  },
  Ліс: {
    season: 'Червень: серпень',
    taste: "Темний, комплексний, з мінеральними та деревними нотками. Яскраво виражений характер.",
    crystallisation: 'Кристалізується повільно. Може зберігатися рідким тривалий час.',
    storage: 'Зберігати в прохолодному темному місці.',
    uses: "Для цінителів: самостійно або в блюдах з м'ясом та сирами.",
  },
}

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmJiZjI0Ii8+PC9zdmc+'

export default async function HoneyProductPage({ params }: Props) {
  const { slug } = await params

  const [product, allProducts] = await Promise.all([
    getHoneyProductBySlug(slug).catch(() => null),
    getAllHoneyProducts().catch(() => []),
  ])

  if (!product) notFound()
  const details = VARIETY_DETAILS[product.variety]
  const media = product.media ?? []
  const primaryImg = media.find((m) => m.media_type === 'image' && m.is_primary) ?? media.find((m) => m.media_type === 'image') ?? null
  const galleryImgs = media.filter((m) => m.media_type === 'image' && m !== primaryImg)
  const localVideo = media.find((m) => m.media_type === 'video') ?? null
  const ytItems = media.filter((m) => m.media_type === 'youtube')
  // Fall back to legacy columns when media table is empty (migration not yet applied)
  const heroImageSrc = primaryImg?.url ?? product.image_url ?? null
  const heroImageAlt = primaryImg?.alt ?? product.image_alt ?? `${product.name} від пасіки Дача TV`
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
        <nav aria-label="Навігація" className="text-sm text-bark/50">
          <Link href="/" className="hover:text-honey-700">Головна</Link>
          <span className="mx-2">›</span>
          <Link href="/honey" className="hover:text-honey-700">Мед</Link>
          <span className="mx-2">›</span>
          <span className="text-bark">{product.name}</span>
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
            featuredLabel={product.is_featured ? 'Найпопулярніший' : undefined}
            featuredBadgeClass="bg-honey-600"
          >
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-honey-100 to-honey-300">
              <span className="text-honey-700 font-serif font-bold text-3xl text-center px-4">
                Мед Дача TV
              </span>
            </div>
          </ProductGallery>

          {/* Info */}
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
              {product.name}
            </h1>

            {(product.short_description || details?.taste) && (
              <p className="text-bark/70 text-base leading-relaxed mb-4">
                {product.short_description || details?.taste}
              </p>
            )}

            {product.status !== 'available' && product.status !== 'preorder' && (
              <div className="bg-gray-100 text-gray-700 rounded-lg px-4 py-3 mb-4 text-sm font-medium">
                Наразі немає в наявності. Залиште заявку: ми повідомимо, коли з&apos;явиться.
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
              <span className="text-sm text-bark/50">за 1 л</span>
            </div>

            {/* Details table */}
            <dl className="space-y-3 mb-6">
              {details?.season && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">Сезон</dt>
                  <dd className="col-span-2 text-sm text-bark">{details.season}</dd>
                </div>
              )}
              {product.aroma_notes && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">Аромат</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.aroma_notes}</dd>
                </div>
              )}
              {(product.taste_notes || details?.taste) && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">Смак</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.taste_notes || details?.taste}</dd>
                </div>
              )}
              {product.color_note && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">Колір</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.color_note}</dd>
                </div>
              )}
              {(product.crystallization_note || details?.crystallisation) && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">Кристалізація</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.crystallization_note || details?.crystallisation}</dd>
                </div>
              )}
              {details?.storage && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">Зберігання</dt>
                  <dd className="col-span-2 text-sm text-bark">{details.storage}</dd>
                </div>
              )}
              {(product.recommended_use || details?.uses) && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">Рекомендовано</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.recommended_use || details?.uses}</dd>
                </div>
              )}
              {product.packaging_note && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-bark/60">Упаковка</dt>
                  <dd className="col-span-2 text-sm text-bark">{product.packaging_note}</dd>
                </div>
              )}
            </dl>

            {product.full_description && (
              <div className="prose prose-sm text-bark/80 mb-6 leading-relaxed">
                <p>{product.full_description}</p>
              </div>
            )}

            {videoUrl && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-bark/50 uppercase tracking-widest mb-2">
                  Відео про цей мед
                </p>
                <video src={videoUrl} controls className="w-full rounded-xl" />
              </div>
            )}

            {youtubeId && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-bark/50 uppercase tracking-widest mb-2">
                  {videoUrl ? 'Також на YouTube' : 'Відео про цей мед'}
                </p>
                <YouTubeFacade
                  videoId={youtubeId}
                  title={`Дивіться відео про ${product.name}`}
                />
              </div>
            )}

            {extraYoutubeIds.map((vid, i) => (
              <div key={i} className="mb-4">
                <YouTubeFacade videoId={vid} title={`Відео ${i + 2} про ${product.name}`} />
              </div>
            ))}

            {/* Cart / CTA section — single price, one "До кошика" button */}
            <HoneyCartWidget
              productSlug={product.slug}
              productName={product.name}
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
                  Доступна упаковка: пластикове відро, скляна банка або подарункова упаковка за домовленістю.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <svg className="w-4 h-4 mt-0.5 text-honey-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-sm text-bark/75 leading-relaxed">
                  Відправляємо Новою Поштою зі страхуванням. Якщо під час доставки мед пошкодився або розбився — не забирайте посилку, оформіть повернення, і ми відправимо нову.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Related products */}
        {related.length > 0 && (
          <div className="mt-16">
            <h2 className="font-serif text-2xl font-bold text-bark mb-8">
              Також може зацікавити
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
