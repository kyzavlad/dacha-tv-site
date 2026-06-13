import type { Metadata } from 'next'
import { Inter, Lora } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { getSiteSettings } from '@/lib/supabase/queries'
import { CartProvider } from '@/lib/cart/CartContext'
import { CartDrawer } from '@/components/cart/CartDrawer'

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
    default: 'Дача TV — товари, продукти й послуги для дому, саду та господарства',
  },
  description:
    'Мед і продукти пасіки, натуральні продукти, квіти, лаванда, металопрофіль та товари для господарства — сімейне господарство на Харківщині із зручним замовленням онлайн.',
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

  return (
    <html lang="uk" className={`${inter.variable} ${lora.variable} h-full antialiased overflow-x-hidden`}>
      <head>
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}')`,
              }}
            />
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-cream text-bark overflow-x-hidden">
        <CartProvider>
          <Header siteSettings={siteSettings} />
          <CartDrawer />
          <main className="flex-1">{children}</main>
          <Footer siteSettings={siteSettings} />
        </CartProvider>
      </body>
    </html>
  )
}
