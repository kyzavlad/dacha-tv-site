import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniffImageType, sniffMatchesExtension } from '../lib/catalog/image-sniff.ts'
import { validateUploadFile } from '../lib/supabase/storage.ts'

// Build a byte header + pad to 32 bytes.
const withHead = (arr) => { const b = new Uint8Array(32); b.set(arr, 0); return b }
const jpg = withHead([0xff, 0xd8, 0xff, 0xe0])
const png = withHead([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webp = withHead([...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map(c => c.charCodeAt(0))))
const avif = withHead([0, 0, 0, 0x20, ...'ftyp'].map((v) => typeof v === 'string' ? v.charCodeAt(0) : v).concat([...'avif'].map(c => c.charCodeAt(0))))
const exe = withHead([0x4d, 0x5a, 0x90, 0x00]) // "MZ" — a Windows executable

test('sniffImageType detects real image containers', () => {
  assert.equal(sniffImageType(jpg), 'jpg')
  assert.equal(sniffImageType(png), 'png')
  assert.equal(sniffImageType(webp), 'webp')
  assert.equal(sniffImageType(avif), 'avif')
})

test('sniffImageType rejects a non-image (exe) and short buffers', () => {
  assert.equal(sniffImageType(exe), null)
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8])), null) // too short
})

test('sniffMatchesExtension treats jpg/jpeg as equivalent', () => {
  assert.equal(sniffMatchesExtension('jpg', 'jpg'), true)
  assert.equal(sniffMatchesExtension('jpg', 'jpeg'), true)
  assert.equal(sniffMatchesExtension('png', 'jpg'), false)
  assert.equal(sniffMatchesExtension(null, 'jpg'), false)
})

test('magic-byte mismatch scenario: .jpg name but PNG bytes → mismatch caught', () => {
  // The upload path validates extension first (passes), then sniffs bytes.
  assert.equal(validateUploadFile({ name: 'photo.jpg', type: 'image/jpeg', size: 1000 }).ok, true)
  // …then sniff of PNG bytes against 'jpg' must NOT match → upload rejects.
  assert.equal(sniffMatchesExtension(sniffImageType(png), 'jpg'), false)
})

test('renamed executable (.png) → sniff returns null → rejected', () => {
  assert.equal(sniffMatchesExtension(sniffImageType(exe), 'png'), false)
})
