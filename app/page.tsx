import type { Metadata } from 'next'
import { Hero } from '@/components/home/Hero'
import { EcosystemSections } from '@/components/home/EcosystemSections'
import { ProductPreview } from '@/components/home/ProductPreview'
import { BrandStory } from '@/components/home/BrandStory'
import { YouTubeSection } from '@/components/home/YouTubeSection'
import { HowToOrder } from '@/components/home/HowToOrder'
import { Reviews } from '@/components/home/Reviews'
import { BeekeeperTeaser } from '@/components/home/BeekeeperTeaser'
import { DeliveryTeaser } from '@/components/home/DeliveryTeaser'
import { StructuredData } from '@/components/shared/StructuredData'
import { ApiaryTrustStrip } from '@/components/home/ApiaryTrustStrip'
import { ApiaryTrust } from '@/components/shared/ApiaryTrust'
import {
  getFeaturedHoneyProducts,
  getVisibleReviews,
  getSiteSettings,
} from '@/lib/supabase/queries'
export const metadata: Metadata = {
  title: { absolute: 'Дача TV — товари, продукти й послуги для дому, саду та господарства' },
  description:
    'Мед і продукти пасіки, натуральні продукти, квіти, лаванда, металопрофіль та товари для господарства — сімейне господарство на Харківщині із зручним замовленням онлайн.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Дача TV — товари, продукти й послуги для дому, саду та господарства',
    description: 'Мед і продукти пасіки, натуральні продукти, квіти, лаванда, металопрофіль та товари для господарства — з перевірених джерел і зручним замовленням онлайн.',
    siteName: 'Дача TV',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV' }],
  },
}

export default async function HomePage() {
  const [featuredHoneyProducts, reviews, siteSettings] = await Promise.all([
    getFeaturedHoneyProducts().catch(() => []),
    getVisibleReviews().catch(() => []),
    getSiteSettings().catch(() => null),
  ])

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'}/#business`,
    name: 'Дача TV',
    description:
      'Сімейна пасіка на Харківщині. Натуральний мед, пилок, прополіс та бджолині пакети напряму від виробника.',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com',
    telephone: siteSettings?.phone || '',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Коротич',
      addressLocality: 'Коротич',
      addressRegion: 'Харківська область',
      addressCountry: 'UA',
    },
    sameAs: [
      siteSettings?.youtube_url,
      siteSettings?.facebook_url,
      siteSettings?.instagram_url,
      siteSettings?.tiktok_url,
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

      <ProductPreview products={featuredHoneyProducts} />

      <BrandStory />

      <YouTubeSection siteSettings={siteSettings} />

      <HowToOrder siteSettings={siteSettings} />

      <Reviews reviews={reviews} />

      <ApiaryTrustStrip />

      {/* Apiary registration trust block */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <ApiaryTrust />
        </div>
      </section>

      <BeekeeperTeaser />

      <DeliveryTeaser />
    </>
  )
}
