'use server'
import { getAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createFaqItem(formData: FormData) {
  const client = getAdminClient()
  await client.from('faq_items').insert({
    question: formData.get('question') as string,
    answer: formData.get('answer') as string,
    category: formData.get('category') as string,
    display_order: parseInt(formData.get('display_order') as string) || 10,
  })
  revalidatePath('/faq')
  revalidatePath('/admin/faq')
}

export async function updateFaqItem(id: string, formData: FormData) {
  const client = getAdminClient()
  await client.from('faq_items').update({
    question: formData.get('question') as string,
    answer: formData.get('answer') as string,
    category: formData.get('category') as string,
    display_order: parseInt(formData.get('display_order') as string) || 10,
  }).eq('id', id)
  revalidatePath('/faq')
  revalidatePath('/admin/faq')
}

export async function deleteFaqItem(id: string) {
  const client = getAdminClient()
  await client.from('faq_items').delete().eq('id', id)
  revalidatePath('/faq')
  revalidatePath('/admin/faq')
}
