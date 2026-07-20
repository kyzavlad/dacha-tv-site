'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { PRIMARY_NAV } from '@/lib/navigation'
import { splitLocale, localizedPath } from '@/lib/i18n'
import { navLabel } from '@/lib/i18n-ui'

// Desktop primary navigation (centre of the header). The mobile menu lives in
// its own component (MobileMenu) so its trigger can sit in the header's right
// action group next to the cart. Labels + hrefs follow the active locale.
export function Navigation() {
  const pathname = usePathname() || '/'
  const { locale, path } = splitLocale(pathname)
  return (
    <nav className="hidden md:flex items-center gap-1" aria-label="Навігація">
      {PRIMARY_NAV.map(({ href, label }) => (
        <Link key={href} href={localizedPath(locale, href)}
          className={cn('px-3.5 py-2 rounded-full text-sm font-medium transition-colors',
            path.startsWith(href) ? 'text-honey-800 bg-honey-100' : 'text-bark/70 hover:text-bark hover:bg-honey-50')}>
          {navLabel(href, locale, label)}
        </Link>
      ))}
    </nav>
  )
}
