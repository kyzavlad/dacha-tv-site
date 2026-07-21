'use server'
import { cookies } from 'next/headers'
import { uploadProductFile } from '@/lib/supabase/storage'

// Admin-only media upload. Defence-in-depth: the /admin proxy middleware already
// gates the page this action lives on, but a server action is a public endpoint,
// so we re-check the admin_session cookie here before touching Storage.
export async function uploadMediaFile(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const session = (await cookies()).get('admin_session')
  if (!session || session.value !== '1') {
    return { error: 'Доступ заборонено' }
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'Файл не вибраний' }

  const productId = String(formData.get('productId') ?? '').trim() || undefined
  return uploadProductFile(file, { productId })
}
