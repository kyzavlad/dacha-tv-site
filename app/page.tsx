import type { Metadata } from 'next'
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
  LAUNCH_YOUTUBE_URL,
  LAUNCH_FACEBOOK_URL,
  LAUNCH_INSTAGRAM_URL,
  LAUNCH_TIKTOK_URL,
} from '@/lib/launch-defaults'
export const metadata: Metadata = {
  title: { absolute: 'Дача TV: товари, продукти й послуги' },
  description:
    'Мед, продукти пасіки, натуральні продукти, квіти, лаванда, металопрофіль і товари для господарства. Сімейне господарство на Харківщині із зручним замовленням онлайн.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Дача TV: товари, продукти й послуги',
    description: 'Мед, продукти пасіки, натуральні продукти, квіти, лаванда, металопрофіль і товари для господарства. Сімейне господарство на Харківщині із зручним замовленням онлайн.',
    siteName: 'Дача TV',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV' }],
  },
}

export default async function HomePage() {
  const [reviews, siteSettings] = await Promise.all([
    getVisibleReviews().catch(() => []),
    getSiteSettings().catch(() => null),
  ])

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'}/#business`,
    name: 'Дача TV',
    description:
      'Сімейне господарство на Харківщині: мед і продукти пасіки, натуральні продукти, квіти, лаванда, послуги та магазин товарів для дому й господарства.',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com',
    telephone: siteSettings?.phone || '',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Коротич',
      addressLocality: 'Коротич',
      addressRegion: 'Харківська область',
      addressCountry: 'UA',
    },
    // Structured-data sameAs mirrors the footer/social links. Fall back to the
    // official brand profiles so the JSON-LD always advertises the correct
    // accounts even if the admin-managed site_settings row is empty/partial.
    sameAs: [
      siteSettings?.youtube_url || LAUNCH_YOUTUBE_URL,
      siteSettings?.facebook_url || LAUNCH_FACEBOOK_URL,
      siteSettings?.instagram_url || LAUNCH_INSTAGRAM_URL,
      siteSettings?.tiktok_url || LAUNCH_TIKTOK_URL,
    ].filter(Boolean),
  }

  return (
    <>
      <StructuredData data={localBusinessSchema} />

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

      <Reviews reviews={reviews} />

      <ApiaryTrustStrip />

      <DeliveryTeaser />
    </>
  )
}
