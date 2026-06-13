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
  { href: '/services', label: 'Послуги' },
  { href: '/beekeeper', label: 'Пасічникам' },
  { href: '/about', label: 'Про нас' },
  { href: '/contact', label: 'Контакти' },
]

// Secondary links shown only in the footer (policy / info pages).
export const FOOTER_SECONDARY_NAV: NavItem[] = [
  { href: '/delivery', label: 'Доставка' },
  { href: '/delivery', label: 'Оплата' },
  { href: '/faq', label: 'FAQ' },
  { href: '/privacy', label: 'Політика конфіденційності' },
]
