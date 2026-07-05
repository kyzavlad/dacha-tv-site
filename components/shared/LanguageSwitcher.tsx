'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LOCALES, LOCALE_LABELS, splitLocale, localizedPath } from '@/lib/i18n'

// Language switcher: preserves the current page path across uk / ru / en by
// stripping any locale prefix and re-prefixing for the target locale. The active
// locale is derived from the URL (proxy-rewritten paths keep their /ru or /en
// prefix in the browser address bar, so usePathname sees it).
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const pathname = usePathname() || '/'
  const { locale: active, path } = splitLocale(pathname)

  return (
    <nav aria-label="Мова сайту" className={`flex items-center gap-1 ${className}`}>
      {LOCALES.map((loc) => {
        const href = localizedPath(loc, path)
        const isActive = loc === active
        return (
          <Link
            key={loc}
            href={href}
            hrefLang={loc}
            aria-current={isActive ? 'true' : undefined}
            className={`px-2 py-1 rounded-md text-sm transition-colors ${
              isActive
                ? 'font-semibold text-honey-700 bg-honey-50'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {LOCALE_LABELS[loc]}
          </Link>
        )
      })}
    </nav>
  )
}
