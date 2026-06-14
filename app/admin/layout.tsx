import Link from 'next/link'

// Grouped, de-duplicated admin nav. "Заявки" (the inquiries/leads inbox) is
// renamed to "Вхідні заявки" so it reads as the lead inbox, and the unified
// shop catalog is "Каталог магазину" (was the ambiguous second "Продукти").
const NAV_LINKS = [
  { href: '/admin', label: 'Вхідні заявки' },
  { href: '/admin/orders', label: 'Замовлення' },
  { href: '/admin/bookings', label: 'Бронювання' },
  { href: '/admin/catalog', label: 'Каталог магазину' },
  { href: '/admin/catalog/pipeline', label: 'Пайплайн' },
  { href: '/admin/honey', label: 'Мед' },
  { href: '/admin/apiary', label: 'Продукти пасіки' },
  { href: '/admin/flowers', label: 'Квіти' },
  { href: '/admin/beekeeper', label: 'Пасічникам' },
  { href: '/admin/services', label: 'Послуги' },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-gray-900 text-white px-4 sm:px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-serif font-bold text-sm text-white">Дача TV</span>
          <span className="text-gray-500 text-xs">Адміністрування</span>
        </div>
        <a
          href="/api/admin/logout"
          className="text-xs text-gray-400 hover:text-white transition-colors h-8 px-3 flex items-center rounded-md hover:bg-gray-800"
        >
          Вийти
        </a>
      </div>

      {/* Nav */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <nav
          className="overflow-x-auto"
          aria-label="Адмін навігація"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          <div className="flex px-4 sm:px-6 min-w-max">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-4 py-3.5 text-sm font-medium text-gray-500 hover:text-gray-900 whitespace-nowrap transition-colors border-b-2 border-transparent hover:border-gray-400 min-h-[48px] flex items-center"
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      <div className="max-w-5xl mx-auto w-full">
        {children}
      </div>
    </div>
  )
}
