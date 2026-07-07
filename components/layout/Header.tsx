import Link from 'next/link'
import Image from 'next/image'
import { existsSync } from 'fs'
import { join } from 'path'
import { Navigation } from './Navigation'
import { MobileMenu } from './MobileMenu'
import { HeaderSearch } from './HeaderSearch'
import { PhoneLink } from '@/components/shared/PhoneLink'
import { CartButton } from '@/components/cart/CartButton'
import { LAUNCH_PHONE, LAUNCH_PHONE_SECONDARY, LAUNCH_LOGO_PATH } from '@/lib/launch-defaults'
import type { SiteSettings } from '@/types'

interface HeaderProps {
  siteSettings: SiteSettings | null
}

const LOGO_PATH = LAUNCH_LOGO_PATH

export function Header({ siteSettings }: HeaderProps) {
  const phone = siteSettings?.phone || LAUNCH_PHONE
  const phoneSecondary = siteSettings?.phone_secondary || LAUNCH_PHONE_SECONDARY
  const hasLogo = existsSync(join(process.cwd(), 'public', LOGO_PATH))

  return (
    <header className="sticky top-0 z-40 w-full border-b border-black/8 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/72">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <Link
            href="/"
            className="flex-shrink-0 flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            aria-label="Дача TV — на головну"
          >
            {hasLogo ? (
              <Image
                src={LOGO_PATH}
                alt="Дача TV"
                width={36}
                height={36}
                className="w-9 h-9 object-contain"
                priority
              />
            ) : null}
            <span className="font-serif font-bold text-xl text-bark">
              Дача TV
            </span>
          </Link>

          {/* Desktop navigation (center) */}
          <Navigation />

          {/* Right actions — logo left, actions right. On mobile the burger is
              grouped with the cart; desktop adds the phone link. */}
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden md:block">
              <PhoneLink
                phone={phone}
                showIcon
                className="text-sm font-semibold text-bark/80 hover:text-honey-700 transition-colors"
              />
            </div>
            <CartButton />
            <MobileMenu
              phone={phone}
              phoneSecondary={phoneSecondary}
              siteSettings={siteSettings}
              logoPath={hasLogo ? LOGO_PATH : null}
            />
          </div>
        </div>

        {/* Global product search — a second row so it is always visible on every
            page (home, catalog, category, product, content) on desktop AND
            mobile, like a real e-commerce store. */}
        <div className="pb-3">
          <HeaderSearch />
        </div>
      </div>
    </header>
  )
}
