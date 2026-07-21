export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getServiceBySlug } from '@/lib/supabase/queries'
import { GeneralContactForm } from '@/components/forms/GeneralContactForm'
import { StructuredData } from '@/components/shared/StructuredData'
import { DailyCalendar } from '@/components/bookings/DailyCalendar'
import { HourlyCalendar } from '@/components/bookings/HourlyCalendar'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { manualDict } from '@/lib/i18n/sections/manual'
import { getManualTranslations, resolveManualField } from '@/lib/i18n/manual-translations'

interface Props {
  params: Promise<{ slug: string }>
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.dachatv.com'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  const t = manualDict(locale)
  const service = await getServiceBySlug(slug).catch(() => null)
  if (!service) return { title: t.detailServiceNotFound }
  const tr = locale === 'uk' ? null : (await getManualTranslations('service', [service.id], locale)).get(service.id)
  const name = resolveManualField(service.name, tr, 'name', locale)
  const description = resolveManualField(service.short_description ?? null, tr, 'short_description', locale) || `${name}: Дача TV`
  return {
    title: name,
    description,
    alternates: { canonical: `${siteUrl}/services/${slug}`, languages: { uk: `${siteUrl}/services/${slug}`, ru: `${siteUrl}/ru/services/${slug}`, en: `${siteUrl}/en/services/${slug}` } },
    openGraph: {
      title: name,
      description,
      images: service.image_url
        ? [{ url: service.image_url, width: 1200, height: 630, alt: name }]
        : [{ url: `${siteUrl}/images/dacha-tv/logo-square.png`, width: 1200, height: 630, alt: 'Дача TV' }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description,
      images: service.image_url ? [service.image_url] : [`${siteUrl}/images/dacha-tv/logo-square.png`],
    },
  }
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  const t = manualDict(locale)

  // Lavender lives at its dedicated /lavender page (full booking rules, season,
  // bouquets, two-tier pricing). Keep a single canonical lavender page: never a
  // competing duplicate under /services.
  if (slug === 'orenda-lavandovoho-polia') redirect(localizedPath(locale, '/lavender'))

  const service = await getServiceBySlug(slug).catch(() => null)
  if (!service || service.status !== 'active') notFound()

  const tr = locale === 'uk' ? null : (await getManualTranslations('service', [service.id], locale)).get(service.id)
  const name = resolveManualField(service.name, tr, 'name', locale)
  const shortDesc = resolveManualField(service.short_description ?? null, tr, 'short_description', locale)
  const fullDesc = resolveManualField(service.description ?? null, tr, 'description', locale)

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.short_description || service.name,
    provider: { '@type': 'Organization', name: 'Дача TV', url: siteUrl },
    ...(service.price_uah != null ? {
      offers: {
        '@type': 'Offer',
        priceCurrency: 'UAH',
        price: service.price_uah,
        availability: 'https://schema.org/InStock',
      },
    } : {}),
  }

  return (
    <div className="bg-white min-h-screen">
      <StructuredData data={serviceSchema} />

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav aria-label={t.detailBreadcrumbHome} className="text-sm text-gray-400">
          <Link href={localizedPath(locale, '/')} className="hover:text-gray-700 transition-colors">{t.detailBreadcrumbHome}</Link>
          <span className="mx-2">›</span>
          <Link href={localizedPath(locale, '/services')} className="hover:text-gray-700 transition-colors">{t.servicesBreadcrumbCurrent}</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-700">{name}</span>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Visual */}
          <div className="rounded-2xl overflow-hidden aspect-video bg-honey-50 flex items-center justify-center">
            {service.image_url ? (
              <img
                src={service.image_url}
                alt={resolveManualField(service.name, tr, 'image_alt', locale) || name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-8xl select-none">
                {service.slug === 'orenda-budynochka-na-vodi' ? '🏠' :
                 service.slug === 'orenda-lavandovoho-polia' ? '💜' : '🌿'}
              </span>
            )}
          </div>

          {/* Info */}
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark mb-4">
              {name}
            </h1>

            {shortDesc && (
              <p className="text-bark/70 text-lg leading-relaxed mb-5">
                {shortDesc}
              </p>
            )}

            {fullDesc && fullDesc !== shortDesc && (
              <p className="text-bark/70 leading-relaxed mb-6">
                {fullDesc}
              </p>
            )}

            <dl className="space-y-3 mb-6 border-t border-gray-100 pt-5">
              {service.price_note && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-gray-400">{t.detailPrice}</dt>
                  <dd className="col-span-2 text-sm text-gray-800 font-semibold">{service.price_note}</dd>
                </div>
              )}
              {service.duration_note && (
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-sm font-medium text-gray-400">{t.detailDuration}</dt>
                  <dd className="col-span-2 text-sm text-gray-800">{service.duration_note}</dd>
                </div>
              )}
            </dl>

            {(service.booking_type === 'daily' || service.booking_type === 'hourly') && (
              <a
                href="#booking"
                className="group flex items-center justify-center gap-2.5 w-full px-8 py-6 mb-8 bg-honey-600 hover:bg-honey-700 text-white font-extrabold uppercase tracking-wide rounded-2xl shadow-2xl shadow-honey-600/40 ring-2 ring-honey-500/50 hover:ring-honey-400 hover:scale-[1.02] active:scale-100 transition-all duration-200 text-xl md:text-2xl"
              >
                {t.detailBookNow}
                <span aria-hidden="true" className="text-2xl group-hover:translate-x-1 transition-transform">→</span>
              </a>
            )}

            {/* Booking section */}
            {service.booking_type === 'daily' ? (
              <div id="booking" className="scroll-mt-24">
                <h2 className="font-serif text-xl font-bold text-gray-900 mb-1">{t.detailBookTitle}</h2>
                <p className="text-gray-500 text-sm mb-4">
                  {t.detailBookDailyBody}
                </p>
                <DailyCalendar
                  serviceSlug={service.slug}
                  serviceName={name}
                  pricePerNight={service.price_uah ?? 3000}
                  capacity={service.capacity ?? 10}
                  checkInTime={service.check_in_time ?? '12:00'}
                  checkOutTime={service.check_out_time ?? '12:00'}
                  source={`/services/${slug}`}
                  locale={locale}
                />
              </div>
            ) : service.booking_type === 'hourly' ? (
              <div id="booking" className="scroll-mt-24">
                <h2 className="font-serif text-xl font-bold text-gray-900 mb-1">{t.detailBookHourTitle}</h2>
                <p className="text-gray-500 text-sm mb-4">
                  {t.detailBookHourBody}
                </p>
                <HourlyCalendar
                  serviceSlug={service.slug}
                  serviceName={name}
                  pricePerHour={service.price_uah ?? 1000}
                  capacity={service.capacity ?? 5}
                  extraGuestPrice={service.extra_guest_price_uah ?? 200}
                  slotStartHour={service.slot_start_hour ?? 6}
                  slotEndHour={service.slot_end_hour ?? 21}
                  source={`/services/${slug}`}
                  locale={locale}
                />
              </div>
            ) : (
              <div id="order-form" className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                <h2 className="font-serif text-xl font-bold text-gray-900 mb-1">{t.detailOrderServiceTitle}</h2>
                <p className="text-gray-500 text-sm mb-5">
                  {t.detailOrderServiceBody}
                </p>
                <GeneralContactForm source={`/services/${slug}`} locale={locale} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
