// ─── Manual-section translations (honey/apiary/beekeeper/flower/service/static) ─
// Reads RU/EN rows from `manual_content_translations` (migration v5). The base
// records keep their Ukrainian columns; this is additive enrichment with an
// intentional Ukrainian fallback. `resolveManualField` is PURE (unit-testable).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { realtimeCompatOptions } from '@/lib/supabase/realtime-transport'
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

let _manualAnon: SupabaseClient | null = null
let _manualAnonKey = ''
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const cacheKey = `${url} ${key}`
  if (_manualAnon && _manualAnonKey === cacheKey) return _manualAnon
  _manualAnon = createClient(url, key, { ...realtimeCompatOptions() })
  _manualAnonKey = cacheKey
  return _manualAnon
}

// Localize a bounded list of hand-managed entities for cards/listings. Detail
// pages use the same rows field-by-field; this keeps list and detail language in
// sync and avoids the old "localized heading, Ukrainian product cards" state.
export async function localizeManualItems<T extends {
  id: string
  name: string
  short_description?: string | null
  description?: string | null
  full_description?: string | null
  image_alt?: string | null
}>(
  entityType: ManualEntityType,
  items: T[],
  locale: Locale,
): Promise<T[]> {
  if (locale === 'uk' || items.length === 0) return items
  const translations = await getManualTranslations(entityType, items.map((item) => item.id), locale)
  return items.map((item) => {
    const tx = translations.get(item.id)
    if (!tx) return item
    const name = resolveManualField(item.name, tx, 'name', locale)
    const shortDescription = resolveManualField(item.short_description, tx, 'short_description', locale)
    const description = resolveManualField(item.description ?? item.full_description, tx, 'description', locale)
    const imageAlt = resolveManualField(item.image_alt ?? item.name, tx, 'image_alt', locale)
    return {
      ...item,
      name,
      short_description: shortDescription || null,
      description: description || null,
      ...(Object.prototype.hasOwnProperty.call(item, 'full_description')
        ? { full_description: description || item.full_description || null }
        : {}),
      image_alt: imageAlt || name,
    }
  })
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
