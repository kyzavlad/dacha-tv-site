'use server'
import { uploadProductFile } from '@/lib/supabase/storage'

export async function uploadMediaFile(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'Файл не вибраний' }
  return uploadProductFile(file)
}
