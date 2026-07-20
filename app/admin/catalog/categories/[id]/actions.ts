'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { autoSlug } from '@/lib/catalog/csv-utils'
import { deterministicCategoryIntro, isFallbackFillAllowed } from '@/lib/catalog/category-fallback'
import { ruTranslationIntent, editorRedirectQuery } from '@/lib/admin/editor-forms'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

type AdminClient = ReturnType<typeof getAdminClient>

function str(fd: FormData, key: string): string { return String(fd.get(key) ?? '').trim() }
function strOrNull(fd: FormData, key: string): string | null { const v = str(fd, key); return v === '' ? null : v }
function intOr(fd: FormData, key: string, fallback: number): number {
  const v = str(fd, key); if (v === '') return fallback
  const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback
}
function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key); return v === 'on' || v === 'true' || v === '1'
}

async function uniqueCategorySlug(client: AdminClient, base: string, selfId: string): Promise<string> {
  const clean = autoSlug(base)
  for (let n = 0; n <= 999; n++) {
    const candidate = n === 0 ? clean : `${clean}-${n + 1}`
    const { data } = await client
      .from('catalog_categories').select('id').eq('slug', candidate).neq('id', selfId).maybeSingle()
    if (!data) return candidate
  }
  return `${clean}-${selfId.slice(0, 8)}`
}

// Update one catalog_categories row + its RU translation. Preserves the public
// mapping: `description` = short intro (card + above grid), `description_ua` =
// long SEO body (below grid). Slug is collision-protected against other rows.
export async function updateCatalogCategoryAction(categoryId: string, fd: FormData): Promise<void> {
  const client = getAdminClient()

  const nameUa = str(fd, 'name_ua') || 'Без назви'
  const slug = await uniqueCategorySlug(client, str(fd, 'slug') || nameUa, categoryId)

  // A hand-edited description is authoritative → clear the auto-generated marker.
  const { error: baseError } = await client.from('catalog_categories').update({
    name_ua: nameUa,
    slug,
    description: strOrNull(fd, 'description'),        // SHORT intro
    description_ua: strOrNull(fd, 'description_ua'),  // LONG SEO body
    description_auto_generated: false,
    image_url: strOrNull(fd, 'image_url'),
    meta_title: strOrNull(fd, 'meta_title'),
    meta_description: strOrNull(fd, 'meta_description'),
    seo_keywords: strOrNull(fd, 'seo_keywords'),
    is_published: bool(fd, 'is_published'),
    display_order: intOr(fd, 'display_order', 0),
    seo_manual_lock: bool(fd, 'seo_manual_lock'),
    updated_at: new Date().toISOString(),
  }).eq('id', categoryId)
  if (baseError) {
    console.error('[admin:catalog:category] base update failed', { categoryId, code: baseError.code, message: baseError.message })
    redirect(`/admin/catalog/categories/${categoryId}${editorRedirectQuery({ error: true })}`)
  }

  // RU localized content → catalog_category_translations (never the UA columns).
  // Clearing all RU fields explicitly deletes the RU row.
  const ru = {
    meta_title: strOrNull(fd, 'ru_meta_title'),
    meta_description: strOrNull(fd, 'ru_meta_description'),
    description: strOrNull(fd, 'ru_description'),
    h1: strOrNull(fd, 'ru_h1'),
    seo_keywords: strOrNull(fd, 'ru_seo_keywords'),
  }
  if (ruTranslationIntent(ru) === 'upsert') {
    const { error } = await client.from('catalog_category_translations').upsert(
      { category_id: categoryId, locale: 'ru', ...ru, updated_at: new Date().toISOString() },
      { onConflict: 'category_id,locale' },
    )
    if (error) {
      console.error('[admin:catalog:category] RU upsert failed', { categoryId, code: error.code, message: error.message })
      redirect(`/admin/catalog/categories/${categoryId}${editorRedirectQuery({ error: true })}`)
    }
  } else {
    const { error } = await client.from('catalog_category_translations').delete().eq('category_id', categoryId).eq('locale', 'ru')
    if (error) {
      console.error('[admin:catalog:category] RU clear failed', { categoryId, code: error.code, message: error.message })
      redirect(`/admin/catalog/categories/${categoryId}${editorRedirectQuery({ error: true })}`)
    }
  }

  revalidatePath('/admin/catalog/categories')
  revalidatePath(`/admin/catalog/categories/${categoryId}`)
  revalidatePath('/catalog')
  revalidatePath(`/catalog/${slug}`)
  redirect(`/admin/catalog/categories/${categoryId}${editorRedirectQuery({})}`)
}

// Fill the SHORT intro (description) for PUBLISHED categories that have none,
// using a deterministic name-based fallback.
//
// ORDER OF PRIORITY: legacy content wins. This action is GATED behind
// LEGACY_MIGRATION_COMPLETE=true so a generated fallback can never be written
// before the legacy recovery has had its chance. Even after that, generated rows
// are marked description_auto_generated=true, so the legacy migrate tool may
// still replace them later — the fallback never blocks real restoration.
//
// Resource-safe + bounded: selects only the columns needed and writes in bulk
// chunks (upsert), never up to 2000 sequential UPDATEs. Never overwrites a
// non-empty description.
export async function fillEmptyCategoryIntrosAction(): Promise<void> {
  if (!isFallbackFillAllowed(process.env)) {
    redirect('/admin/catalog/categories?introsFilled=disabled')
  }

  const client = getAdminClient()
  // Need id + the two NOT-NULL columns (name_ua, slug) so a bulk upsert's insert
  // tuple is valid; the conflict path only updates description + marker.
  const { data: empties, error } = await client
    .from('catalog_categories')
    .select('id, name_ua, slug')
    .eq('is_published', true)
    .or('description.is.null,description.eq.')
    .limit(2000)
  if (error) {
    console.error('[admin:catalog:category] fill intros select failed', { code: error.code, message: error.message })
    redirect('/admin/catalog/categories?introsFilled=error')
  }

  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  for (const cat of empties ?? []) {
    const intro = deterministicCategoryIntro(cat.name_ua as string | null)
    if (!intro) continue
    rows.push({ id: cat.id, name_ua: cat.name_ua, slug: cat.slug, description: intro, description_auto_generated: true, updated_at: now })
  }

  let filled = 0
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error: upErr } = await client.from('catalog_categories').upsert(chunk, { onConflict: 'id' })
    if (upErr) {
      console.error('[admin:catalog:category] fill intros upsert failed', { code: upErr.code, message: upErr.message })
      redirect(`/admin/catalog/categories?introsFilled=error`)
    }
    filled += chunk.length
  }

  revalidatePath('/admin/catalog/categories')
  revalidatePath('/catalog')
  redirect(`/admin/catalog/categories?introsFilled=${filled}`)
}
