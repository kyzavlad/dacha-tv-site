import { getAdminClient } from './admin'

const BUCKET = 'product-media'

const ALLOWED_IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif'])
const ALLOWED_VIDEO = new Set(['mp4', 'webm', 'mov'])
const ALLOWED_ALL = new Set([...ALLOWED_IMAGE, ...ALLOWED_VIDEO])

export function isVideoUrl(url: string): boolean {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_VIDEO.has(ext)
}

export async function uploadProductFile(
  file: File,
): Promise<{ url: string } | { error: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_ALL.has(ext)) return { error: `Формат .${ext} не підтримується` }

  try {
    const client = getAdminClient()
    const folder = ALLOWED_VIDEO.has(ext) ? 'video' : 'image'
    const name = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await client.storage
      .from(BUCKET)
      .upload(name, file, { contentType: file.type, upsert: false })
    if (error) return { error: error.message }
    const {
      data: { publicUrl },
    } = client.storage.from(BUCKET).getPublicUrl(name)
    return { url: publicUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
