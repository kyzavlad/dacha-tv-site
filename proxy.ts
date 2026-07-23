import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildLocaleRewriteUrl } from '@/lib/locale-rewrite'
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session'
import { verifyCronAuth } from '@/app/api/admin/cron/_auth'

// Locale prefixes that map to the canonical (Ukrainian) route tree. Ukrainian is
// the default and carries no prefix. Kept in sync with lib/i18n PREFIXED_LOCALES.
const LOCALE_PREFIXES = new Set(['ru', 'en'])

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const firstSeg = pathname.split('/')[1]

  // ── Locale-prefixed public routes (/ru/*, /en/*) ────────────────────────────
  // Rewrite to the same canonical path (same slugs) and pass the locale to the
  // app via the x-dacha-locale REQUEST header so Server Components / metadata can
  // localize + emit hreflang. Ukrainian routes are untouched (no prefix).
  if (LOCALE_PREFIXES.has(firstSeg)) {
    const rest = pathname.slice(firstSeg.length + 1) || '/'

    // Admin and API are never localized — send to the canonical URL. This is
    // a browser-facing redirect, so it must always use the public request
    // origin (request.nextUrl), never INTERNAL_APP_ORIGIN — redirecting a
    // visitor's browser to an internal 127.0.0.1 address would be broken.
    if (rest.startsWith('/admin') || rest.startsWith('/api')) {
      const url = request.nextUrl.clone()
      url.pathname = rest
      return NextResponse.redirect(url)
    }

    // Self-hosted behind Nginx (TLS termination + X-Forwarded-*),
    // request.nextUrl reconstructs an https:// origin while the standalone
    // Node server only ever speaks plain HTTP on 127.0.0.1:3030 — rewriting
    // to that mismatched origin makes Next.js's internal fetch attempt TLS
    // against a plain-HTTP port ("wrong version number"), which is exactly
    // the 500 on every /ru/* and /en/* route. INTERNAL_APP_ORIGIN (set only
    // in the self-hosted deploy env) targets the known-good internal origin
    // instead; Vercel/local dev never set it, so their behavior — rewriting
    // against request.nextUrl's own origin — is unchanged. See
    // lib/locale-rewrite.ts for the full explanation.
    // @optional-env INTERNAL_APP_ORIGIN — unset on Vercel/local dev; required
    // only for the self-hosted deployment (see deploy/self-host/README.md).
    const target = buildLocaleRewriteUrl({
      canonicalPathname: rest,
      search: request.nextUrl.search,
      requestOrigin: request.nextUrl.origin,
      internalAppOrigin: process.env.INTERNAL_APP_ORIGIN,
    })
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-dacha-locale', firstSeg)
    return NextResponse.rewrite(target, { request: { headers: requestHeaders } })
  }

  // ── Admin API routes ─────────────────────────────────────────────────────
  // Explicit allowlist: login/logout must stay reachable to establish/clear a
  // session. Every other /api/admin/* route requires EITHER a valid signed
  // admin session cookie OR a valid CRON_SECRET (Authorization: Bearer /
  // x-cron-secret) — cron/n8n callers already send the latter and are
  // unaffected; each route handler still re-verifies its own CRON_SECRET
  // check independently as the final authority, this is a defense-in-depth
  // gate at the edge, not a replacement for it.
  if (pathname.startsWith('/api/admin')) {
    if (pathname === '/api/admin/login' || pathname === '/api/admin/logout') {
      return NextResponse.next()
    }
    if (verifyCronAuth(request)) {
      return NextResponse.next()
    }
    const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
    if (!(await verifyAdminSessionToken(sessionToken))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // ── Admin pages ──────────────────────────────────────────────────────────
  if (pathname === '/admin/login') {
    return NextResponse.next()
  }
  if (pathname.startsWith('/admin')) {
    const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
    if (!(await verifyAdminSessionToken(sessionToken))) {
      const loginUrl = new URL('/admin/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
    // Flag the admin section so the root layout suppresses public chrome
    // (Header/Footer/CartDrawer/LanguageSwitcher) server-side without flicker.
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-dacha-section', 'admin')
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  return NextResponse.next()
}

export const config = {
  // Run on /ru and /en (any depth) for locale rewrites, on /admin for page
  // auth, and on /api/admin for API auth. Everything else (including
  // /_next static assets) is skipped for performance.
  matcher: ['/ru', '/ru/:path*', '/en', '/en/:path*', '/admin/:path*', '/api/admin/:path*'],
}
