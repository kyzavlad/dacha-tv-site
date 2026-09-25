import type { Metadata } from 'next'
import { buildAlternates, SITE_URL } from '@/lib/seo'
import { Hero } from '@/components/home/Hero'
import { EcosystemSections } from '@/components/home/EcosystemSections'
import { BrandStory } from '@/components/home/BrandStory'
import { YouTubeSection } from '@/components/home/YouTubeSection'
import { HowToOrder } from '@/components/home/HowToOrder'
import { Reviews } from '@/components/home/Reviews'
import { DeliveryTeaser } from '@/components/home/DeliveryTeaser'
import { StructuredData } from '@/components/shared/StructuredData'
import { ApiaryTrustStrip } from '@/components/home/ApiaryTrustStrip'
import {
  getVisibleReviews,
  getSiteSettings,
} from '@/lib/supabase/queries'
import {
  LAUNCH_PHONE,
  LAUNCH_SUPPORT_EMAIL,
  LAUNCH_YOUTUBE_URL,
  LAUNCH_FACEBOOK_URL,
  LAUNCH_INSTAGRAM_URL,
  LAUNCH_TIKTOK_URL,
} from '@/lib/launch-defaults'
import { getRequestLocale } from '@/lib/i18n'

const HOME_META: Record<'uk' | 'ru' | 'en', { title: string; description: string; ogAlt: string }> = {
  uk: {
    title: 'Dacha TV — інтернет-магазин товарів з доставкою по Україні',
    description:
      'Dacha TV — інтернет-магазин широкого асортименту: запчастини для скутерів і мото, автоаксесуари, інструменти, товари для дому, саду та господарства. Власні продукти й локальні напрямки — окремими розділами.',
    ogAlt: 'Дача TV',
  },
  ru: {
    title: 'Dacha TV — интернет-магазин товаров с доставкой по Украине',
    description:
      'Dacha TV — интернет-магазин широкого ассортимента: запчасти для скутеров и мото, автоаксессуары, инструменты, товары для дома, сада и хозяйства. Собственные продукты и локальные направления — в отдельных разделах.',
    ogAlt: 'Дача TV',
  },
  en: {
    title: 'Dacha TV — online store with delivery across Ukraine',
    description:
      'Dacha TV is a broad online store for scooter and motorcycle parts, auto accessories, tools, home, garden and household goods. Our own products and local services live in dedicated sections.',
    ogAlt: 'Dacha TV',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const { canonical, languages } = buildAlternates(locale, '/')
  const m = HOME_META[locale]
  return {
    title: { absolute: m.title },
    description: m.description,
    alternates: { canonical, languages },
    openGraph: {
      title: m.title,
      description: m.description,
      siteName: 'Дача TV',
      images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: m.ogAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: m.title,
      description: m.description,
    },
  }
}

export default async function HomePage() {
  const [reviews, siteSettings] = await Promise.all([
    getVisibleReviews().catch(() => []),
    getSiteSettings().catch(() => null),
  ])

  // Locale is read once here and passed to client sections (which can't call
  // getRequestLocale). Server sections read the request locale themselves.
  const locale = await getRequestLocale()

  const localBusinessDescription: Record<'uk' | 'ru' | 'en', string> = {
    uk: 'Український інтернет-магазин широкого асортименту з доставкою по Україні. Окремі власні напрямки Dacha TV — продукти господарства, квіти, лаванда, пасіка та локальні послуги.',
    ru: 'Украинский интернет-магазин широкого ассортимента с доставкой по Украине. Отдельные собственные направления Dacha TV — продукты хозяйства, цветы, лаванда, пасека и локальные услуги.',
    en: 'A Ukrainian online store with a broad assortment and delivery across Ukraine. Dacha TV also has separate own-product and local-service sections for farm goods, flowers, lavender and the apiary.',
  }

  const phone = siteSettings?.phone || LAUNCH_PHONE
  const socialProfiles = [
    siteSettings?.youtube_url || LAUNCH_YOUTUBE_URL,
    siteSettings?.facebook_url || LAUNCH_FACEBOOK_URL,
    siteSettings?.instagram_url || LAUNCH_INSTAGRAM_URL,
    siteSettings?.tiktok_url || LAUNCH_TIKTOK_URL,
  ].filter(Boolean)

  const postalAddress = {
    '@type': 'PostalAddress',
    streetAddress: 'просп. Героїв Харкова, 300, кв. 156',
    postalCode: '61032',
    addressLocality: 'Харків',
    addressRegion: 'Харківська область',
    addressCountry: 'UA',
  }

  // Merchant-level returns markup intentionally uses Google's link-only option:
  // the storefront mixes food and non-food goods, so product/category exceptions
  // remain on the human-readable policy rather than being flattened into an
  // inaccurate single return-window rule in JSON-LD.
  const onlineStoreSchema = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': `${SITE_URL}/#online-store`,
    name: 'Дача TV',
    legalName: 'ФОП Кузьменко Владислав Сергійович',
    url: SITE_URL,
    logo: `${SITE_URL}/images/dacha-tv/logo-square.png`,
    description: localBusinessDescription[locale],
    areaServed: 'UA',
    telephone: phone,
    email: LAUNCH_SUPPORT_EMAIL,
    address: postalAddress,
    sameAs: socialProfiles,
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      merchantReturnLink: `${SITE_URL}/returns`,
    },
  }

  return (
    <>
      <StructuredData data={onlineStoreSchema} />

      <Hero
        tagline={siteSettings?.hero_tagline ?? undefined}
        subtext={siteSettings?.hero_subtext ?? undefined}
        siteSettings={siteSettings}
      />

      <EcosystemSections />


      <BrandStory />

      <YouTubeSection siteSettings={siteSettings} />

      <HowToOrder siteSettings={siteSettings} />

      <Reviews reviews={reviews} locale={locale} />

      <ApiaryTrustStrip />

      <DeliveryTeaser />
    </>
  )
}