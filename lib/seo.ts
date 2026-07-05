import type { Metadata } from 'next'
import { LOCALES, HREFLANG, DEFAULT_LOCALE, localizedPath, type Locale } from '@/lib/i18n'

export const SITE_NAME = 'Дача TV'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'

// Build canonical + hreflang alternates for a page, given the ACTIVE locale and
// the canonical (uk, prefix-less) path. The canonical self-references the active
// locale's URL; `languages` lists every locale plus x-default (→ uk), so each
// localized page references itself and the others (Google hreflang requirement).
export function buildAlternates(locale: Locale, canonicalPath: string): {
  canonical: string
  languages: Record<string, string>
} {
  const abs = (loc: Locale) => `${SITE_URL}${localizedPath(loc, canonicalPath)}`
  const languages: Record<string, string> = {}
  for (const loc of LOCALES) languages[HREFLANG[loc]] = abs(loc)
  languages['x-default'] = abs(DEFAULT_LOCALE)
  return { canonical: abs(locale), languages }
}

// Strip any trailing brand suffix an admin / CSV may have baked into a meta_title
// (e.g. "Медовий шоколад | Дача TV" → "Медовий шоколад"). The document <title>
// template and og:site_name add the brand once, cleanly — this prevents the
// duplicated "Dachatv … | Дача TV" social preview.
export function stripBrand(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/\s*[|–—-]\s*Дача\s*TV\s*$/i, '')
    .replace(/^\s*Дача\s*TV\s*[|–—-]\s*/i, '')
    .replace(/^\s*Dachatv\s*[|–—-]?\s*/i, '')
    .trim()
}

// Resolve a possibly-relative image path to an absolute URL for social crawlers.
export function absoluteUrl(path: string | null | undefined): string {
  if (!path) return `${SITE_URL}/images/dacha-tv/logo-square.png`
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

// Build a clean, non-duplicated Metadata object for a product/category page.
// - `title` (bare, no brand) feeds the document template "%s | Дача TV" once.
// - openGraph/twitter titles are the bare name; og:site_name carries the brand.
export function buildSocialMetadata(opts: {
  bareTitle: string
  description: string
  canonical: string
  image?: string | null
  imageAlt?: string
  // Optional hreflang map (from buildAlternates). When present it is emitted as
  // <link rel="alternate" hreflang=…>. Omitting it keeps the previous behaviour.
  languages?: Record<string, string>
}): Metadata {
  const title = stripBrand(opts.bareTitle) || SITE_NAME
  const image = absoluteUrl(opts.image)
  const imageAlt = opts.imageAlt || title

  return {
    title,
    description: opts.description,
    alternates: opts.languages
      ? { canonical: opts.canonical, languages: opts.languages }
      : { canonical: opts.canonical },
    openGraph: {
      title,
      description: opts.description,
      siteName: SITE_NAME,
      type: 'website',
      url: opts.canonical,
      images: [{ url: image, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: opts.description,
      images: [image],
    },
  }
}
