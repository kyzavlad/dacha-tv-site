// UI string dictionary for shared chrome (nav, header, footer, switcher). Keyed
// by the stable canonical href / string id so header, mobile menu and footer stay
// in sync. Ukrainian is the intentional fallback when a translation is missing.
// No server-only imports → safe to use from client components.

import type { Locale } from './i18n'

// Primary + secondary nav labels, keyed by href.
const NAV_LABELS: Record<string, Partial<Record<Locale, string>>> = {
  '/catalog': { uk: 'Магазин', ru: 'Магазин', en: 'Shop' },
  '/products': { uk: 'Продукти', ru: 'Продукты', en: 'Products' },
  '/flowers': { uk: 'Квіти', ru: 'Цветы', en: 'Flowers' },
  '/lavender': { uk: 'Лаванда', ru: 'Лаванда', en: 'Lavender' },
  '/services': { uk: 'Послуги', ru: 'Услуги', en: 'Services' },
  '/beekeeper': { uk: 'Пасічникам', ru: 'Пчеловодам', en: 'For beekeepers' },
  '/about': { uk: 'Про нас', ru: 'О нас', en: 'About' },
  '/contact': { uk: 'Контакти', ru: 'Контакты', en: 'Contact' },
  '/delivery': { uk: 'Доставка', ru: 'Доставка', en: 'Delivery' },
  '/delivery#payment': { uk: 'Оплата', ru: 'Оплата', en: 'Payment' },
  '/faq': { uk: 'FAQ', ru: 'FAQ', en: 'FAQ' },
  '/privacy': { uk: 'Політика конфіденційності', ru: 'Политика конфиденциальности', en: 'Privacy policy' },
}

// Localize a nav item's label, falling back to the provided Ukrainian label.
export function navLabel(href: string, locale: Locale, fallbackUa: string): string {
  return NAV_LABELS[href]?.[locale] ?? NAV_LABELS[href]?.uk ?? fallbackUa
}

// General shared-chrome UI strings.
const UI: Record<string, Record<Locale, string>> = {
  languageLabel: { uk: 'Мова', ru: 'Язык', en: 'Language' },
  languageAria: { uk: 'Мова сайту', ru: 'Язык сайта', en: 'Site language' },
  footerNav: { uk: 'Навігація', ru: 'Навигация', en: 'Navigation' },
  footerInfo: { uk: 'Інформація', ru: 'Информация', en: 'Information' },
  footerContacts: { uk: 'Контакти', ru: 'Контакты', en: 'Contacts' },
  search: { uk: 'Пошук', ru: 'Поиск', en: 'Search' },
  menu: { uk: 'Меню', ru: 'Меню', en: 'Menu' },
}

export function ui(key: keyof typeof UI, locale: Locale): string {
  return UI[key]?.[locale] ?? UI[key]?.uk ?? String(key)
}

// Short label shown on the compact switcher button per locale.
export const LOCALE_SHORT: Record<Locale, string> = { uk: 'UA', ru: 'RU', en: 'EN' }
export const LOCALE_FLAG: Record<Locale, string> = { uk: '🇺🇦', ru: '🇷🇺', en: '🇬🇧' }
