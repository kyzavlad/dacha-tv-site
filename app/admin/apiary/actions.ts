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
  return slug || `apiary-${Date.now()}`
}

export async function createApiaryProduct(formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const compat = mediaToBackwardCompat(mediaItems, 'youtube_video_url')
  const packagingRaw = formData.get('packaging') as string
  const packaging = packagingRaw ? packagingRaw.split(',').map((s) => s.trim()).filter(Boolean) : null
  const name = formData.get('name') as string

  const { data, error } = await client.from('apiary_products').insert({
    name,
    slug: autoSlug(name),
    description: (formData.get('description') as string) || null,
    short_description: (formData.get('short_description') as string) || null,
    full_description: (formData.get('full_description') as string) || null,
    composition: (formData.get('composition') as string) || null,
    usage_notes: (formData.get('usage_notes') as string) || null,
    storage_info: (formData.get('storage_info') as string) || null,
    packaging,
    price_uah: formData.get('price_uah') ? parseFloat(formData.get('price_uah') as string) : null,
    weight_g: formData.get('weight_g') ? parseInt(formData.get('weight_g') as string) : null,
    status: (formData.get('status') as string) || 'available',
    is_featured: formData.get('is_featured') === 'on',
    ...compat,
  }).select('id').single()

  if (!error && data) {
    await saveProductMedia('apiary', data.id, mediaItems, client)
  }

  revalidatePath('/products', 'layout')
  revalidatePath('/')
  redirect('/admin/apiary')
}

export async function updateApiaryProduct(id: string, formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const compat = mediaToBackwardCompat(mediaItems, 'youtube_video_url')
  const packagingRaw = formData.get('packaging') as string
  const packaging = packagingRaw ? packagingRaw.split(',').map((s) => s.trim()).filter(Boolean) : null
  const name = formData.get('name') as string

  await client.from('apiary_products').update({
    name,
    description: (formData.get('description') as string) || null,
    short_description: (formData.get('short_description') as string) || null,
    full_description: (formData.get('full_description') as string) || null,
    composition: (formData.get('composition') as string) || null,
    usage_notes: (formData.get('usage_notes') as string) || null,
    storage_info: (formData.get('storage_info') as string) || null,
    packaging,
    price_uah: formData.get('price_uah') ? parseFloat(formData.get('price_uah') as string) : null,
    weight_g: formData.get('weight_g') ? parseInt(formData.get('weight_g') as string) : null,
    status: (formData.get('status') as string) || 'available',
    is_featured: formData.get('is_featured') === 'on',
    updated_at: new Date().toISOString(),
    ...compat,
  }).eq('id', id)

  await saveProductMedia('apiary', id, mediaItems, client)

  revalidatePath('/products', 'layout')
  revalidatePath('/')
  redirect('/admin/apiary')
}

export async function deleteApiaryProduct(id: string) {
  const client = getAdminClient()
  await saveProductMedia('apiary', id, [], client)
  await client.from('apiary_products').delete().eq('id', id)
  revalidatePath('/products', 'layout')
  revalidatePath('/')
  redirect('/admin/apiary')
}
