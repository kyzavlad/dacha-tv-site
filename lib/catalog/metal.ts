// Metal-profile products are a hand-managed, inquiry-only catalog line (never
// add-to-cart). This module centralizes detection + the structured attribute
// schema so the dedicated metal editor and its server action agree. Pure helpers
// → unit-testable.

export const METAL_CATEGORY_SLUG = 'metaloprofil-pokrivlia-komplektuiuchi'

// Metal mode when EITHER the explicit lead_type is 'metal' OR the row lives in
// the metal-profile category. Either signal is sufficient.
export function isMetalProduct(p: { lead_type?: string | null; category_slug?: string | null } | null | undefined): boolean {
  if (!p) return false
  return p.lead_type === 'metal' || p.category_slug === METAL_CATEGORY_SLUG
}

export interface MetalAttrField {
  field: string   // form input name
  key: string     // attributes[] key (human Ukrainian so it renders generically)
  label: string   // editor label
  placeholder?: string
}

// Known structured metal characteristics. Everything else stays in the raw
// attributes JSON ("Advanced").
export const METAL_ATTR_FIELDS: MetalAttrField[] = [
  { field: 'metal_profile', key: 'Профіль', label: 'Профіль / тип', placeholder: 'напр. Монтеррей' },
  { field: 'metal_thickness', key: 'Товщина', label: 'Товщина', placeholder: 'напр. 0.45 мм' },
  { field: 'metal_coating', key: 'Покриття', label: 'Покриття', placeholder: 'напр. поліестер' },
  { field: 'metal_color', key: 'Колір', label: 'Колір', placeholder: 'напр. RAL 8017' },
  { field: 'metal_width_total', key: 'Загальна ширина', label: 'Загальна ширина', placeholder: 'напр. 1180 мм' },
  { field: 'metal_width_useful', key: 'Корисна ширина', label: 'Корисна ширина', placeholder: 'напр. 1100 мм' },
  { field: 'metal_length', key: 'Довжина', label: 'Довжина / під замовлення', placeholder: 'напр. під замовлення' },
  { field: 'metal_manufacturer', key: 'Виробник', label: 'Виробник', placeholder: 'напр. Arcelor' },
]

// Merge an advanced base object with the structured values. A non-empty
// structured value overrides its key; an empty one removes that key. Pure.
export function buildMetalAttributes(
  base: Record<string, unknown>,
  structured: Record<string, string | null | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const f of METAL_ATTR_FIELDS) {
    const v = (structured[f.field] ?? '').trim()
    if (v) out[f.key] = v
    else delete out[f.key]
  }
  return out
}

// Read structured field default values back out of an existing attributes object
// (for the editor's controls).
export function metalAttrDefaults(attributes: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const a = attributes ?? {}
  for (const f of METAL_ATTR_FIELDS) {
    const v = a[f.key]
    out[f.field] = v == null ? '' : String(v)
  }
  return out
}
