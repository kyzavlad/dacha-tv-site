export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { buildAlternates } from '@/lib/seo'
import Link from 'next/link'
import { getAllServices } from '@/lib/supabase/queries'
import { GeneralContactForm } from '@/components/forms/GeneralContactForm'
import { StructuredData } from '@/components/shared/StructuredData'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { manualDict } from '@/lib/i18n/sections/manual'
import { getManualTranslations, resolveManualField } from '@/lib/i18n/manual-translations'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.dachatv.com'

const SERVICES_META: Record<'uk' | 'ru' | 'en', { title: string; description: string; ogTitle: string; ogDescription: string }> = {
  uk: {
    title: 'Послуги',
    description: 'Послуги садиби Дача TV на Харківщині: фотосесія у лаванді, оренда альтанки на воді, відпочинок на природі та консультації пасічника.',
    ogTitle: 'Послуги садиби',
    ogDescription: 'Фотосесії у лаванді, відпочинок над ставком, оренда альтанки та консультації пасічника — усе на одній садибі під Харковом.',
  },
  ru: {
    title: 'Услуги',
    description: 'Услуги усадьбы Дача TV на Харьковщине: фотосессия в лаванде, аренда беседки на воде, отдых на природе и консультации пчеловода.',
    ogTitle: 'Услуги усадьбы',
    ogDescription: 'Фотосессии в лаванде, отдых у пруда, аренда беседки и консультации пчеловода — всё на одной усадьбе под Харьковом.',
  },
  en: {
    title: 'Services',
    description: 'Dacha TV homestead services in the Kharkiv region: lavender photo shoots, waterside gazebo rental, outdoor recreation and beekeeper consultations.',
    ogTitle: 'Homestead services',
    ogDescription: 'Lavender photo shoots, rest by the pond, gazebo rental and beekeeper consultations — all on one homestead near Kharkiv.',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const { canonical, languages } = buildAlternates(locale, '/services')
  const m = SERVICES_META[locale]
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical, languages },
    openGraph: {
      title: m.ogTitle,
      description: m.ogDescription,
      siteName: 'Дача TV',
      images: [{ url: `${siteUrl}/images/dacha-tv/logo-square.png`, width: 1200, height: 630, alt: 'Дача TV' }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: m.ogTitle,
      description: m.ogDescription,
      images: [`${siteUrl}/images/dacha-tv/logo-square.png`],
    },
  }
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
  const locale = await getRequestLocale()
  const t = manualDict(locale)
  const services = await servicesWithTimeout().catch((e) => {
    console.error('[services] load failed/timed out:', e instanceof Error ? e.message : e)
    return []
  })
  // RU/EN translations for service name/short_description (falls back to the
  // Ukrainian base when a row hasn't been translated yet — never shows empty).
  const serviceTranslations = await getManualTranslations('service', services.map((s) => s.id), locale)

  return (
    <div className="bg-white min-h-screen">
      <StructuredData data={serviceSchema} />

      {/* Hero */}
      <div className="bg-honey-50 border-b border-honey-200 py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-4">
            {t.servicesH1}
          </h1>
          <p className="text-bark/70 text-lg max-w-2xl mx-auto">
            {t.servicesIntro}
          </p>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav aria-label={t.servicesBreadcrumbCurrent} className="text-sm text-gray-400">
          <Link href={localizedPath(locale, '/')} className="hover:text-gray-700 transition-colors">{t.servicesBreadcrumbHome}</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-700">{t.servicesBreadcrumbCurrent}</span>
        </nav>
      </div>

      {/* Service cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {services.length === 0 ? (
          <p className="text-gray-500 text-center py-16">{t.servicesEmpty}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {services.map((service) => {
              const tr = serviceTranslations.get(service.id)
              const name = resolveManualField(service.name, tr, 'name', locale)
              const shortDesc = resolveManualField(service.short_description ?? null, tr, 'short_description', locale)
              return (
              <div
                key={service.id}
                className="bg-white border border-honey-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {service.image_url ? (
                  <div className="aspect-video bg-honey-50 overflow-hidden">
                    <img
                      src={service.image_url}
                      alt={resolveManualField(service.name, tr, 'image_alt', locale) || name}
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
                    {name}
                  </h2>
                  {shortDesc && (
                    <p className="text-bark/70 text-sm leading-relaxed mb-4 flex-1">
                      {shortDesc}
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
                        href={`${localizedPath(locale, '/lavender')}#orenda`}
                        className="inline-block w-full text-center bg-purple-700 hover:bg-purple-800 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                      >
                        {t.servicesBook}
                      </Link>
                    ) : (service.booking_type === 'daily' || service.booking_type === 'hourly') ? (
                      <Link
                        href={`${localizedPath(locale, `/services/${service.slug}`)}#booking`}
                        className="inline-block w-full text-center bg-honey-600 hover:bg-honey-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                      >
                        {t.servicesBook}
                      </Link>
                    ) : (
                      <Link
                        href={localizedPath(locale, `/services/${service.slug}`)}
                        className="inline-block w-full text-center bg-honey-600 hover:bg-honey-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                      >
                        {t.servicesLearnMore}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        )}

        {/* General inquiry */}
        <div className="max-w-xl mx-auto">
          <div className="bg-honey-50 rounded-2xl p-8 border border-honey-200">
            <h2 className="font-serif text-2xl font-bold text-bark mb-2 text-center">
              {t.servicesQuestionsTitle}
            </h2>
            <p className="text-bark/70 text-center text-sm mb-6">
              {t.servicesQuestionsBody}
            </p>
            <GeneralContactForm source="/services" locale={locale} />
          </div>
        </div>
      </div>
    </div>
  )
}
