import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateUploadFile, safeFilename } from '../lib/supabase/storage.ts'

test('accepts allowed image extensions', () => {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'avif']) {
    const r = validateUploadFile({ name: `photo.${ext}`, type: '', size: 1000 })
    assert.equal(r.ok, true, `.${ext} should be allowed`)
  }
})

test('rejects a disallowed extension with a Ukrainian message', () => {
  const r = validateUploadFile({ name: 'malware.exe', type: 'application/x-msdownload', size: 10 })
  assert.equal(r.ok, false)
  assert.match(r.error, /не підтримується/)
})

test('rejects a MIME/extension mismatch (renamed file)', () => {
  const r = validateUploadFile({ name: 'photo.jpg', type: 'application/x-msdownload', size: 10 })
  assert.equal(r.ok, false)
  assert.match(r.error, /не збігається/)
})

test('allows empty MIME (some browsers omit it) for a valid extension', () => {
  const r = validateUploadFile({ name: 'photo.png', type: '', size: 10 })
  assert.equal(r.ok, true)
})

test('rejects an oversized image', () => {
  const r = validateUploadFile({ name: 'huge.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 })
  assert.equal(r.ok, false)
  assert.match(r.error, /завеликий/)
})

test('allows a large video under the video cap', () => {
  const r = validateUploadFile({ name: 'clip.mp4', type: 'video/mp4', size: 50 * 1024 * 1024 })
  assert.equal(r.ok, true)
  assert.equal(r.isVideo, true)
})

test('safeFilename slugifies and never returns empty', () => {
  assert.equal(safeFilename('My Photo (final).PNG'), 'my-photo-final')
  assert.equal(safeFilename('...'), 'file')
  assert.equal(safeFilename(''), 'file')
  // Cyrillic-only names strip to the non-empty fallback (path stays ASCII-safe).
  assert.equal(safeFilename('Моє Фото.jpg'), 'file')
  // No path-breaking characters survive.
  assert.doesNotMatch(safeFilename('a/b\\c..d.jpg'), /[/\\]/)
})
