import type { Metadata } from 'next'
import { GeneralContactForm } from '@/components/forms/GeneralContactForm'
import { PhoneLink } from '@/components/shared/PhoneLink'
import { SocialIcons } from '@/components/shared/SocialIcons'
import { StructuredData } from '@/components/shared/StructuredData'
import { getSiteSettings } from '@/lib/supabase/queries'
import {
  LAUNCH_PHONE,
  LAUNCH_PHONE_SECONDARY,
  LAUNCH_ADDRESS,
} from '@/lib/launch-defaults'

export const metadata: Metadata = {
  title: "Зв'язатись з нами",
  description:
    "Зателефонуйте або напишіть — пасіка Дача TV відповідає протягом кількох годин. Адреса: Коротич, Пісочинська ОТГ, Харківська область.",
  alternates: { canonical: '/contact' },
  openGraph: {
    title: "Контакти | Дача TV",
    description: "Зв'яжіться з пасікою Дача TV на Харківщині. Телефон, Telegram, адреса.",
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV — Контакти' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Контакти | Дача TV",
    description: "Зателефонуйте або напишіть — пасіка Дача TV відповідає протягом кількох годин.",
  },
}

export default async function ContactPage() {
  const siteSettings = await getSiteSettings().catch(() => null)
  const phone = siteSettings?.phone || LAUNCH_PHONE
  const phoneSecondary = siteSettings?.phone_secondary || LAUNCH_PHONE_SECONDARY
  const address = siteSettings?.address_full || LAUNCH_ADDRESS

  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Дача TV',
    telephone: phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Коротич',
      addressLocality: 'Коротич',
      addressRegion: 'Харківська область',
      addressCountry: 'UA',
    },
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com',
  }

  return (
    <div className="bg-cream min-h-screen">
      <StructuredData data={localBusinessSchema} />

      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">Контакти</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            Зв&apos;язатись з нами
          </h1>
          <p className="text-gray-500 text-lg max-w-xl">
            Відповідаємо протягом кількох годин. Найшвидший спосіб — зателефонувати.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

          {/* Contact info */}
          <div>
            <h2 className="font-serif text-2xl font-bold text-bark mb-6">
              Контактна інформація
            </h2>

            {/* Primary phone */}
            <div className="bg-honey-50 rounded-2xl p-6 border border-honey-200 mb-4">
              <p className="text-bark/60 text-sm mb-2">Телефон (дзвінки та Viber):</p>
              <PhoneLink
                phone={phone}
                showIcon
                className="text-2xl font-bold"
              />
            </div>

            {/* Secondary phone */}
            <div className="bg-honey-50 rounded-2xl p-6 border border-honey-200 mb-6">
              <p className="text-bark/60 text-sm mb-2">Додатковий телефон:</p>
              <PhoneLink
                phone={phoneSecondary}
                showIcon
                className="text-2xl font-bold"
              />
            </div>

            {/* Telegram */}
            {siteSettings?.telegram_url && (
              <div className="bg-blue-50 rounded-2xl p-5 border border-blue-200 mb-6">
                <p className="text-bark/60 text-sm mb-2">Telegram:</p>
                <a
                  href={siteSettings.telegram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-700 font-semibold text-lg hover:text-blue-900 transition-colors min-h-[44px]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                  Написати в Telegram
                </a>
              </div>
            )}

            {/* Address */}
            <div className="mb-6">
              <h3 className="font-semibold text-bark mb-2">Адреса</h3>
              <address className="not-italic text-bark/70 leading-relaxed">
                {address}
              </address>
            </div>

            {/* Response time */}
            <div className="bg-forest-50 rounded-xl p-4 border border-forest-200 mb-6">
              <p className="text-forest-800 text-sm font-medium">
                Відповідаємо протягом кількох годин
              </p>
              <p className="text-forest-700 text-sm mt-1">
                Найшвидший спосіб — зателефонувати або написати в Telegram.
              </p>
            </div>

            {/* Social links */}
            <div className="mt-2">
              <p className="text-sm text-bark/60 mb-3">Ми в соціальних мережах:</p>
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
              Надіслати повідомлення
            </h2>
            <GeneralContactForm source="/contact" />
          </div>
        </div>
      </div>
    </div>
  )
}
