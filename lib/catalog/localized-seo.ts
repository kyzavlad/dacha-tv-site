// ─── Localized SEO resolution ─────────────────────────────────────────────────
// Resolves the SEO fields to render for a given locale:
//   • 'uk'      → the existing Ukrainian columns on catalog_products/categories.
//   • 'ru'/'en' → the matching row in catalog_product/category_translations,
//                 falling back per-field to the Ukrainian value when the
//                 translation is missing or blank.
// `localized` is TRUE only when a translation row actually contributed content —
// so a page that merely falls back to Ukrainian is never mislabelled as localized.

import type { Locale } from '@/lib/i18n'
import { collapse } from '@/lib/catalog/seo-validate'

export interface ResolvedSeo {
  meta_title: string | null
  meta_description: string | null
  description: string | null
  h1: string | null
  seo_keywords: string | null
  faq_json: unknown
  localized: boolean
}

// Ukrainian source (subset of catalog_products / catalog_categories).
export interface UaSeoSource {
  meta_title?: string | null
  meta_description?: string | null
  description_ua?: string | null
  h1?: string | null
  seo_keywords?: string | null
  faq_json?: unknown
}

// A translation row (catalog_product/category_translations).
export interface TranslationSource {
  meta_title?: string | null
  meta_description?: string | null
  description?: string | null
  h1?: string | null
  seo_keywords?: string | null
  faq_json?: unknown
  seo_status?: string | null
}

const nz = (s: string | null | undefined): string | null => (collapse(s) ? (s as string) : null)

function uaResolved(ua: UaSeoSource): ResolvedSeo {
  return {
    meta_title: nz(ua.meta_title),
    meta_description: nz(ua.meta_description),
    description: nz(ua.description_ua),
    h1: nz(ua.h1),
    seo_keywords: nz(ua.seo_keywords),
    faq_json: ua.faq_json ?? null,
    localized: false,
  }
}

// Per-field: prefer the translation value, else fall back to Ukrainian.
function localizedResolve(ua: UaSeoSource, tx: TranslationSource): ResolvedSeo {
  const faqTx = Array.isArray(tx.faq_json) && tx.faq_json.length > 0 ? tx.faq_json : null
  const contributed =
    !!nz(tx.meta_title) || !!nz(tx.meta_description) || !!nz(tx.description) ||
    !!nz(tx.h1) || !!nz(tx.seo_keywords) || !!faqTx
  return {
    meta_title: nz(tx.meta_title) ?? nz(ua.meta_title),
    meta_description: nz(tx.meta_description) ?? nz(ua.meta_description),
    description: nz(tx.description) ?? nz(ua.description_ua),
    h1: nz(tx.h1) ?? nz(ua.h1),
    seo_keywords: nz(tx.seo_keywords) ?? nz(ua.seo_keywords),
    faq_json: faqTx ?? ua.faq_json ?? null,
    // Localized only when the translation row actually contributed content.
    localized: contributed,
  }
}

export function resolveProductSeo(locale: Locale, ua: UaSeoSource, tx?: TranslationSource | null): ResolvedSeo {
  if (locale === 'uk' || !tx) return uaResolved(ua)
  return localizedResolve(ua, tx)
}

export function resolveCategorySeo(locale: Locale, ua: UaSeoSource, tx?: TranslationSource | null): ResolvedSeo {
  if (locale === 'uk' || !tx) return uaResolved(ua)
  return localizedResolve(ua, tx)
}
