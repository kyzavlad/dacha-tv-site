import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Locale prefixes that map to the canonical (Ukrainian) route tree. Ukrainian is
// the default and carries no prefix. Kept in sync with lib/i18n PREFIXED_LOCALES.
const LOCALE_PREFIXES = new Set(['ru', 'en'])

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const firstSeg = pathname.split('/')[1]

  // ── Locale-prefixed public routes (/ru/*, /en/*) ────────────────────────────
  // Rewrite to the same canonical path (same slugs) and pass the locale to the
  // app via the x-dacha-locale REQUEST header so Server Components / metadata can
  // localize + emit hreflang. Ukrainian routes are untouched (no prefix).
  if (LOCALE_PREFIXES.has(firstSeg)) {
    const rest = pathname.slice(firstSeg.length + 1) || '/'

    // Admin and API are never localized — send to the canonical URL.
    if (rest.startsWith('/admin') || rest.startsWith('/api')) {
      const url = request.nextUrl.clone()
      url.pathname = rest
      return NextResponse.redirect(url)
    }

    const url = request.nextUrl.clone()
    url.pathname = rest
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-dacha-locale', firstSeg)
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
  }

  // ── Admin auth (unchanged) ──────────────────────────────────────────────────
  if (pathname === '/admin/login' || pathname.startsWith('/api/admin')) {
    return NextResponse.next()
  }
  if (pathname.startsWith('/admin')) {
    const session = request.cookies.get('admin_session')
    if (session?.value !== '1') {
      const loginUrl = new URL('/admin/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  // Run on /ru and /en (any depth) for locale rewrites, and on /admin for auth.
  // Everything else (including /_next static assets) is skipped for performance.
  matcher: ['/ru', '/ru/:path*', '/en', '/en/:path*', '/admin/:path*'],
}
