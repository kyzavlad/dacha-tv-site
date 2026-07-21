// Pure helpers for the admin catalog editors. Kept OUT of the 'use server'
// action files (which may only export async actions) so they can be unit-tested.

export interface RuFields {
  meta_title: string | null
  meta_description: string | null
  description: string | null
  seo_keywords: string | null
  h1?: string | null
}

// Whether the RU translation row should be UPSERTed or explicitly CLEARed.
// All-empty inputs mean the admin cleared the RU translation → delete the row
// rather than silently leaving stale content behind.
export function ruTranslationIntent(f: RuFields): 'upsert' | 'clear' {
  const anySet = [f.meta_title, f.meta_description, f.description, f.seo_keywords, f.h1]
    .some((v) => v != null && String(v).trim() !== '')
  return anySet ? 'upsert' : 'clear'
}

// Full localized product-translation field set (any locale). name /
// short_description / seo_description extend the SEO-only fields above so the
// metal editor can carry a complete RU/EN translation, not just SEO metadata.
export interface ProductTranslationFields {
  name: string | null
  short_description: string | null
  description: string | null
  seo_description: string | null
  meta_title: string | null
  meta_description: string | null
  seo_keywords: string | null
}

// Upsert vs clear for a full translation row: any non-empty field → upsert.
export function translationIntent(f: ProductTranslationFields): 'upsert' | 'clear' {
  const anySet = Object.values(f).some((v) => v != null && String(v).trim() !== '')
  return anySet ? 'upsert' : 'clear'
}

// Build the post-save redirect query. NEVER report success when a write failed.
export function editorRedirectQuery(opts: { error?: boolean; warn?: string | null }): string {
  if (opts.error) return '?error=1'
  const params = new URLSearchParams({ saved: '1' })
  if (opts.warn) params.set('warn', opts.warn)
  return `?${params.toString()}`
}
