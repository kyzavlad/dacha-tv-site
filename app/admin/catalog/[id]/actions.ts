'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { autoSlug } from '@/lib/catalog/csv-utils'
import { ruTranslationIntent, editorRedirectQuery } from '@/lib/admin/editor-forms'
import { buildMetalAttributes, METAL_ATTR_FIELDS, METAL_CATEGORY_SLUG } from '@/lib/catalog/metal'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

type AdminClient = ReturnType<typeof getAdminClient>

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}
function strOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key)
  return v === '' ? null : v
}
function numOrNull(fd: FormData, key: string): number | null {
  const v = str(fd, key)
  if (v === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
function intOr(fd: FormData, key: string, fallback: number): number {
  const v = str(fd, key)
  if (v === '') return fallback
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}
function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === 'on' || v === 'true' || v === '1'
}
// One image URL per line → string[] (jsonb). Empty → null.
function imageList(fd: FormData, key: string): string[] | null {
  const lines = str(fd, key).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.length ? lines : null
}

// Ensure a slug is unique across catalog_products, excluding the row being edited.
async function uniqueSlug(client: AdminClient, base: string, selfId: string): Promise<string> {
  const clean = autoSlug(base)
  for (let n = 0; n <= 999; n++) {
    const candidate = n === 0 ? clean : `${clean}-${n + 1}`
    const { data } = await client
      .from('catalog_products')
      .select('id')
      .eq('slug', candidate)
      .neq('id', selfId)
      .maybeSingle()
    if (!data) return candidate
  }
  // Extremely unlikely; fall back to a stable suffix.
  return `${clean}-${selfId.slice(0, 8)}`
}

// Update one catalog_products storefront row + its RU translation row. Writes the
// same canonical columns the public catalog pages read, so edits render on the
// storefront. Manual-lock checkboxes let the editor freeze price/image/SEO so the
// supplier import stops overwriting them.
export async function updateCatalogProductAction(productId: string, fd: FormData): Promise<void> {
  const client = getAdminClient()

  const nameUa = str(fd, 'name_ua') || 'Без назви'
  const rawSlug = str(fd, 'slug') || nameUa
  const slug = await uniqueSlug(client, rawSlug, productId)

  const statusRaw = str(fd, 'status')
  const status = statusRaw === 'published' || statusRaw === 'draft' || statusRaw === 'archived' ? statusRaw : 'draft'

  // attributes: optional JSON object. Invalid JSON is ignored (kept as-is) and
  // surfaced via ?warn=attributes rather than failing the whole save.
  let attributes: Record<string, unknown> | null | undefined
  const attrRaw = str(fd, 'attributes')
  let attrWarn = false
  if (attrRaw === '') {
    attributes = null
  } else {
    try {
      const parsed = JSON.parse(attrRaw)
      attributes = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      attributes = undefined // leave column unchanged
      attrWarn = true
    }
  }

  const update: Record<string, unknown> = {
    name_ua: nameUa,
    slug,
    category_slug: strOrNull(fd, 'category_slug'),
    short_description: strOrNull(fd, 'short_description'),
    description: strOrNull(fd, 'description'),
    description_ua: strOrNull(fd, 'description_ua'),
    price_uah: numOrNull(fd, 'price_uah'),
    compare_price_uah: numOrNull(fd, 'compare_price_uah'),
    status,
    main_image_url: strOrNull(fd, 'main_image_url'),
    images: imageList(fd, 'images'),
    meta_title: strOrNull(fd, 'meta_title'),
    meta_description: strOrNull(fd, 'meta_description'),
    seo_keywords: strOrNull(fd, 'seo_keywords'),
    is_featured: bool(fd, 'is_featured'),
    display_order: intOr(fd, 'display_order', 0),
    price_manual_lock: bool(fd, 'price_manual_lock'),
    image_manual_lock: bool(fd, 'image_manual_lock'),
    seo_manual_lock: bool(fd, 'seo_manual_lock'),
    updated_at: new Date().toISOString(),
  }
  if (attributes !== undefined) update.attributes = attributes

  const { error: baseError } = await client.from('catalog_products').update(update).eq('id', productId)
  if (baseError) {
    // Structured server-side log (no secrets); never redirect to saved=1.
    console.error('[admin:catalog:product] base update failed', { productId, code: baseError.code, message: baseError.message })
    redirect(`/admin/catalog/${productId}${editorRedirectQuery({ error: true })}`)
  }

  // RU localized content lives in catalog_product_translations, NOT on the base
  // Ukrainian columns. Clearing all RU fields explicitly deletes the RU row.
  const ru = {
    meta_title: strOrNull(fd, 'ru_meta_title'),
    meta_description: strOrNull(fd, 'ru_meta_description'),
    description: strOrNull(fd, 'ru_description'),
    seo_keywords: strOrNull(fd, 'ru_seo_keywords'),
  }
  if (ruTranslationIntent(ru) === 'upsert') {
    const { error } = await client.from('catalog_product_translations').upsert(
      { product_id: productId, locale: 'ru', ...ru, updated_at: new Date().toISOString() },
      { onConflict: 'product_id,locale' },
    )
    if (error) {
      console.error('[admin:catalog:product] RU upsert failed', { productId, code: error.code, message: error.message })
      redirect(`/admin/catalog/${productId}${editorRedirectQuery({ error: true })}`)
    }
  } else {
    const { error } = await client.from('catalog_product_translations').delete().eq('product_id', productId).eq('locale', 'ru')
    if (error) {
      console.error('[admin:catalog:product] RU clear failed', { productId, code: error.code, message: error.message })
      redirect(`/admin/catalog/${productId}${editorRedirectQuery({ error: true })}`)
    }
  }

  // Refresh the admin view and any public pages that render this product.
  revalidatePath('/admin/catalog')
  revalidatePath(`/admin/catalog/${productId}`)
  revalidatePath('/catalog')
  const category = strOrNull(fd, 'category_slug')
  if (category) revalidatePath(`/catalog/${category}/${slug}`)

  redirect(`/admin/catalog/${productId}${editorRedirectQuery({ warn: attrWarn ? 'attributes' : null })}`)
}

// Dedicated metal-profile product update. ENFORCES the metal invariants
// (source='manual', lead_type='metal', inquiry_only=true, product_group='metal')
// so a metal row can never drift into cart-buyable/supplier-owned state, and
// builds `attributes` from structured characteristic fields overlaid on an
// optional advanced-JSON base. Reuses the same image serialization
// (main_image_url + images) and RU-translation handling as the generic editor.
export async function updateMetalProductAction(productId: string, fd: FormData): Promise<void> {
  const client = getAdminClient()

  const nameUa = str(fd, 'name_ua') || 'Без назви'
  const slug = await uniqueSlug(client, str(fd, 'slug') || nameUa, productId)
  const statusRaw = str(fd, 'status')
  const status = statusRaw === 'published' || statusRaw === 'draft' || statusRaw === 'archived' ? statusRaw : 'draft'

  // Advanced JSON base (invalid → keep, warn) overlaid with structured metal fields.
  let attrWarn = false
  let base: Record<string, unknown> = {}
  const advRaw = str(fd, 'attributes_advanced')
  if (advRaw !== '') {
    try {
      const parsed = JSON.parse(advRaw)
      if (parsed && typeof parsed === 'object') base = parsed as Record<string, unknown>
      else attrWarn = true
    } catch { attrWarn = true }
  }
  const structured: Record<string, string> = {}
  for (const f of METAL_ATTR_FIELDS) structured[f.field] = str(fd, f.field)
  const attributes = buildMetalAttributes(base, structured)

  const update: Record<string, unknown> = {
    name_ua: nameUa,
    slug,
    status,
    // Enforced metal invariants — inquiry-only, never cart-buyable, never supplier-owned.
    source: 'manual',
    lead_type: 'metal',
    inquiry_only: true,
    product_group: 'metal',
    short_description: strOrNull(fd, 'short_description'),
    description: strOrNull(fd, 'description'),
    description_ua: strOrNull(fd, 'description_ua'),
    price_uah: numOrNull(fd, 'price_uah'),
    compare_price_uah: numOrNull(fd, 'compare_price_uah'),
    price_prefix: strOrNull(fd, 'price_prefix'),
    unit_label: strOrNull(fd, 'unit_label'),
    main_image_url: strOrNull(fd, 'main_image_url'),
    images: imageList(fd, 'images'),
    attributes,
    is_featured: bool(fd, 'is_featured'),
    display_order: intOr(fd, 'display_order', 0),
    updated_at: new Date().toISOString(),
  }

  const { error: baseError } = await client.from('catalog_products').update(update).eq('id', productId)
  if (baseError) {
    console.error('[admin:catalog:metal] base update failed', { productId, code: baseError.code, message: baseError.message })
    redirect(`/admin/catalog/${productId}${editorRedirectQuery({ error: true })}`)
  }

  const ru = {
    meta_title: strOrNull(fd, 'ru_meta_title'),
    meta_description: strOrNull(fd, 'ru_meta_description'),
    description: strOrNull(fd, 'ru_description'),
    seo_keywords: strOrNull(fd, 'ru_seo_keywords'),
  }
  if (ruTranslationIntent(ru) === 'upsert') {
    const { error } = await client.from('catalog_product_translations').upsert(
      { product_id: productId, locale: 'ru', ...ru, updated_at: new Date().toISOString() },
      { onConflict: 'product_id,locale' },
    )
    if (error) {
      console.error('[admin:catalog:metal] RU upsert failed', { productId, code: error.code, message: error.message })
      redirect(`/admin/catalog/${productId}${editorRedirectQuery({ error: true })}`)
    }
  } else {
    const { error } = await client.from('catalog_product_translations').delete().eq('product_id', productId).eq('locale', 'ru')
    if (error) {
      console.error('[admin:catalog:metal] RU clear failed', { productId, code: error.code, message: error.message })
      redirect(`/admin/catalog/${productId}${editorRedirectQuery({ error: true })}`)
    }
  }

  revalidatePath('/admin/catalog')
  revalidatePath(`/admin/catalog/${productId}`)
  revalidatePath('/catalog')
  revalidatePath(`/catalog/${METAL_CATEGORY_SLUG}/${slug}`)
  redirect(`/admin/catalog/${productId}${editorRedirectQuery({ warn: attrWarn ? 'attributes' : null })}`)
}
