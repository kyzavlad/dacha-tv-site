'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'

// Server-authoritative active locale, provided once by the root layout (which
// reads the proxy's x-dacha-locale header) and consumed by client components.
//
// Why not derive the locale from usePathname() in each client component?
// Because /ru/* is served by a middleware REWRITE (proxy.ts) to the canonical
// path, so during SSR usePathname() returns the REWRITTEN path ('/products'),
// not the browser path ('/ru/products'). Client components that split the
// locale out of usePathname() therefore render UK links during SSR on a /ru
// page and only flip to /ru after hydration — a hydration mismatch and wrong
// server HTML. This context carries the real locale (from the header) so SSR
// and the client agree, and every internal link keeps the /ru prefix.
//
// The canonical PATH (for building switch/target hrefs) is still taken from
// usePathname()+splitLocale(), which is correct either way — only the ACTIVE
// LOCALE needs this header-backed source.
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}
