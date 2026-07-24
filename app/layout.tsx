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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'),
  title: {
    template: '%s | Дача TV',
    default: 'Дача TV: товари, продукти й послуги',
  },
  description:
    'Мед, продукти пасіки, натуральні продукти, квіти, лаванда, металопрофіль і товари для господарства. Сімейне господарство на Харківщині із зручним замовленням онлайн.',
  keywords: ['Дача TV', 'мед Харківщина', 'продукти пасіки', 'натуральні продукти', 'квіти', 'лаванда', 'металопрофіль', 'товари для господарства'],
  openGraph: {
    locale: 'uk_UA',
    type: 'website',
    siteName: 'Дача TV',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV' }],
  },
  twitter: { card: 'summary_large_image' },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const siteSettings = await getSiteSettings().catch(() => null)

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
