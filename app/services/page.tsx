export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllServices } from '@/lib/supabase/queries'
import { GeneralContactForm } from '@/components/forms/GeneralContactForm'
import { StructuredData } from '@/components/shared/StructuredData'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.dachatv.com'

export const metadata: Metadata = {
  title: 'Послуги',
  description: 'Послуги садиби Дача TV на Харківщині: фотосесія у лаванді, оренда альтанки на воді, відпочинок на природі та консультації пасічника.',
  alternates: { canonical: `${siteUrl}/services` },
  openGraph: {
    title: 'Послуги садиби',
    description: 'Фотосесії у лаванді, відпочинок над ставком, оренда альтанки та консультації пасічника — усе на одній садибі під Харковом.',
    siteName: 'Дача TV',
    images: [{ url: `${siteUrl}/images/dacha-tv/logo-square.png`, width: 1200, height: 630, alt: 'Дача TV' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Послуги садиби',
    description: 'Фотосесії у лаванді, відпочинок над ставком, оренда альтанки та консультації пасічника — Дача TV, Харківщина.',
    images: [`${siteUrl}/images/dacha-tv/logo-square.png`],
  },
}

const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Дача TV',
  url: siteUrl,
  description: 'Сімейна садиба Дача TV: мед, квіти, фотосесії та відпочинок на природі на Харківщині.',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Коротич',
    addressRegion: 'Харківська область',
    addressCountry: 'UA',
  },
}

// Bound the DB lookup so a slow/unavailable Supabase can never hang the render.
// On timeout/error we fall back to an empty list — the page still shows the hero
// and the general inquiry form, so visitors can always reach us.
const SERVICES_TIMEOUT_MS = 3000

function servicesWithTimeout() {
  return Promise.race([
    getAllServices(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('services_timeout')), SERVICES_TIMEOUT_MS)),
  ])
}

export default async function ServicesPage() {
  const services = await servicesWithTimeout().catch((e) => {
    console.error('[services] load failed/timed out:', e instanceof Error ? e.message : e)
    return []
  })

  return (
    <div className="bg-white min-h-screen">
      <StructuredData data={serviceSchema} />

      {/* Hero */}
      <div className="bg-honey-50 border-b border-honey-200 py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-4">
            Послуги садиби
          </h1>
          <p className="text-bark/70 text-lg max-w-2xl mx-auto">
            Фотосесії у лаванді, відпочинок над ставком та консультації пасічника: все на одній садибі.
          </p>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav aria-label="Навігація" className="text-sm text-gray-400">
          <Link href="/" className="hover:text-gray-700 transition-colors">Головна</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-700">Послуги</span>
        </nav>
      </div>

      {/* Service cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {services.length === 0 ? (
          <p className="text-gray-500 text-center py-16">Послуги незабаром з&apos;являться.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {services.map((service) => (
              <div
                key={service.id}
                className="bg-white border border-honey-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {service.image_url ? (
                  <div className="aspect-video bg-honey-50 overflow-hidden">
                    <img
                      src={service.image_url}
                      alt={service.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-honey-50 flex items-center justify-center">
                    <span className="text-5xl select-none">
                      {service.slug === 'orenda-budynochka-na-vodi' ? '🏠' :
                       service.slug === 'orenda-lavandovoho-polia' ? '💜' : '🌿'}
                    </span>
                  </div>
                )}
                <div className="p-6 flex flex-col flex-1">
                  <h2 className="font-serif text-xl font-bold text-bark mb-2">
                    {service.name}
                  </h2>
                  {service.short_description && (
                    <p className="text-bark/70 text-sm leading-relaxed mb-4 flex-1">
                      {service.short_description}
                    </p>
                  )}
                  <div className="mt-auto">
                    {service.price_note && (
                      <p className="text-honey-700 font-semibold text-lg mb-1">
                        {service.price_note}
                      </p>
                    )}
                    {service.duration_note && (
                      <p className="text-bark/50 text-xs mb-4">{service.duration_note}</p>
                    )}
                    {service.slug === 'orenda-lavandovoho-polia' ? (
                      <Link
                        href="/lavender#orenda"
                        className="inline-block w-full text-center bg-purple-700 hover:bg-purple-800 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                      >
                        Забронювати
                      </Link>
                    ) : (service.booking_type === 'daily' || service.booking_type === 'hourly') ? (
                      <Link
                        href={`/services/${service.slug}#booking`}
                        className="inline-block w-full text-center bg-honey-600 hover:bg-honey-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                      >
                        Забронювати
                      </Link>
                    ) : (
                      <Link
                        href={`/services/${service.slug}`}
                        className="inline-block w-full text-center bg-honey-600 hover:bg-honey-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                      >
                        Дізнатися більше
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* General inquiry */}
        <div className="max-w-xl mx-auto">
          <div className="bg-honey-50 rounded-2xl p-8 border border-honey-200">
            <h2 className="font-serif text-2xl font-bold text-bark mb-2 text-center">
              Маєте питання?
            </h2>
            <p className="text-bark/70 text-center text-sm mb-6">
              Залиште контакти: розповімо деталі та допоможемо обрати.
            </p>
            <GeneralContactForm source="/services" />
          </div>
        </div>
      </div>
    </div>
  )
}
