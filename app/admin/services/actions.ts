'use server'
import { getAdminClient } from '@/lib/supabase/admin'
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
  return slug || `service-${Date.now()}`
}

function parseService(formData: FormData) {
  const name = formData.get('name') as string
  return {
    name,
    short_description: (formData.get('short_description') as string) || null,
    description: (formData.get('description') as string) || null,
    price_uah: formData.get('price_uah') ? parseFloat(formData.get('price_uah') as string) : null,
    price_note: (formData.get('price_note') as string) || null,
    duration_note: (formData.get('duration_note') as string) || null,
    status: (formData.get('status') as string) || 'active',
    is_featured: formData.get('is_featured') === 'on',
    display_order: formData.get('display_order') ? parseInt(formData.get('display_order') as string) : 0,
    image_url: (formData.get('image_url') as string) || null,
  }
}

export async function createService(formData: FormData) {
  const client = getAdminClient()
  const fields = parseService(formData)

  await client.from('services').insert({
    ...fields,
    slug: autoSlug(fields.name),
  })

  revalidatePath('/services', 'layout')
  revalidatePath('/')
  redirect('/admin/services')
}

export async function updateService(id: string, formData: FormData) {
  const client = getAdminClient()
  const fields = parseService(formData)

  await client.from('services').update({
    ...fields,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  revalidatePath('/services', 'layout')
  revalidatePath('/')
  redirect('/admin/services')
}

export async function deleteService(id: string) {
  const client = getAdminClient()
  await client.from('services').delete().eq('id', id)
  revalidatePath('/services', 'layout')
  revalidatePath('/')
  redirect('/admin/services')
}
