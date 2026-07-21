// ─── Catalog image metadata (PURE, unit-testable) ────────────────────────────
// catalog_products keeps TWO representations of imagery, and this module keeps
// them consistent:
//   • main_image_url + images[]  — the authoritative, always-present legacy pair
//   • image_metadata jsonb       — ordered [{url, alt, position, isPrimary}]
//
// image_metadata is a backward-compatible ENRICHMENT: it adds per-image alt text
// and explicit ordering. When it's absent (older rows), everything still works by
// deriving entries from main_image_url + images with a single alt fallback.

import type { CatalogImageMeta } from '@/types'

// Parse a stored/serialized image_metadata value into a clean, ordered list.
// Accepts a JSON string, an array, or null/garbage → returns [] on anything
// unusable so a malformed column can never throw at render time.
export function parseImageMetadata(raw: unknown): CatalogImageMeta[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    try { arr = JSON.parse(s) } catch { return [] }
  }
  if (!Array.isArray(arr)) return []
  const out: CatalogImageMeta[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const url = typeof o.url === 'string' ? o.url.trim() : ''
    if (!url) continue
    out.push({
      url,
      alt: typeof o.alt === 'string' ? o.alt.trim() : '',
      position: Number.isFinite(Number(o.position)) ? Number(o.position) : out.length,
      isPrimary: o.isPrimary === true,
    })
  }
  // Stable order by position, then dedupe by url (first wins), then re-number.
  out.sort((a, b) => a.position - b.position)
  const seen = new Set<string>()
  const deduped = out.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true)))
  deduped.forEach((e, i) => { e.position = i })
  // Exactly one primary — the flagged one, else the first.
  const primaryIdx = Math.max(0, deduped.findIndex((e) => e.isPrimary))
  deduped.forEach((e, i) => { e.isPrimary = i === primaryIdx })
  return deduped
}

// Build image_metadata from an ordered URL list + an alt map, primary = first.
// `altByUrl` may be partial; missing alts fall back to `fallbackAlt`.
export function buildImageMetadata(
  urls: string[],
  altByUrl: Record<string, string> = {},
  fallbackAlt = '',
): CatalogImageMeta[] {
  const seen = new Set<string>()
  return urls
    .map((u) => (u ?? '').trim())
    .filter((u) => u && (seen.has(u) ? false : (seen.add(u), true)))
    .map((url, i) => ({
      url,
      alt: (altByUrl[url] ?? '').trim() || fallbackAlt,
      position: i,
      isPrimary: i === 0,
    }))
}

// Resolve the ordered image entries a storefront should render. Prefers
// image_metadata; otherwise derives entries from the URL list. Every entry gets
// a non-empty alt: its own alt → the primary main_image_alt → the localized
// product-name fallback. `urls` is the already-resolved image list (primary
// first) from getCatalogProductImages, so ordering stays identical to legacy.
export function resolveImageEntries(opts: {
  imageMetadata?: unknown
  urls: string[]
  mainImageAlt?: string | null
  fallbackAlt: string
}): CatalogImageMeta[] {
  const fallback = (opts.mainImageAlt ?? '').trim() || opts.fallbackAlt
  const meta = parseImageMetadata(opts.imageMetadata)
  if (meta.length > 0) {
    return meta.map((e) => ({ ...e, alt: e.alt || fallback }))
  }
  return buildImageMetadata(opts.urls, {}, fallback)
}

// The alt for the single primary image (cards, og:image). Own primary alt →
// main_image_alt → localized name fallback. Never empty.
export function primaryImageAlt(opts: {
  imageMetadata?: unknown
  mainImageAlt?: string | null
  fallbackAlt: string
}): string {
  const meta = parseImageMetadata(opts.imageMetadata)
  const primary = meta.find((e) => e.isPrimary) ?? meta[0]
  return (primary?.alt || (opts.mainImageAlt ?? '').trim() || opts.fallbackAlt).trim() || opts.fallbackAlt
}
