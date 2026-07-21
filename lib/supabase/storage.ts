import { getAdminClient } from './admin'
import { sniffImageType, sniffMatchesExtension } from '@/lib/catalog/image-sniff'

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

// Sanitize a productId into a safe single path segment. A UUID is kept verbatim;
// anything else is reduced to [a-z0-9-] (so a hostile value can't escape the
// catalog/ prefix or inject a path). Returns null when nothing safe remains.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function sanitizeProductId(id: string | null | undefined): string | null {
  const raw = (id ?? '').trim()
  if (!raw) return null
  if (UUID_RE.test(raw)) return raw.toLowerCase()
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return cleaned || null
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

const GENERIC_ERR = 'Не вдалося завантажити файл. Спробуйте ще раз.'

export async function uploadProductFile(
  file: File,
  opts: UploadOptions = {},
): Promise<{ url: string } | { error: string }> {
  // ── Validation: extension → real MIME → size (pure, shared with tests) ───────
  const valid = validateUploadFile({ name: file.name, type: file.type, size: file.size })
  if (!valid.ok) return { error: valid.error }
  const { ext, isVideo } = valid
  const allowedMimes = MIME_BY_EXT[ext] ?? []

  // ── Magic-byte verification (images only; NEVER trust file.type/extension) ───
  // Reads the leading bytes and confirms the real container matches the claimed
  // extension, so a renamed/mislabeled file is rejected before it reaches Storage.
  if (!isVideo) {
    let head: Uint8Array
    try {
      head = new Uint8Array(await file.slice(0, 32).arrayBuffer())
    } catch {
      return { error: GENERIC_ERR }
    }
    const sniffed = sniffImageType(head)
    if (!sniffMatchesExtension(sniffed, ext)) {
      console.error(`[upload] magic-byte mismatch — ext=.${ext} sniffed=${sniffed ?? 'none'} name="${file.name}" type="${file.type}"`)
      return { error: 'Файл не є коректним зображенням (перевірка вмісту не пройдена).' }
    }
  }

  const client = getAdminClient()
  // Collision-safe path: catalog/{productId}/{timestamp}-{rand}-{safeName}.{ext}.
  // productId is sanitized to a UUID / safe segment so it cannot escape catalog/.
  const safeId = sanitizeProductId(opts.productId)
  const folder = safeId ? `catalog/${safeId}` : isVideo ? 'video' : 'image'
  const rand = Math.random().toString(36).slice(2, 8)
  const name = `${folder}/${Date.now()}-${rand}-${safeFilename(file.name)}.${ext}`

  try {
    const { error } = await client.storage
      .from(BUCKET)
      .upload(name, file, { contentType: file.type || allowedMimes[0], upsert: false })

    if (error) {
      // Structured server log preserving the exact Storage cause; the admin sees
      // only a safe Ukrainian message.
      const code = (error as { statusCode?: string | number; name?: string }).statusCode ?? (error as { name?: string }).name ?? ''
      console.error(`[upload] storage upload FAILED — bucket=${BUCKET} path="${name}" code=${code} message="${error.message}"`)
      const missingBucket = /bucket.*not.*found/i.test(error.message) || String(code) === '404'
      return {
        error: missingBucket
          ? 'Сховище зображень не налаштоване. Застосуйте міграцію product-media та спробуйте ще раз.'
          : GENERIC_ERR,
      }
    }

    // ── Post-upload verification: the object must exist AND its public URL must
    // resolve. On any failure, DELETE the object so no dangling/unreachable path
    // is ever returned.
    const { data: { publicUrl } } = client.storage.from(BUCKET).getPublicUrl(name)
    const verified = await verifyUploaded(client, name, publicUrl)
    if (!verified.ok) {
      console.error(`[upload] post-upload verification FAILED (${verified.stage}) — path="${name}" ${verified.detail}`)
      await client.storage.from(BUCKET).remove([name]).catch(() => { /* best effort */ })
      return { error: GENERIC_ERR }
    }

    return { url: publicUrl }
  } catch (e) {
    console.error(`[upload] unexpected failure — path="${name}" ${e instanceof Error ? e.message : String(e)}`)
    // Attempt cleanup of a possibly-created object.
    await client.storage.from(BUCKET).remove([name]).catch(() => { /* best effort */ })
    return { error: GENERIC_ERR }
  }
}

// Confirm the object exists in Storage and its public URL is reachable. The
// existence check is authoritative; the public-URL HEAD is best-effort (a proxy
// or CDN warmup may lag) and only fails verification on a definitive 4xx.
async function verifyUploaded(
  client: ReturnType<typeof getAdminClient>,
  path: string,
  publicUrl: string,
): Promise<{ ok: true } | { ok: false; stage: string; detail: string }> {
  // 1. Object exists (list the parent folder, match the basename).
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash) : ''
  const base = slash >= 0 ? path.slice(slash + 1) : path
  const { data: listed, error: listErr } = await client.storage.from(BUCKET).list(dir, { search: base, limit: 100 })
  if (listErr) return { ok: false, stage: 'list', detail: listErr.message }
  if (!listed?.some((o) => o.name === base)) return { ok: false, stage: 'exists', detail: 'object not found after upload' }

  // 2. Public URL resolvable (best effort). A network error is tolerated; a
  // definitive 4xx (except 405) means the URL is not publicly readable.
  try {
    const res = await fetch(publicUrl, { method: 'HEAD' })
    if (res.status >= 400 && res.status !== 405) {
      return { ok: false, stage: 'public-url', detail: `HTTP ${res.status}` }
    }
  } catch (e) {
    console.warn(`[upload] public-URL HEAD not conclusive (tolerated) — ${e instanceof Error ? e.message : String(e)}`)
  }
  return { ok: true }
}
