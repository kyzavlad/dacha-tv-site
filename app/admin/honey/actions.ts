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

export async function createHoneyProduct(formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const compat = mediaToBackwardCompat(mediaItems, 'youtube_video_link')
  const packagingRaw = formData.get('packaging') as string
  const packaging = packagingRaw ? packagingRaw.split(',').map((s) => s.trim()).filter(Boolean) : null
  const name = formData.get('name') as string

  const { data, error } = await client.from('honey_products').insert({
    name,
    slug: autoSlug(name),
    variety: (formData.get('variety') as string) || "Різнотрав'я",
    short_description: (formData.get('short_description') as string) || null,
    description: (formData.get('description') as string) || null,
    full_description: (formData.get('full_description') as string) || null,
    aroma_notes: (formData.get('aroma_notes') as string) || null,
    taste_notes: (formData.get('taste_notes') as string) || null,
    color_note: (formData.get('color_note') as string) || null,
    crystallization_note: (formData.get('crystallization_note') as string) || null,
    recommended_use: (formData.get('recommended_use') as string) || null,
    packaging_note: (formData.get('packaging_note') as string) || null,
    price_plastic_uah: formData.get('price_plastic_uah') ? parseInt(formData.get('price_plastic_uah') as string) : null,
    price_glass_uah: formData.get('price_glass_uah') ? parseInt(formData.get('price_glass_uah') as string) : null,
    packaging,
    is_featured: formData.get('is_featured') === 'on',
    status: (formData.get('status') as string) || 'available',
    ...compat,
  }).select('id').single()

  // Surface DB failures instead of silently redirecting as if the save worked —
  // that silent no-op is exactly what read as "honey can't be created/edited".
  if (error || !data) {
    console.error(`[honey] create failed: ${error?.message ?? 'no row returned'}`)
    throw new Error(`Не вдалося створити мед: ${error?.message ?? 'невідома помилка'}`)
  }

  await saveHoneyMediaSafe(data.id, mediaItems, client)

  revalidatePath('/honey', 'layout')
  revalidatePath('/')
  redirect('/admin/honey')
}

export async function updateHoneyProduct(id: string, formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const compat = mediaToBackwardCompat(mediaItems, 'youtube_video_link')
  const packagingRaw = formData.get('packaging') as string
  const packaging = packagingRaw ? packagingRaw.split(',').map((s) => s.trim()).filter(Boolean) : null
  const name = formData.get('name') as string

  // .select() so we can tell an update that matched a row from one that silently
  // matched nothing (bad id) or errored (e.g. a missing column in a stale DB).
  const { data, error } = await client.from('honey_products').update({
    name,
    variety: (formData.get('variety') as string) || "Різнотрав'я",
    short_description: (formData.get('short_description') as string) || null,
    description: (formData.get('description') as string) || null,
    full_description: (formData.get('full_description') as string) || null,
    aroma_notes: (formData.get('aroma_notes') as string) || null,
    taste_notes: (formData.get('taste_notes') as string) || null,
    color_note: (formData.get('color_note') as string) || null,
    crystallization_note: (formData.get('crystallization_note') as string) || null,
    recommended_use: (formData.get('recommended_use') as string) || null,
    packaging_note: (formData.get('packaging_note') as string) || null,
    price_plastic_uah: formData.get('price_plastic_uah') ? parseInt(formData.get('price_plastic_uah') as string) : null,
    price_glass_uah: formData.get('price_glass_uah') ? parseInt(formData.get('price_glass_uah') as string) : null,
    packaging,
    is_featured: formData.get('is_featured') === 'on',
    status: (formData.get('status') as string) || 'available',
    updated_at: new Date().toISOString(),
    ...compat,
  }).eq('id', id).select('id')

  if (error) {
    console.error(`[honey] update failed for ${id}: ${error.message}`)
    throw new Error(`Не вдалося зберегти зміни: ${error.message}`)
  }
  if (!data || data.length === 0) {
    console.error(`[honey] update matched no row for id=${id}`)
    throw new Error('Продукт не знайдено — зміни не збережено.')
  }

  // Only touch media after the core row saved, so a failed update never wipes
  // the product's existing media.
  await saveHoneyMediaSafe(id, mediaItems, client)

  revalidatePath('/honey', 'layout')
  revalidatePath('/')
  redirect('/admin/honey')
}

export async function deleteHoneyProduct(id: string) {
  const client = getAdminClient()
  await saveHoneyMediaSafe(id, [], client)
  const { error } = await client.from('honey_products').delete().eq('id', id)
  if (error) {
    console.error(`[honey] delete failed for ${id}: ${error.message}`)
    throw new Error(`Не вдалося видалити продукт: ${error.message}`)
  }
  revalidatePath('/honey', 'layout')
  revalidatePath('/')
  redirect('/admin/honey')
}
