// Single source of truth for honey unit prices (UAH per 1 L).
//
// The business price list is fixed by sort, so display must never show stale or
// duplicated hardcoded values (e.g. an old 500). Every honey price display
// (homepage cards, /honey listing, /honey/[slug]) reads from here. The DB
// migration (054) keeps honey_products in sync for admin/order purposes, but the
// public display derives the canonical price from this map so it is always
// correct regardless of DB drift.

export const HONEY_PRICE_BY_SLUG: Record<string, number> = {
  'acacia-honey': 600,
  'linden-honey': 600,
  'sunflower-honey': 300,
}

// All other honey sorts.
export const HONEY_PRICE_DEFAULT = 400

interface HoneyPriceInput {
  slug?: string | null
  variety?: string | null
  price_plastic_uah?: number | null
  price_glass_uah?: number | null
}

// Canonical honey price (UAH / 1 L). Matches by slug, then by variety keyword,
// then falls back to the flat "other sorts" price.
export function honeyUnitPriceUah(product: HoneyPriceInput): number {
  if (product.slug && HONEY_PRICE_BY_SLUG[product.slug] != null) {
    return HONEY_PRICE_BY_SLUG[product.slug]
  }
  const v = (product.variety ?? '').toLowerCase()
  if (v.includes('акац')) return 600          // акація
  if (v.includes('лип')) return 600           // липа
  if (v.includes('соня') || v.includes('сонях')) return 300 // соняшник
  return HONEY_PRICE_DEFAULT
}
