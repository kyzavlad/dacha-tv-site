'use client'
import { useState, useCallback } from 'react'
import type { ProductMedia } from '@/lib/supabase/product-media'
import { uploadMediaFile } from '@/app/admin/actions/upload'

const INPUT =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent'
const LABEL = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'
const ICON_BTN =
  'shrink-0 h-7 w-7 flex items-center justify-center rounded border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400 transition-colors text-xs leading-none'
const ADD_BTN =
  'inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors mt-2'
const FILE_INPUT =
  'w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer'

interface ImageSlot {
  id: string | null
  url: string
  preview: string
  alt: string
  isPrimary: boolean
  uploading: boolean
  error: string | null
}

interface VideoSlot {
  id: string | null
  url: string
  preview: string
  uploading: boolean
  error: string | null
}

interface YtSlot {
  id: string | null
  url: string
}

interface MediaManagerProps {
  initialMedia: ProductMedia[]
  productName?: string
}

function slotsFromMedia(media: ProductMedia[]): {
  images: ImageSlot[]
  videos: VideoSlot[]
  youtubes: YtSlot[]
} {
  const images = media
    .filter((m) => m.media_type === 'image')
    .sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1
      if (!a.is_primary && b.is_primary) return 1
      return a.position - b.position
    })
    .map((m) => ({
      id: m.id,
      url: m.url,
      preview: m.url,
      alt: m.alt ?? '',
      isPrimary: m.is_primary,
      uploading: false,
      error: null,
    }))

  if (images.length > 0 && !images.some((s) => s.isPrimary)) images[0].isPrimary = true

  const videos = media
    .filter((m) => m.media_type === 'video')
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ id: m.id, url: m.url, preview: m.url, uploading: false, error: null }))

  const youtubes = media
    .filter((m) => m.media_type === 'youtube')
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ id: m.id, url: m.url }))

  return { images, videos, youtubes }
}

export function MediaManager({ initialMedia, productName = '' }: MediaManagerProps) {
  const init = slotsFromMedia(initialMedia)
  const [images, setImages] = useState<ImageSlot[]>(init.images)
  const [videos, setVideos] = useState<VideoSlot[]>(init.videos)
  const [youtubes, setYoutubes] = useState<YtSlot[]>(init.youtubes)

  const isUploading = images.some((s) => s.uploading) || videos.some((s) => s.uploading)

  // Upload immediately on file select — no file data sent in the form
  const handleImgFile = useCallback(async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setImages((s) => s.map((slot, j) => j === i ? { ...slot, preview, uploading: true, error: null } : slot))
    const fd = new FormData()
    fd.append('file', file)
    const result = await uploadMediaFile(fd)
    if ('url' in result) {
      setImages((s) => s.map((slot, j) => j === i ? { ...slot, url: result.url, preview: result.url, uploading: false } : slot))
    } else {
      setImages((s) => s.map((slot, j) => j === i ? { ...slot, uploading: false, error: result.error } : slot))
    }
    e.target.value = ''
  }, [])

  const handleVidFile = useCallback(async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setVideos((s) => s.map((slot, j) => j === i ? { ...slot, preview, uploading: true, error: null } : slot))
    const fd = new FormData()
    fd.append('file', file)
    const result = await uploadMediaFile(fd)
    if ('url' in result) {
      setVideos((s) => s.map((slot, j) => j === i ? { ...slot, url: result.url, preview: result.url, uploading: false } : slot))
    } else {
      setVideos((s) => s.map((slot, j) => j === i ? { ...slot, uploading: false, error: result.error } : slot))
    }
    e.target.value = ''
  }, [])

  const addImage = () =>
    setImages((s) => [...s, { id: null, url: '', preview: '', alt: '', isPrimary: s.length === 0, uploading: false, error: null }])
  const removeImage = (i: number) =>
    setImages((s) => {
      const next = s.filter((_, j) => j !== i)
      if (next.length > 0 && !next.some((sl) => sl.isPrimary)) next[0].isPrimary = true
      return next
    })
  const moveImage = (i: number, dir: -1 | 1) =>
    setImages((s) => {
      const n = [...s]
      const t = n[i + dir]
      if (!t) return s
      n[i + dir] = n[i]
      n[i] = t
      return n
    })
  const setPrimary = (i: number) =>
    setImages((s) => s.map((sl, j) => ({ ...sl, isPrimary: j === i })))

  const addVideo = () => setVideos((s) => [...s, { id: null, url: '', preview: '', uploading: false, error: null }])
  const removeVideo = (i: number) => setVideos((s) => s.filter((_, j) => j !== i))

  const addYt = () => setYoutubes((s) => [...s, { id: null, url: '' }])
  const removeYt = (i: number) => setYoutubes((s) => s.filter((_, j) => j !== i))

  return (
    <fieldset className="border-t border-gray-100 pt-5 space-y-6">
      <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Медіа</legend>

      {/* ── Images ─────────────────────────────────────────────────────── */}
      <div>
        <label className={LABEL}>Зображення</label>
        <input type="hidden" name="img_count" value={images.length} />
        <div className="space-y-4">
          {images.map((slot, i) => (
            <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPrimary(i)}
                    title={slot.isPrimary ? 'Головне зображення' : 'Зробити головним'}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                      slot.isPrimary
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'text-gray-400 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {slot.isPrimary ? '★ Головне' : '☆ Головне'}
                  </button>
                  <span className="text-xs text-gray-400">#{i + 1}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} className={ICON_BTN}>↑</button>
                  <button type="button" onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} className={ICON_BTN}>↓</button>
                  <button type="button" onClick={() => removeImage(i)} className={`${ICON_BTN} hover:text-red-500 hover:border-red-200`}>×</button>
                </div>
              </div>

              {/* Only URLs go in the form — files are uploaded eagerly above */}
              <input type="hidden" name={`img_url_${i}`} value={slot.url} />
              <input type="hidden" name={`img_is_primary_${i}`} value={slot.isPrimary ? 'true' : ''} />

              {slot.uploading ? (
                <div className="h-28 rounded-lg flex items-center justify-center bg-gray-100 text-xs text-gray-500 animate-pulse">
                  Завантаження…
                </div>
              ) : slot.preview ? (
                <div className="h-28 rounded-lg overflow-hidden border border-gray-100 bg-white flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slot.preview} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              ) : null}

              {slot.error && <p className="text-xs text-red-500">{slot.error}</p>}

              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/avif"
                onChange={(e) => handleImgFile(i, e)}
                disabled={slot.uploading}
                className={FILE_INPUT}
              />

              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    name={`img_alt_${i}`}
                    type="text"
                    value={slot.alt}
                    onChange={(e) => setImages((s) => s.map((sl, j) => (j === i ? { ...sl, alt: e.target.value } : sl)))}
                    placeholder="Alt-текст для SEO"
                    className={INPUT}
                  />
                </div>
                {productName && (
                  <button
                    type="button"
                    onClick={() =>
                      setImages((s) => s.map((sl, j) => (j === i ? { ...sl, alt: `${productName} — Dacha TV` } : sl)))
                    }
                    className="shrink-0 text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 whitespace-nowrap"
                  >
                    Авто
                  </button>
                )}
              </div>

              <details className="text-xs">
                <summary className="text-gray-400 cursor-pointer select-none hover:text-gray-600">URL (резервний)</summary>
                <input
                  type="text"
                  value={slot.url}
                  onChange={(e) => {
                    const val = e.target.value
                    setImages((s) =>
                      s.map((sl, j) => j === i ? { ...sl, url: val, preview: val || sl.preview } : sl)
                    )
                  }}
                  placeholder="/images/... або https://..."
                  className={`${INPUT} mt-1`}
                />
              </details>
            </div>
          ))}
        </div>
        <button type="button" onClick={addImage} className={ADD_BTN}>
          + Додати зображення
        </button>
      </div>

      {/* ── Videos ─────────────────────────────────────────────────────── */}
      <div>
        <label className={LABEL}>Відео файли (mp4 / webm / mov)</label>
        <input type="hidden" name="vid_count" value={videos.length} />
        <div className="space-y-3">
          {videos.map((slot, i) => (
            <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Відео #{i + 1}</span>
                <button type="button" onClick={() => removeVideo(i)} className={`${ICON_BTN} hover:text-red-500 hover:border-red-200`}>×</button>
              </div>

              <input type="hidden" name={`vid_url_${i}`} value={slot.url} />

              {slot.uploading ? (
                <div className="h-16 rounded-lg flex items-center justify-center bg-gray-100 text-xs text-gray-500 animate-pulse">
                  Завантаження відео…
                </div>
              ) : slot.preview ? (
                <video src={slot.preview} controls className="w-full max-h-36 rounded-lg border border-gray-100 bg-white" />
              ) : null}

              {slot.error && <p className="text-xs text-red-500">{slot.error}</p>}

              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => handleVidFile(i, e)}
                disabled={slot.uploading}
                className={FILE_INPUT}
              />
            </div>
          ))}
        </div>
        <button type="button" onClick={addVideo} className={ADD_BTN}>
          + Додати відео
        </button>
      </div>

      {/* ── YouTube ────────────────────────────────────────────────────── */}
      <div>
        <label className={LABEL}>YouTube відео</label>
        <input type="hidden" name="yt_count" value={youtubes.length} />
        <div className="space-y-2">
          {youtubes.map((slot, i) => (
            <div key={i} className="flex gap-2">
              <input type="hidden" name={`yt_id_${i}`} value={slot.id ?? ''} />
              <input
                name={`yt_url_${i}`}
                type="text"
                value={slot.url}
                onChange={(e) => setYoutubes((s) => s.map((sl, j) => (j === i ? { ...sl, url: e.target.value } : sl)))}
                placeholder="https://www.youtube.com/watch?v=..."
                className={INPUT}
              />
              <button type="button" onClick={() => removeYt(i)} className={`${ICON_BTN} hover:text-red-500 hover:border-red-200`}>×</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addYt} className={ADD_BTN}>
          + Додати YouTube
        </button>
      </div>

      {isUploading && (
        <p className="text-xs text-amber-600 font-medium">
          Йде завантаження файлів — зачекайте перед збереженням…
        </p>
      )}
    </fieldset>
  )
}
