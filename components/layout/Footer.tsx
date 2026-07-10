import Link from 'next/link'
import Image from 'next/image'
import { existsSync } from 'fs'
import { join } from 'path'
import { PhoneLink } from '@/components/shared/PhoneLink'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { PRIMARY_NAV, FOOTER_SECONDARY_NAV } from '@/lib/navigation'
import {
  LAUNCH_PHONE,
  LAUNCH_PHONE_SECONDARY,
  LAUNCH_ADDRESS,
  LAUNCH_YOUTUBE_URL,
  LAUNCH_FACEBOOK_URL,
  LAUNCH_INSTAGRAM_URL,
  LAUNCH_TIKTOK_URL,
  LAUNCH_LOGO_PATH,
} from '@/lib/launch-defaults'
import type { SiteSettings } from '@/types'

const LOGO_PATH = LAUNCH_LOGO_PATH

interface FooterProps {
  siteSettings: SiteSettings | null
}

function YouTubeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  )
}

function TelegramIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

export function Footer({ siteSettings }: FooterProps) {
  const phone = siteSettings?.phone || LAUNCH_PHONE
  const phoneSecondary = siteSettings?.phone_secondary || LAUNCH_PHONE_SECONDARY
  const address = siteSettings?.address_full || LAUNCH_ADDRESS
  const currentYear = new Date().getFullYear()
  const hasLogo = existsSync(join(process.cwd(), 'public', LOGO_PATH))

  const socials = [
    { url: siteSettings?.youtube_url || LAUNCH_YOUTUBE_URL, Icon: YouTubeIcon, label: 'YouTube' },
    { url: siteSettings?.facebook_url || LAUNCH_FACEBOOK_URL, Icon: FacebookIcon, label: 'Facebook' },
    { url: siteSettings?.instagram_url || LAUNCH_INSTAGRAM_URL, Icon: InstagramIcon, label: 'Instagram' },
    { url: siteSettings?.tiktok_url || LAUNCH_TIKTOK_URL, Icon: TikTokIcon, label: 'TikTok' },
    ...(siteSettings?.telegram_url ? [{ url: siteSettings.telegram_url, Icon: TelegramIcon, label: 'Telegram' }] : []),
  ]

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8 mb-12">
          {/* Brand column */}
          <div className="md:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 hover:opacity-80 transition-opacity mb-3"
            >
              {hasLogo && (
                <Image
                  src={LOGO_PATH}
                  alt="Дача TV"
                  width={36}
                  height={36}
                  className="w-9 h-9 object-contain"
                />
              )}
              <span className="font-serif font-bold text-2xl text-bark">Дача TV</span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              Натуральні продукти, товари для господарства та корисні рішення для дому.
              Мед і продукти пасіки, квіти, лаванда, металопрофіль і магазин — напряму від
              виробників та партнерів.
            </p>

            {/* Social icons — circular border style */}
            <div className="flex items-center gap-2 flex-wrap">
              {socials.map(({ url, Icon, label }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:text-bark hover:border-bark transition-all"
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Navigation column — same primary nav as the header */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Навігація
            </h3>
            <nav className="flex flex-col gap-2.5" aria-label="Нижнє меню">
              {PRIMARY_NAV.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-sm text-gray-600 hover:text-bark transition-colors"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Info column */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Інформація
            </h3>
            <nav className="flex flex-col gap-2.5" aria-label="Інформація">
              {FOOTER_SECONDARY_NAV.map(({ href, label }) => (
                <Link
                  key={label}
                  href={href}
                  className="text-sm text-gray-600 hover:text-bark transition-colors"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Contact column */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Контакти
            </h3>
            <div className="space-y-4">
              <div>
                <PhoneLink
                  phone={phone}
                  showIcon
                  className="text-bark font-semibold text-base hover:text-honey-700 transition-colors"
                />
              </div>
              <div>
                <PhoneLink
                  phone={phoneSecondary}
                  showIcon
                  className="text-bark font-semibold text-base hover:text-honey-700 transition-colors"
                />
              </div>
              <address className="text-sm text-gray-500 not-italic leading-relaxed">
                {address}
              </address>
              {siteSettings?.telegram_url && (
                <a
                  href={siteSettings.telegram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-bark transition-colors"
                >
                  <TelegramIcon />
                  Написати в Telegram
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-100 pt-8 space-y-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <p className="text-xs text-gray-400">
              © {currentYear} Дача TV. ФОП Кузьменко Владислав Сергійович · Україна
            </p>
            <div className="flex items-center gap-4">
              <Link href="/delivery" className="text-xs text-gray-400 hover:text-bark transition-colors">
                Оплата та доставка
              </Link>
              <Link href="/privacy" className="text-xs text-gray-400 hover:text-bark transition-colors">
                Конфіденційність
              </Link>
            </div>
          </div>
          <div className="pt-1">
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  )
}
