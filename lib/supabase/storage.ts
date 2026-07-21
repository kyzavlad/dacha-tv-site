import { getAdminClient } from './admin'

const BUCKET = 'product-media'

const ALLOWED_IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif'])
const ALLOWED_VIDEO = new Set(['mp4', 'webm', 'mov'])
const ALLOWED_ALL = new Set([...ALLOWED_IMAGE, ...ALLOWED_VIDEO])

// Real MIME types accepted per extension — checked against the browser-reported
// file.type so a mislabeled/renamed file (e.g. a .exe renamed to .jpg) is
// rejected before it reaches Storage. Kept in sync with ALLOWED_* above.
const MIME_BY_EXT: Record<string, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  avif: ['image/avif'],
  mp4: ['video/mp4'],
  webm: ['video/webm'],
  mov: ['video/quicktime', 'video/mp4'],
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024 // 100 MB

export function isVideoUrl(url: string): boolean {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_VIDEO.has(ext)
}

// Pure validation (no I/O) so the accept rules can be unit-tested without a DB.
// Mirrors the checks applied in uploadProductFile below.
export function validateUploadFile(
  meta: { name: string; type?: string; size?: number },
): { ok: true; ext: string; isVideo: boolean } | { ok: false; error: string } {
  const ext = meta.name.split('.').pop()?.toLowerCase() ?? ''
  const isVideo = ALLOWED_VIDEO.has(ext)
  if (!ALLOWED_ALL.has(ext)) {
    return { ok: false, error: `Формат .${ext || '?'} не підтримується. Дозволено: JPG, PNG, WEBP, AVIF.` }
  }
  const allowedMimes = MIME_BY_EXT[ext] ?? []
  if (meta.type && allowedMimes.length > 0 && !allowedMimes.includes(meta.type)) {
    return { ok: false, error: 'Тип файлу не збігається з розширенням. Завантажте коректне зображення.' }
  }
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  if ((meta.size ?? 0) > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024))
    return { ok: false, error: `Файл завеликий. Максимум ${mb} МБ.` }
  }
  return { ok: true, ext, isVideo }
}

// Slugify a filename base for use in a storage path — keeps it human-readable
// while stripping anything that could break a path or collide. Never empty.
export function safeFilename(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return base || 'file'
}

export interface UploadOptions {
  // When provided, images are grouped under catalog/{productId}/… so a product's
  // media is collision-free and easy to locate. Falls back to a generic folder.
  productId?: string
}

export async function uploadProductFile(
  file: File,
  opts: UploadOptions = {},
): Promise<{ url: string } | { error: string }> {
  // ── Validation: extension → real MIME → size (pure, shared with tests) ───────
  const valid = validateUploadFile({ name: file.name, type: file.type, size: file.size })
  if (!valid.ok) return { error: valid.error }
  const { ext, isVideo } = valid
  const allowedMimes = MIME_BY_EXT[ext] ?? []

  try {
    const client = getAdminClient()
    // Collision-safe path: catalog/{productId}/{timestamp}-{rand}-{safeName}.{ext}
    // The random suffix guarantees two files uploaded in the same millisecond
    // (concurrent uploads) never collide even with identical names.
    const folder = opts.productId
      ? `catalog/${safeFilename(opts.productId)}`
      : isVideo ? 'video' : 'image'
    const rand = Math.random().toString(36).slice(2, 8)
    const name = `${folder}/${Date.now()}-${rand}-${safeFilename(file.name)}.${ext}`

    const { error } = await client.storage
      .from(BUCKET)
      .upload(name, file, { contentType: file.type || allowedMimes[0], upsert: false })

    if (error) {
      // Structured server log preserving the exact Storage cause; the customer /
      // admin sees only a safe Ukrainian message.
      const code = (error as { statusCode?: string | number; name?: string }).statusCode ?? (error as { name?: string }).name ?? ''
      console.error(`[upload] storage upload FAILED — bucket=${BUCKET} path="${name}" code=${code} message="${error.message}"`)
      const missingBucket = /bucket.*not.*found/i.test(error.message) || String(code) === '404'
      return {
        error: missingBucket
          ? 'Сховище зображень не налаштоване. Застосуйте міграцію product-media та спробуйте ще раз.'
          : 'Не вдалося завантажити файл. Спробуйте ще раз.',
      }
    }

    const { data: { publicUrl } } = client.storage.from(BUCKET).getPublicUrl(name)
    return { url: publicUrl }
  } catch (e) {
    console.error(`[upload] unexpected failure — ${e instanceof Error ? e.message : String(e)}`)
    return { error: 'Не вдалося завантажити файл. Спробуйте ще раз.' }
  }
}
