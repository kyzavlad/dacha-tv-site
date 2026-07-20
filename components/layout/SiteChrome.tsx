'use client'

import { usePathname } from 'next/navigation'

// Route-aware public chrome. The admin console (/admin/*) provides its own layout
// and must NOT show the public Header, Footer, CartDrawer or language switcher.
// `usePathname()` resolves during SSR, so the admin branch is chosen server-side
// too — no hydration flicker. `initialIsAdmin` (from a request header) is a
// belt-and-braces fallback for the very first paint.
export function SiteChrome({
  header, footer, cartDrawer, attribution, initialIsAdmin = false, children,
}: {
  header: React.ReactNode
  footer: React.ReactNode
  cartDrawer: React.ReactNode
  attribution: React.ReactNode
  initialIsAdmin?: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isAdmin = pathname ? (pathname === '/admin' || pathname.startsWith('/admin/')) : initialIsAdmin

  if (isAdmin) return <>{children}</>

  return (
    <>
      {attribution}
      {header}
      {cartDrawer}
      <main className="flex-1">{children}</main>
      {footer}
    </>
  )
}
