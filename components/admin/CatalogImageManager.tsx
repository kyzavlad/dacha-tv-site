'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { uploadMediaFile } from '@/app/admin/actions/upload'

// Image manager for catalog_products. Reuses the existing `uploadMediaFile`
// server action + `product-media` storage bucket (NO second upload backend, and
// it never touches the product_media table). Manages an ordered list of image
// URLs where the FIRST is the primary; serializes to exactly the two fields the
// catalog server actions already read: `main_image_url` (first URL) and `images`
// (one URL per line — matches the `imageList` newline parser). Supports upload,
// preview, multiple images, set-primary, delete, reorder, and a manual URL
// fallback. Reports upload-in-progress so the parent can disable Save.

interface Slot {
  id: string        // stable identity — patches target this, never a mutable index
  url: string       // '' while a freshly-picked file is still uploading
  preview: string   // object URL while uploading, then the final URL
  isBlob: boolean   // true while `preview` is an object URL that must be revoked
  uploading: boolean
  error: string | null
}

interface Props {
  initialImages: string[]
  onUploadingChange?: (uploading: boolean) => void
  // Groups uploaded media under catalog/{productId}/… for collision-free paths.
  productId?: string
}

let slotSeq = 0
const nextSlotId = () => `slot-${slotSeq++}-${Math.random().toString(36).slice(2, 7)}`

export function CatalogImageManager({ initialImages, onUploadingChange, productId }: Props) {
  const [slots, setSlots] = useState<Slot[]>(
    initialImages.filter(Boolean).map((u) => ({ id: nextSlotId(), url: u, preview: u, isBlob: false, uploading: false, error: null })),
  )
  const [urlInput, setUrlInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const anyUploading = slots.some((s) => s.uploading)
  useEffect(() => { onUploadingChange?.(anyUploading) }, [anyUploading, onUploadingChange])

  // Revoke any outstanding object URLs on unmount to avoid leaking blob memory.
  useEffect(() => () => {
    setSlots((prev) => { prev.forEach((s) => { if (s.isBlob) URL.revokeObjectURL(s.preview) }); return prev })
  }, [])

  // Patch by STABLE id (not array index): concurrent uploads reorder/append the
  // list, so an index captured when the upload started is stale by the time it
  // resolves. Keying on id makes every resolution land on the right slot.
  const patch = useCallback((id: string, next: Partial<Slot>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)))
  }, [])

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const picked = Array.from(files).map((file) => ({ file, id: nextSlotId(), preview: URL.createObjectURL(file) }))
    // Reserve placeholder slots first (each with a stable id).
    setSlots((prev) => [
      ...prev,
      ...picked.map((p) => ({ id: p.id, url: '', preview: p.preview, isBlob: true, uploading: true, error: null as string | null })),
    ])
    await Promise.all(picked.map(async ({ file, id, preview }) => {
      const fd = new FormData()
      fd.set('file', file)
      if (productId) fd.set('productId', productId)
      const res = await uploadMediaFile(fd)
      // The blob preview is no longer needed once we have the final URL (or an
      // error): revoke it to free memory regardless of outcome.
      URL.revokeObjectURL(preview)
      if ('url' in res) patch(id, { url: res.url, preview: res.url, isBlob: false, uploading: false, error: null })
      else patch(id, { isBlob: false, uploading: false, error: res.error })
    }))
    if (fileRef.current) fileRef.current.value = ''
  }

  function addUrl() {
    const u = urlInput.trim()
    if (!u) return
    setSlots((prev) => [...prev, { id: nextSlotId(), url: u, preview: u, isBlob: false, uploading: false, error: null }])
    setUrlInput('')
  }
  const remove = (id: string) => setSlots((prev) => prev.filter((s) => {
    if (s.id === id && s.isBlob) URL.revokeObjectURL(s.preview)
    return s.id !== id
  }))
  const move = (id: string, dir: -1 | 1) => setSlots((prev) => {
    const i = prev.findIndex((s) => s.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= prev.length) return prev
    const next = [...prev]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const makePrimary = (id: string) => setSlots((prev) => {
    const i = prev.findIndex((s) => s.id === id)
    return i <= 0 ? prev : [prev[i], ...prev.slice(0, i), ...prev.slice(i + 1)]
  })

  const ready = slots.filter((s) => s.url && !s.uploading)
  const mainImage = ready[0]?.url ?? ''
  const imagesValue = ready.map((s) => s.url).join('\n')

  return (
    <div className="space-y-3">
      {/* Serialized fields consumed by the catalog server actions — unchanged API. */}
      <input type="hidden" name="main_image_url" value={mainImage} readOnly />
      <input type="hidden" name="images" value={imagesValue} readOnly />

      {slots.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {slots.map((s, i) => (
            <li key={s.id} className={`relative rounded-lg border p-2 ${i === 0 ? 'border-honey-400 ring-1 ring-honey-200' : 'border-gray-200'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.preview} alt="" className="w-full h-24 object-cover rounded-md bg-gray-100" />
              {i === 0 && <span className="absolute top-1 left-1 text-[10px] font-semibold bg-honey-600 text-white px-1.5 py-0.5 rounded">Головне</span>}
              {s.uploading && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-gray-600 rounded-lg animate-pulse">Завантаження…</span>}
              {s.error && <p className="text-[11px] text-red-500 mt-1">{s.error}</p>}
              <div className="flex items-center justify-between mt-1.5 text-gray-500">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(s.id, -1)} disabled={i === 0} className="px-1 disabled:opacity-30 hover:text-gray-800" aria-label="Вгору">↑</button>
                  <button type="button" onClick={() => move(s.id, 1)} disabled={i === slots.length - 1} className="px-1 disabled:opacity-30 hover:text-gray-800" aria-label="Вниз">↓</button>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {i !== 0 && <button type="button" onClick={() => makePrimary(s.id)} className="text-honey-700 hover:underline">Головне</button>}
                  <button type="button" onClick={() => remove(s.id)} className="text-red-500 hover:underline">Видалити</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/avif"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:text-white file:px-3 file:py-1.5 file:text-sm hover:file:bg-gray-700"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="або вставте URL зображення…"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500"
        />
        <button type="button" onClick={addUrl} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Додати URL</button>
      </div>

      {anyUploading && <p className="text-xs text-amber-600 font-medium">Йде завантаження — зачекайте перед збереженням…</p>}
    </div>
  )
}
