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

  if (!error && data) {
    await saveProductMedia('honey', data.id, mediaItems, client)
  }

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

  await client.from('honey_products').update({
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
  }).eq('id', id)

  await saveProductMedia('honey', id, mediaItems, client)

  revalidatePath('/honey', 'layout')
  revalidatePath('/')
  redirect('/admin/honey')
}

export async function deleteHoneyProduct(id: string) {
  const client = getAdminClient()
  await saveProductMedia('honey', id, [], client)
  await client.from('honey_products').delete().eq('id', id)
  revalidatePath('/honey', 'layout')
  revalidatePath('/')
  redirect('/admin/honey')
}
