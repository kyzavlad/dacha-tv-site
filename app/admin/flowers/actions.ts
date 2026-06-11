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
  return slug || `flower-${Date.now()}`
}

export async function createFlowerProduct(formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const compat = mediaToBackwardCompat(mediaItems, 'youtube_video_url')
  const name = formData.get('name') as string

  const { data, error } = await client.from('flower_products').insert({
    name,
    slug: autoSlug(name),
    category: (formData.get('category') as string) || 'chrysanthemum',
    variety: (formData.get('variety') as string) || null,
    short_description: (formData.get('short_description') as string) || null,
    full_description: (formData.get('full_description') as string) || null,
    price_uah: formData.get('price_uah') ? parseFloat(formData.get('price_uah') as string) : null,
    color: (formData.get('color') as string) || null,
    bloom_season: (formData.get('bloom_season') as string) || null,
    height_cm: formData.get('height_cm') ? parseInt(formData.get('height_cm') as string) : null,
    lighting: (formData.get('lighting') as string) || null,
    packaging_note: (formData.get('packaging_note') as string) || null,
    is_featured: formData.get('is_featured') === 'on',
    status: (formData.get('status') as string) || 'available',
    ...compat,
  }).select('id').single()

  if (!error && data) {
    await saveProductMedia('flowers', data.id, mediaItems, client)
  }

  revalidatePath('/flowers', 'layout')
  revalidatePath('/')
  redirect('/admin/flowers')
}

export async function updateFlowerProduct(id: string, formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const compat = mediaToBackwardCompat(mediaItems, 'youtube_video_url')
  const name = formData.get('name') as string

  await client.from('flower_products').update({
    name,
    category: (formData.get('category') as string) || 'chrysanthemum',
    variety: (formData.get('variety') as string) || null,
    short_description: (formData.get('short_description') as string) || null,
    full_description: (formData.get('full_description') as string) || null,
    price_uah: formData.get('price_uah') ? parseFloat(formData.get('price_uah') as string) : null,
    color: (formData.get('color') as string) || null,
    bloom_season: (formData.get('bloom_season') as string) || null,
    height_cm: formData.get('height_cm') ? parseInt(formData.get('height_cm') as string) : null,
    lighting: (formData.get('lighting') as string) || null,
    packaging_note: (formData.get('packaging_note') as string) || null,
    is_featured: formData.get('is_featured') === 'on',
    status: (formData.get('status') as string) || 'available',
    updated_at: new Date().toISOString(),
    ...compat,
  }).eq('id', id)

  await saveProductMedia('flowers', id, mediaItems, client)

  revalidatePath('/flowers', 'layout')
  revalidatePath('/')
  redirect('/admin/flowers')
}

export async function deleteFlowerProduct(id: string) {
  const client = getAdminClient()
  await saveProductMedia('flowers', id, [], client)
  await client.from('flower_products').delete().eq('id', id)
  revalidatePath('/flowers', 'layout')
  revalidatePath('/')
  redirect('/admin/flowers')
}
