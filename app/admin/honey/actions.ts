'use server'
import { getAdminClient } from '@/lib/supabase/admin'
import { parseMediaFromForm, saveProductMedia, mediaToBackwardCompat } from '@/lib/supabase/product-media'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function autoSlug(name: string): string {
  const map: Record<string, string> = {
    а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ye',ж:'zh',з:'z',
    и:'y',і:'i',ї:'yi',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',
    р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'yu',я:'ya',
  }
  const slug = name.toLowerCase().split('').map((c) => map[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || `honey-${Date.now()}`
}

// Media is secondary to the core product row: a media failure must never abort
// the whole save (and must never run when the row write itself failed).
async function saveHoneyMediaSafe(id: string, items: ReturnType<typeof parseMediaFromForm>, client: ReturnType<typeof getAdminClient>) {
  try {
    await saveProductMedia('honey', id, items, client)
  } catch (e) {
    console.error(`[honey] media save failed for ${id}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

type Row = Record<string, unknown>

// A save that writes columns beyond the minimal canonical honey_products schema
// (status, rich content fields, gallery/video/multi-youtube) fails on a DB that
// was provisioned from the rebuild migration, because those columns do not exist
// there. Detect that specific error so we can gracefully fall back to the core
// columns instead of crashing the admin.
function isMissingColumnError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  const code = error.code ?? ''
  const msg = (error.message ?? '').toLowerCase()
  return (
    code === 'PGRST204' || // PostgREST: column not found in schema cache
    code === '42703' ||    // Postgres: undefined_column
    msg.includes('does not exist') ||
    msg.includes('could not find')
  )
}

// Build the two payload halves. `core` columns exist in EVERY honey_products
// schema version (incl. the minimal rebuild); `extended` may be absent.
function splitHoneyPayload(formData: FormData) {
  const compat = mediaToBackwardCompat(parseMediaFromForm(formData), 'youtube_video_link')
  const { image_url, image_alt, youtube_video_link, gallery_images, video_url, youtube_video_urls } = compat as Row
  const packagingRaw = formData.get('packaging') as string
  const packaging = packagingRaw ? packagingRaw.split(',').map((s) => s.trim()).filter(Boolean) : null
  const priceInt = (key: string) => {
    const raw = (formData.get(key) as string | null)?.trim()
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  }

  // NOTE: `variety` is intentionally NOT part of the editable payload. The admin
  // UI no longer exposes a variety dropdown and the public pages never derive the
  // visual/placeholder from it. On UPDATE we leave the legacy value untouched; on
  // CREATE we supply a neutral default only to satisfy the NOT NULL column.
  const core: Row = {
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    packaging,
    price_plastic_uah: priceInt('price_plastic_uah'),
    price_glass_uah: priceInt('price_glass_uah'),
    is_featured: formData.get('is_featured') === 'on',
    image_url, image_alt, youtube_video_link,
  }
  const extended: Row = {
    status: (formData.get('status') as string) || 'available',
    short_description: (formData.get('short_description') as string) || null,
    full_description: (formData.get('full_description') as string) || null,
    aroma_notes: (formData.get('aroma_notes') as string) || null,
    taste_notes: (formData.get('taste_notes') as string) || null,
    color_note: (formData.get('color_note') as string) || null,
    crystallization_note: (formData.get('crystallization_note') as string) || null,
    recommended_use: (formData.get('recommended_use') as string) || null,
    packaging_note: (formData.get('packaging_note') as string) || null,
    gallery_images, video_url, youtube_video_urls,
  }
  return { core, extended }
}

const SKIPPED_WARNING =
  'Ціну та основні поля збережено. Додаткові поля (статус, детальні описи, галерея) поки НЕ збережено — застосуйте міграцію 20260702_honey_admin_columns.sql, щоб увімкнути їх.'

export async function createHoneyProduct(formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const name = formData.get('name') as string
  const { core, extended } = splitHoneyPayload(formData)
  // `variety` is a legacy NOT NULL column no longer shown in the UI — supply a
  // neutral default for new rows (it never drives the public visual).
  const coreInsert: Row = { ...core, name, slug: autoSlug(name), variety: 'Мед' }

  // Try the full insert; fall back to core-only if extended columns are missing.
  let res = await client.from('honey_products').insert({ ...coreInsert, ...extended }).select('id').single()
  let skippedExtended = false
  if (res.error && isMissingColumnError(res.error)) {
    skippedExtended = true
    res = await client.from('honey_products').insert(coreInsert).select('id').single()
  }

  if (res.error || !res.data) {
    console.error(`[honey] create failed: ${res.error?.message ?? 'no row returned'}`)
    redirect(`/admin/honey?saveError=${encodeURIComponent(res.error?.message ?? 'Не вдалося створити продукт')}`)
  }

  await saveHoneyMediaSafe(res.data.id as string, mediaItems, client)
  revalidatePath('/honey', 'layout')
  revalidatePath('/')
  redirect(skippedExtended ? `/admin/honey?saveWarning=${encodeURIComponent(SKIPPED_WARNING)}` : '/admin/honey')
}

export async function updateHoneyProduct(id: string, formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const { core, extended } = splitHoneyPayload(formData)
  const coreUpdate: Row = { ...core, updated_at: new Date().toISOString() }

  // Try the full update; on a missing-column error, retry with ONLY the core
  // columns so essential edits (price, name, description, image) always persist.
  // .select('id') lets us tell a matched update from one that hit no row.
  let res = await client.from('honey_products').update({ ...coreUpdate, ...extended }).eq('id', id).select('id')
  let skippedExtended = false
  if (res.error && isMissingColumnError(res.error)) {
    skippedExtended = true
    console.warn(`[honey] update ${id}: extended columns missing, saving core only — ${res.error.message}`)
    res = await client.from('honey_products').update(coreUpdate).eq('id', id).select('id')
  }

  if (res.error) {
    // Surface a clear admin error instead of crashing the page with a generic
    // production error. Existing media is left untouched (we never reached the
    // media save below).
    console.error(`[honey] update failed for ${id}: ${res.error.message}`)
    redirect(`/admin/honey/${id}?saveError=${encodeURIComponent(res.error.message)}`)
  }
  if (!res.data || res.data.length === 0) {
    console.error(`[honey] update matched no row for id=${id}`)
    redirect(`/admin/honey/${id}?saveError=${encodeURIComponent('Продукт не знайдено — зміни не збережено.')}`)
  }

  // Only touch media after the core row saved, so a failed update never wipes
  // the product's existing media.
  await saveHoneyMediaSafe(id, mediaItems, client)
  revalidatePath('/honey', 'layout')
  revalidatePath('/')
  redirect(skippedExtended ? `/admin/honey/${id}?saveWarning=${encodeURIComponent(SKIPPED_WARNING)}` : '/admin/honey')
}

export async function deleteHoneyProduct(id: string) {
  const client = getAdminClient()
  await saveHoneyMediaSafe(id, [], client)
  const { error } = await client.from('honey_products').delete().eq('id', id)
  if (error) {
    console.error(`[honey] delete failed for ${id}: ${error.message}`)
    redirect(`/admin/honey/${id}?saveError=${encodeURIComponent(`Не вдалося видалити продукт: ${error.message}`)}`)
  }
  revalidatePath('/honey', 'layout')
  revalidatePath('/')
  redirect('/admin/honey')
}
