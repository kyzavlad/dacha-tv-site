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
  return slug || `beekeeper-${Date.now()}`
}

export async function createBeekeeperProduct(formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const compat = mediaToBackwardCompat(mediaItems, 'youtube_video_url')
  const breedsRaw = formData.get('breeds') as string
  const breeds = breedsRaw ? breedsRaw.split(',').map((s) => s.trim()).filter(Boolean) : null
  const name = formData.get('name') as string

  const priceRaw = formData.get('price_uah') as string
  const { data, error } = await client.from('beekeeper_products').insert({
    name,
    slug: autoSlug(name),
    product_type: (formData.get('product_type') as string) || 'bee_packages',
    description: (formData.get('description') as string) || null,
    full_description: (formData.get('full_description') as string) || null,
    breeds,
    season_note: (formData.get('season_note') as string) || null,
    price_uah: priceRaw ? Number(priceRaw) : null,
    price_note: (formData.get('price_note') as string) || null,
    status: (formData.get('status') as string) || 'available',
    is_featured: formData.get('is_featured') === 'on',
    ...compat,
  }).select('id').single()

  if (!error && data) {
    await saveProductMedia('beekeeper', data.id, mediaItems, client)
  }

  revalidatePath('/beekeeper', 'layout')
  revalidatePath('/')
  redirect('/admin/beekeeper')
}

export async function updateBeekeeperProduct(id: string, formData: FormData) {
  const client = getAdminClient()
  const mediaItems = parseMediaFromForm(formData)
  const compat = mediaToBackwardCompat(mediaItems, 'youtube_video_url')
  const breedsRaw = formData.get('breeds') as string
  const breeds = breedsRaw ? breedsRaw.split(',').map((s) => s.trim()).filter(Boolean) : null
  const name = formData.get('name') as string

  const priceRaw2 = formData.get('price_uah') as string
  await client.from('beekeeper_products').update({
    name,
    product_type: (formData.get('product_type') as string) || 'bee_packages',
    description: (formData.get('description') as string) || null,
    full_description: (formData.get('full_description') as string) || null,
    breeds,
    season_note: (formData.get('season_note') as string) || null,
    price_uah: priceRaw2 ? Number(priceRaw2) : null,
    price_note: (formData.get('price_note') as string) || null,
    status: (formData.get('status') as string) || 'available',
    is_featured: formData.get('is_featured') === 'on',
    updated_at: new Date().toISOString(),
    ...compat,
  }).eq('id', id)

  await saveProductMedia('beekeeper', id, mediaItems, client)

  revalidatePath('/beekeeper', 'layout')
  revalidatePath('/')
  redirect('/admin/beekeeper')
}

export async function deleteBeekeeperProduct(id: string) {
  const client = getAdminClient()
  await saveProductMedia('beekeeper', id, [], client)
  await client.from('beekeeper_products').delete().eq('id', id)
  revalidatePath('/beekeeper', 'layout')
  revalidatePath('/')
  redirect('/admin/beekeeper')
}
