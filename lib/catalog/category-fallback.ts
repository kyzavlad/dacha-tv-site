// Deterministic, human-readable short intro for a catalog category, derived only
// from its real Ukrainian name. NO AI, NO network. Used to fill the SHORT intro
// (`catalog_categories.description`, shown on the card and above the grid) for
// published landing categories that have none — never the long SEO body, and
// never overwriting an existing (legacy) description.
//
// The text varies by the real category name, so categories do not end up with
// identical keyword-stuffed copy. Pure function → unit-testable.

export function deterministicCategoryIntro(nameUa: string | null | undefined): string {
  const name = (nameUa ?? '').trim().replace(/\s+/g, ' ')
  if (!name || /^\d+$/.test(name)) return ''
  // Normalise casing of an ALL-CAPS supplier name to sentence-ish form.
  const display = name === name.toUpperCase() && name.length > 3
    ? name.charAt(0) + name.slice(1).toLowerCase()
    : name
  return `Товари категорії «${display}» у наявності — доставка Новою Поштою по всій Україні.`
}

// Gate for the bulk fallback-fill action: legacy content must have first
// priority, so the deterministic fallback may only run once the legacy
// migration is confirmed complete. Pure so the gate itself is unit-testable
// without touching process.env from a test.
export function isFallbackFillAllowed(env: Record<string, string | undefined>): boolean {
  return env.LEGACY_MIGRATION_COMPLETE === 'true'
}

// A category name is "code-like" (not a real human name) when it is empty, a
// bare number, a supplier code (cat-123, id_42, c99…), or contains no run of ≥2
// letters at all. Used to (a) never publish/generate content from such names,
// and (b) drive the deterministic repair. Pure → unit-testable.
export function isCodeLikeCategoryName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim()
  if (!n) return true
  if (/^\d+$/.test(n)) return true                       // pure number: "123"
  if (/^(cat|category|categoria|id|c|k)[-_ ]?\d+$/i.test(n)) return true // "cat-123", "id_42", "c99"
  if (!/\p{L}{2,}/u.test(n)) return true                 // no 2+ consecutive letters anywhere
  return false
}

// Convenience inverse — a real, presentable human category name.
export function isValidHumanCategoryName(name: string | null | undefined): boolean {
  return !isCodeLikeCategoryName(name)
}
