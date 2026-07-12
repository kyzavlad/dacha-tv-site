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

// Canonical single honey price (UAH / 1 L). The admin-entered DB price is
// authoritative — honey now has ONE price, written to both legacy price fields,
// so display and cart never drift. When both fields are set they are equal; we
// still prefer the plastic (base) field, then glass, for backward compatibility
// with older rows. Only when no DB price exists do we fall back to the legacy
// slug/variety map and the flat default.
export function honeyUnitPriceUah(product: HoneyPriceInput): number {
  const plastic = typeof product.price_plastic_uah === 'number' ? product.price_plastic_uah : null
  const glass = typeof product.price_glass_uah === 'number' ? product.price_glass_uah : null
  const dbPrice = plastic != null && plastic > 0 ? plastic : glass != null && glass > 0 ? glass : null
  if (dbPrice != null) return dbPrice

  if (product.slug && HONEY_PRICE_BY_SLUG[product.slug] != null) {
    return HONEY_PRICE_BY_SLUG[product.slug]
  }
  const v = (product.variety ?? '').toLowerCase()
  if (v.includes('акац')) return 600          // акація
  if (v.includes('лип')) return 600           // липа
  if (v.includes('соня') || v.includes('сонях')) return 300 // соняшник
  return HONEY_PRICE_DEFAULT
}
