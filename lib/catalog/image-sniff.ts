// ─── Image magic-byte sniffing (PURE, unit-testable) ─────────────────────────
// Verifies real file content instead of trusting the browser-reported MIME type
// or the filename extension. Returns the detected extension, or null when the
// bytes don't match a supported image container.

export type SniffedImage = 'jpg' | 'png' | 'webp' | 'avif' | null

function ascii(bytes: Uint8Array, start: number, len: number): string {
  let s = ''
  for (let i = start; i < start + len && i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

// Inspect the leading bytes of a file. Needs ~16 bytes to decide.
export function sniffImageType(bytes: Uint8Array): SniffedImage {
  if (!bytes || bytes.length < 12) return null

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'png'

  // WEBP: "RIFF" .... "WEBP"
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'

  // AVIF (ISO-BMFF): bytes 4-7 = "ftyp", brand (8-11) or compatible brand = avif/avis.
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    if (brand === 'avif' || brand === 'avis') return 'avif'
    // Some encoders put "mif1"/"msf1" as the major brand with avif compatible
    // brands following — scan a few compatible-brand slots.
    for (let off = 12; off + 4 <= bytes.length && off <= 24; off += 4) {
      const b = ascii(bytes, off, 4)
      if (b === 'avif' || b === 'avis') return 'avif'
    }
  }

  return null
}

// jpg and jpeg share the JPEG signature — normalize the requested extension so a
// `.jpeg` upload isn't rejected against a sniff of 'jpg'.
export function sniffMatchesExtension(sniffed: SniffedImage, ext: string): boolean {
  if (!sniffed) return false
  const e = ext.toLowerCase()
  if (sniffed === 'jpg') return e === 'jpg' || e === 'jpeg'
  return sniffed === e
}
