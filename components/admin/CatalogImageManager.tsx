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
  url: string       // '' while a freshly-picked file is still uploading
  preview: string   // object URL while uploading, then the final URL
  uploading: boolean
  error: string | null
}

interface Props {
  initialImages: string[]
  onUploadingChange?: (uploading: boolean) => void
}

export function CatalogImageManager({ initialImages, onUploadingChange }: Props) {
  const [slots, setSlots] = useState<Slot[]>(
    initialImages.filter(Boolean).map((u) => ({ url: u, preview: u, uploading: false, error: null })),
  )
  const [urlInput, setUrlInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const anyUploading = slots.some((s) => s.uploading)
  useEffect(() => { onUploadingChange?.(anyUploading) }, [anyUploading, onUploadingChange])

  const patch = useCallback((index: number, next: Partial<Slot>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)))
  }, [])

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const picked = Array.from(files)
    // Reserve placeholder slots first so ordering + indices are stable.
    setSlots((prev) => [
      ...prev,
      ...picked.map((f) => ({ url: '', preview: URL.createObjectURL(f), uploading: true, error: null as string | null })),
    ])
    const base = slots.length
    await Promise.all(picked.map(async (file, k) => {
      const fd = new FormData()
      fd.set('file', file)
      const res = await uploadMediaFile(fd)
      if ('url' in res) patch(base + k, { url: res.url, preview: res.url, uploading: false, error: null })
      else patch(base + k, { uploading: false, error: res.error })
    }))
    if (fileRef.current) fileRef.current.value = ''
  }

  function addUrl() {
    const u = urlInput.trim()
    if (!u) return
    setSlots((prev) => [...prev, { url: u, preview: u, uploading: false, error: null }])
    setUrlInput('')
  }
  const remove = (i: number) => setSlots((prev) => prev.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => setSlots((prev) => {
    const j = i + dir
    if (j < 0 || j >= prev.length) return prev
    const next = [...prev]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const makePrimary = (i: number) => setSlots((prev) => (i === 0 ? prev : [prev[i], ...prev.slice(0, i), ...prev.slice(i + 1)]))

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
            <li key={i} className={`relative rounded-lg border p-2 ${i === 0 ? 'border-honey-400 ring-1 ring-honey-200' : 'border-gray-200'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.preview} alt="" className="w-full h-24 object-cover rounded-md bg-gray-100" />
              {i === 0 && <span className="absolute top-1 left-1 text-[10px] font-semibold bg-honey-600 text-white px-1.5 py-0.5 rounded">Головне</span>}
              {s.uploading && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-gray-600 rounded-lg animate-pulse">Завантаження…</span>}
              {s.error && <p className="text-[11px] text-red-500 mt-1">{s.error}</p>}
              <div className="flex items-center justify-between mt-1.5 text-gray-500">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 disabled:opacity-30 hover:text-gray-800" aria-label="Вгору">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === slots.length - 1} className="px-1 disabled:opacity-30 hover:text-gray-800" aria-label="Вниз">↓</button>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {i !== 0 && <button type="button" onClick={() => makePrimary(i)} className="text-honey-700 hover:underline">Головне</button>}
                  <button type="button" onClick={() => remove(i)} className="text-red-500 hover:underline">Видалити</button>
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
