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
