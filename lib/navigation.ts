// Single source of truth for the primary site navigation — shared by the header
// (desktop + mobile) and the footer so they never drift apart.

export interface NavItem {
  href: string
  label: string
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/catalog', label: 'Магазин' },
  { href: '/products', label: 'Продукти' },
  { href: '/flowers', label: 'Квіти' },
  { href: '/lavender', label: 'Лаванда' },
  { href: '/services', label: 'Послуги' },
  { href: '/beekeeper', label: 'Пасічникам' },
  { href: '/about', label: 'Про нас' },
  { href: '/contact', label: 'Контакти' },
]

// Secondary links shown only in the footer (policy / info pages). Keep commerce
// policies explicit and individually addressable so customers and Merchant
// Center crawlers never have to infer them from a generic FAQ page.
export const FOOTER_SECONDARY_NAV: NavItem[] = [
  { href: '/delivery', label: 'Доставка' },
  { href: '/delivery#payment', label: 'Оплата' },
  { href: '/returns', label: 'Повернення та обмін' },
  { href: '/faq', label: 'FAQ' },
  { href: '/privacy', label: 'Політика конфіденційності' },
]
