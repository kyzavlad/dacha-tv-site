import type { Metadata } from 'next'
import { buildAlternates, SITE_URL } from '@/lib/seo'
import { Hero } from '@/components/home/Hero'
import { AvailableNow } from '@/components/home/AvailableNow'
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
  LAUNCH_YOUTUBE_URL,
  LAUNCH_FACEBOOK_URL,
  LAUNCH_INSTAGRAM_URL,
  LAUNCH_TIKTOK_URL,
} from '@/lib/launch-defaults'
import { getRequestLocale } from '@/lib/i18n'

const HOME_META: Record<'uk' | 'ru' | 'en', { title: string; description: string; ogAlt: string }> = {
  uk: {
    title: 'Дача TV: товари, продукти й послуги',
    description:
      'Мед, продукти пасіки, натуральні продукти, квіти, лаванда, металопрофіль і товари для господарства. Сімейне господарство на Харківщині із зручним замовленням онлайн.',
    ogAlt: 'Дача TV',
  },
  ru: {
    title: 'Дача TV: товары, продукты и услуги',
    description:
      'Мёд, продукты пасеки, натуральные продукты, цветы, лаванда, металлопрофиль и товары для хозяйства. Семейное хозяйство в Харьковской области с удобным заказом онлайн.',
    ogAlt: 'Дача TV',
  },
  en: {
    title: 'Dacha TV: goods, products, and services',
    description:
      'Honey, apiary products, natural goods, flowers, lavender, metal roofing profiles, and home & garden supplies. A family farm in the Kharkiv region with convenient online ordering.',
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
    uk: 'Сімейне господарство на Харківщині: мед і продукти пасіки, натуральні продукти, квіти, лаванда, послуги та магазин товарів для дому й господарства.',
    ru: 'Семейное хозяйство в Харьковской области: мёд и продукты пасеки, натуральные продукты, цветы, лаванда, услуги и магазин товаров для дома и хозяйства.',
    en: 'A family farm in the Kharkiv region: honey and apiary products, natural goods, flowers, lavender, services, and a shop for home & garden supplies.',
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
    streetAddress: 'Коротич',
    addressLocality: 'Коротич',
    addressRegion: 'Харківська область',
    addressCountry: 'UA',
  }

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_URL}/#business`,
    name: 'Дача TV',
    legalName: 'ФОП Кузьменко Владислав Сергійович',
    description: localBusinessDescription[locale],
    url: SITE_URL,
    telephone: phone,
    address: postalAddress,
    sameAs: socialProfiles,
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
    telephone: phone,
    address: postalAddress,
    sameAs: socialProfiles,
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      merchantReturnLink: `${SITE_URL}/returns`,
    },
  }

  return (
    <>
      <StructuredData data={localBusinessSchema} />
      <StructuredData data={onlineStoreSchema} />

      <Hero
        tagline={siteSettings?.hero_tagline ?? undefined}
        subtext={siteSettings?.hero_subtext ?? undefined}
        siteSettings={siteSettings}
      />

      <EcosystemSections />

      <AvailableNow />

      <BrandStory />

      <YouTubeSection siteSettings={siteSettings} />

      <HowToOrder siteSettings={siteSettings} />

      <Reviews reviews={reviews} locale={locale} />

      <ApiaryTrustStrip />

      <DeliveryTeaser />
    </>
  )
}
