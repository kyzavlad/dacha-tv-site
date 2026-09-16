import type { Metadata } from 'next'
import { Inter, Lora } from 'next/font/google'
import './globals.css'
import { headers } from 'next/headers'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { getSiteSettings } from '@/lib/supabase/queries'
import { CartProvider } from '@/lib/cart/CartContext'
import { CartDrawer } from '@/components/cart/CartDrawer'
import { Analytics } from '@/components/analytics/Analytics'
import { AttributionCapture } from '@/components/analytics/AttributionCapture'
import { SiteChrome } from '@/components/layout/SiteChrome'
import { isLocale, DEFAULT_LOCALE } from '@/lib/i18n'
import { LocaleProvider } from '@/lib/i18n/locale-context'
import { SITE_URL } from '@/lib/seo'
import { LAUNCH_PHONE, LAUNCH_PHONE_SECONDARY } from '@/lib/launch-defaults'
import { StructuredData } from '@/components/shared/StructuredData'
import { organizationSchema, websiteSchema } from '@/lib/schema'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
})

const lora = Lora({
  variable: '--font-lora',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: '%s | Дача TV',
    default: 'Dacha TV — інтернет-магазин товарів з доставкою по Україні',
  },
  description:
    'Dacha TV — український інтернет-магазин широкого асортименту: запчастини для скутерів і мото, автоаксесуари, інструменти, товари для дому, саду та господарства. Окремі напрямки — власні продукти, квіти, лаванда й послуги. Доставка по Україні.',
  keywords: ['Dacha TV', 'інтернет-магазин Україна', 'запчастини для скутерів', 'мотозапчастини', 'автоаксесуари', 'інструменти', 'товари для дому', 'товари для саду'],
  openGraph: {
    locale: 'uk_UA',
    type: 'website',
    siteName: 'Дача TV',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV' }],
  },
  twitter: { card: 'summary_large_image' },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const storedSiteSettings = await getSiteSettings().catch(() => null)
  // Phone order is a launch-level commercial decision. Keep all other editable
  // site settings, but do not let an older database row silently override the
  // current primary/secondary support numbers in global chrome.
  const siteSettings = storedSiteSettings
    ? {
        ...storedSiteSettings,
        phone: LAUNCH_PHONE,
        phone_secondary: LAUNCH_PHONE_SECONDARY,
      }
    : null

  // Locale + admin signal come from the proxy (x-dacha-locale on /ru,/en;
  // x-dacha-section=admin on /admin). Reading them here sets <html lang>
  // correctly per request and lets SiteChrome pick the admin branch server-side.
  const h = await headers()
  const rawLocale = h.get('x-dacha-locale')
  const lang = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const initialIsAdmin = h.get('x-dacha-section') === 'admin'

  return (
    <html lang={lang} className={`${inter.variable} ${lora.variable} h-full antialiased overflow-x-hidden`}>
      <head>
        <Analytics />
      </head>
      <body className="min-h-full flex flex-col bg-cream text-bark overflow-x-hidden">
        <StructuredData data={organizationSchema(LAUNCH_PHONE)} />
        <StructuredData data={websiteSchema(lang)} />
        <LocaleProvider locale={lang}>
          <CartProvider>
            <SiteChrome
              initialIsAdmin={initialIsAdmin}
              attribution={<AttributionCapture />}
              header={<Header siteSettings={siteSettings} locale={lang} />}
              cartDrawer={<CartDrawer />}
              footer={<Footer siteSettings={siteSettings} />}
            >
              {children}
            </SiteChrome>
          </CartProvider>
        </LocaleProvider>
      </body>
    </html>
  )
}