// ─── Multilingual foundation (uk default, ru + en locale-prefixed) ────────────
// Ukrainian is the canonical default and is served WITHOUT a prefix (existing
// routes unchanged). Russian and English are served under /ru and /en, which the
// proxy (proxy.ts) rewrites to the canonical path while passing the locale to the
// app via the `x-dacha-locale` request header. No translated slugs yet — the same
// product/category slugs are reused across locales.

export const LOCALES = ['uk', 'ru', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'uk'
// Locales that carry a URL prefix (the default has none).
export const PREFIXED_LOCALES = ['ru', 'en'] as const

// ── Launch gate: which locales are PUBLICLY exposed right now ─────────────────
// EN is temporarily disabled for launch (its dictionaries stay in code for a
// future phase — see LOCALE_LABELS/HREFLANG below, which still list all three).
// PUBLIC_LOCALES is the single source of truth for what the public sees:
//   • the LanguageSwitcher only offers these,
//   • hreflang/alternate links only advertise these (lib/seo buildAlternates),
//   • proxy.ts permanently redirects any disabled-locale prefix (/en, /en/*) to
//     the canonical UA path.
// To re-enable EN later, add 'en' back here (and to proxy.ts's rewrite set) —
// no dictionary or page code has to change.
export const PUBLIC_LOCALES = ['uk', 'ru'] as const
export type PublicLocale = (typeof PUBLIC_LOCALES)[number]

export function isPublicLocale(x: unknown): x is PublicLocale {
  return typeof x === 'string' && (PUBLIC_LOCALES as readonly string[]).includes(x)
}

// Locale prefixes still served (rewritten) publicly — the prefixed subset of
// PUBLIC_LOCALES. EN is intentionally absent so proxy.ts redirects it away.
export const PUBLIC_PREFIXED_LOCALES = PREFIXED_LOCALES.filter((l) => isPublicLocale(l))

export const LOCALE_LABELS: Record<Locale, string> = {
  uk: 'Українська',
  ru: 'Русский',
  en: 'English',
}

// hreflang codes emitted in <link rel="alternate">. Simple language codes are
// enough while slugs are shared and there is a single regional variant each.
export const HREFLANG: Record<Locale, string> = { uk: 'uk', ru: 'ru', en: 'en' }

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x)
}

// Split a pathname into its locale + the canonical (prefix-less) path.
//   '/ru/catalog/all' → { locale: 'ru', path: '/catalog/all' }
//   '/catalog'        → { locale: 'uk', path: '/catalog' }
//   '/ru'             → { locale: 'ru', path: '/' }
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const seg = pathname.split('/')[1]
  if (seg === 'ru' || seg === 'en') {
    const rest = pathname.slice(seg.length + 1)
    return { locale: seg, path: rest === '' ? '/' : rest }
  }
  return { locale: DEFAULT_LOCALE, path: pathname || '/' }
}

// Prefix a canonical (uk) path for a target locale.
//   ('ru', '/catalog') → '/ru/catalog'   ('uk', '/catalog') → '/catalog'
export function localizedPath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (locale === DEFAULT_LOCALE) return clean
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`
}

// Paths that must NEVER be localized — the admin console and the API. The proxy
// already redirects /ru/admin and /ru/api back to canonical; this keeps the
// switcher from ever offering a prefixed admin/api URL in the first place.
export function isLocalizablePath(path: string): boolean {
  return !(path === '/admin' || path.startsWith('/admin/') || path === '/api' || path.startsWith('/api/'))
}

// Build the href that switches the CURRENT location to `target`. It strips any
// existing locale prefix first (so repeated switching never double-prefixes),
// re-prefixes for the target (uk = no prefix), and PRESERVES the query string.
// Non-localizable paths (/admin, /api) are returned canonical + query unchanged.
//   ('ru', '/catalog/x', 'sort=price') → '/ru/catalog/x?sort=price'
//   ('uk', '/ru/catalog/x')            → '/catalog/x'
//   ('ru', '/admin/orders')            → '/admin/orders'
export function switchLocaleHref(target: Locale, pathname: string, query = ''): string {
  const { path } = splitLocale(pathname)
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : ''
  if (!isLocalizablePath(path)) return `${path}${q}`
  return `${localizedPath(target, path)}${q}`
}

// Read the active locale inside a Server Component / generateMetadata. The proxy
// sets `x-dacha-locale` on the request for /ru and /en; absent → uk (default).
// Reading headers marks the caller dynamic — only use in already-dynamic routes.
export async function getRequestLocale(): Promise<Locale> {
  try {
    const { headers } = await import('next/headers')
    const h = await headers()
    const l = h.get('x-dacha-locale')
    return isLocale(l) ? l : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}
