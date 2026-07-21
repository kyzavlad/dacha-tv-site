// ─── Manual-section translations (honey/apiary/beekeeper/flower/service/static) ─
// Reads RU/EN rows from `manual_content_translations` (migration v5). The base
// records keep their Ukrainian columns; this is additive enrichment with an
// intentional Ukrainian fallback. `resolveManualField` is PURE (unit-testable).

import { createClient } from '@supabase/supabase-js'
import type { Locale } from '@/lib/i18n'

export type ManualEntityType =
  | 'honey_product' | 'apiary_product' | 'beekeeper_product'
  | 'flower_product' | 'service' | 'static'

export interface ManualTranslationRow {
  entity_type: ManualEntityType
  entity_id: string
  locale: string
  name?: string | null
  short_description?: string | null
  description?: string | null
  seo_title?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  image_alt?: string | null
}

// PURE: pick the localized value for a field, falling back to the Ukrainian base
// value when there is no translation (or the locale is Ukrainian). Never returns
// an empty string when the base has content.
export function resolveManualField(
  baseUk: string | null | undefined,
  translation: ManualTranslationRow | null | undefined,
  field: keyof Pick<ManualTranslationRow, 'name' | 'short_description' | 'description' | 'seo_title' | 'seo_description' | 'seo_keywords' | 'image_alt'>,
  locale: Locale,
): string {
  const base = (baseUk ?? '').trim()
  if (locale === 'uk' || !translation) return base
  const t = (translation[field] ?? '').toString().trim()
  return t || base
}

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// Batch-load translations for a set of entities of one type + locale. Returns a
// Map keyed by entity_id. Never throws — returns an empty Map on any failure so
// the storefront always degrades to Ukrainian.
export async function getManualTranslations(
  entityType: ManualEntityType,
  entityIds: string[],
  locale: Locale,
): Promise<Map<string, ManualTranslationRow>> {
  const out = new Map<string, ManualTranslationRow>()
  if (locale === 'uk' || entityIds.length === 0) return out
  const client = anonClient()
  if (!client) return out
  try {
    const { data } = await client
      .from('manual_content_translations')
      .select('entity_type, entity_id, locale, name, short_description, description, seo_title, seo_description, seo_keywords, image_alt')
      .eq('entity_type', entityType)
      .eq('locale', locale)
      .in('entity_id', entityIds)
    for (const row of (data as ManualTranslationRow[] | null) ?? []) out.set(row.entity_id, row)
  } catch { /* degrade to Ukrainian */ }
  return out
}
