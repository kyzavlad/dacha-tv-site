import type { Metadata } from 'next'
import { GeneralContactForm } from '@/components/forms/GeneralContactForm'
import { PhoneLink } from '@/components/shared/PhoneLink'
import { ContactMessengers } from '@/components/shared/ContactMessengers'
import { SocialIcons } from '@/components/shared/SocialIcons'
import { StructuredData } from '@/components/shared/StructuredData'
import { SellerInfo } from '@/components/shared/SellerInfo'
import { getSiteSettings } from '@/lib/supabase/queries'
import {
  LAUNCH_PHONE,
  LAUNCH_PHONE_SECONDARY,
  LAUNCH_SUPPORT_EMAIL,
  LAUNCH_LEGAL_ADDRESS,
} from '@/lib/launch-defaults'
import { getRequestLocale } from '@/lib/i18n'
import { pageDict } from '@/lib/i18n/pages'
import { buildAlternates, buildSocialMetadata, SITE_URL } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const t = pageDict(locale)
  const { canonical, languages } = buildAlternates(locale, '/contact')

  return buildSocialMetadata({
    bareTitle: t.contact.title,
    description: t.contact.intro,
    canonical,
    languages,
    imageAlt: t.contact.title,
  })
}

export default async function ContactPage() {
  const locale = await getRequestLocale()
  const t = pageDict(locale)
  const siteSettings = await getSiteSettings().catch(() => null)
  // Keep the current commercial phone order canonical even if an older
  // site_settings row has not been updated on the self-hosted database yet.
  const phone = LAUNCH_PHONE
  const phoneSecondary = LAUNCH_PHONE_SECONDARY
  const address = LAUNCH_LEGAL_ADDRESS

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_URL}/#business`,
    name: 'Дача TV',
    legalName: 'ФОП Кузьменко Владислав Сергійович',
    telephone: phone,
    email: LAUNCH_SUPPORT_EMAIL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'просп. Героїв Харкова, 300, кв. 156',
      postalCode: '61032',
      addressLocality: 'Харків',
      addressRegion: 'Харківська область',
      addressCountry: 'UA',
    },
    url: SITE_URL,
  }

  return (
    <div className="bg-cream min-h-screen">
      <StructuredData data={localBusinessSchema} />

      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">{t.contact.eyebrow}</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            {t.contact.title}
          </h1>
          <p className="text-gray-500 text-lg max-w-xl">
            {t.contact.intro}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

          {/* Contact info */}
          <div>
            <h2 className="font-serif text-2xl font-bold text-bark mb-6">
              {t.contact.infoTitle}
            </h2>

            {/* Primary phone */}
            <div className="bg-honey-50 rounded-2xl p-6 border border-honey-200 mb-4">
              <p className="text-bark/60 text-sm mb-2">{t.contact.phonePrimary}</p>
              <PhoneLink
                phone={phone}
                showIcon
                className="text-2xl font-bold"
              />
              <ContactMessengers locale={locale} className="mt-4" />
            </div>

            {/* Secondary phone */}
            {phoneSecondary && <div className="bg-honey-50 rounded-2xl p-6 border border-honey-200 mb-6">
              <p className="text-bark/60 text-sm mb-2">{t.contact.phoneSecondary}</p>
              <PhoneLink
                phone={phoneSecondary}
                showIcon
                className="text-2xl font-bold"
              />
            </div>}

            {/* Customer support email */}
            <div className="bg-white rounded-2xl p-5 border border-gray-200 mb-6">
              <p className="text-bark/60 text-sm mb-2">Email</p>
              <a
                href={`mailto:${LAUNCH_SUPPORT_EMAIL}`}
                className="text-bark font-semibold text-lg underline decoration-gray-300 underline-offset-4 hover:decoration-bark"
              >
                {LAUNCH_SUPPORT_EMAIL}
              </a>
            </div>

            {/* Address */}
            <div className="mb-6">
              <h3 className="font-semibold text-bark mb-2">{t.contact.addressTitle}</h3>
              <address className="not-italic text-bark/70 leading-relaxed">
                {address}
              </address>
            </div>

            {/* Response time */}
            <div className="bg-forest-50 rounded-xl p-4 border border-forest-200 mb-6">
              <p className="text-forest-800 text-sm font-medium">
                {t.contact.responseTitle}
              </p>
              <p className="text-forest-700 text-sm mt-1">
                {t.contact.responseBody}
              </p>
            </div>

            <div className="mb-6">
              <SellerInfo />
            </div>

            {/* Social links */}
            <div className="mt-2">
              <p className="text-sm text-bark/60 mb-3">{t.contact.socialTitle}</p>
              <SocialIcons
                siteSettings={siteSettings}
                className="flex items-center gap-2 flex-wrap"
                iconClassName="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:text-bark hover:border-bark transition-all"
              />
            </div>
          </div>

          {/* Contact form */}
          <div>
            <h2 className="font-serif text-2xl font-bold text-bark mb-6">
              {t.contact.formTitle}
            </h2>
            <GeneralContactForm source="/contact" locale={locale} />
          </div>
        </div>
      </div>
    </div>
  )
}
