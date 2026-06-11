'use client'
import { useState, useCallback } from 'react'

const INPUT =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent'
const LABEL = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'
const ICON_BTN =
  'shrink-0 h-8 w-8 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors text-base leading-none'
const ADD_BTN =
  'inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors'
const FILE_INPUT =
  'w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer'

interface GallerySlot {
  url: string
  preview: string
}

interface MediaFieldsProps {
  imageUrl?: string | null
  imageAlt?: string | null
  galleryImages?: string[] | null
  videoUrl?: string | null
  youtubeUrl?: string | null
  youtubeFieldName?: string
  youtubeUrls?: string[] | null
  productName?: string
}

export function MediaFields({
  imageUrl,
  imageAlt,
  galleryImages,
  videoUrl,
  youtubeUrl,
  youtubeFieldName = 'youtube_video_url',
  youtubeUrls,
  productName = '',
}: MediaFieldsProps) {
  const [imagePreview, setImagePreview] = useState(imageUrl ?? '')
  const [imageUrlState, setImageUrlState] = useState(imageUrl ?? '')
  const [imageAltState, setImageAltState] = useState(imageAlt ?? '')
  const [videoPreview, setVideoPreview] = useState(videoUrl ?? '')
  const [videoUrlState, setVideoUrlState] = useState(videoUrl ?? '')
  const [slots, setSlots] = useState<GallerySlot[]>(() =>
    (galleryImages ?? []).filter(Boolean).map((u) => ({ url: u, preview: u })),
  )
  const [primaryYt, setPrimaryYt] = useState(youtubeUrl ?? '')
  const [extraYts, setExtraYts] = useState<string[]>(() => (youtubeUrls ?? []).filter(Boolean))

  const handleMainFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImagePreview(URL.createObjectURL(file))
  }, [])

  const handleVideoFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setVideoPreview(URL.createObjectURL(file))
  }, [])

  const handleGalleryFileChange = useCallback((i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setSlots((s) => s.map((slot, j) => (j === i ? { ...slot, preview } : slot)))
  }, [])

  return (
    <fieldset className="border-t border-gray-100 pt-5 space-y-5">
      <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Медіа</legend>

      {/* Main image */}
      <div>
        <label className={LABEL}>Головне зображення</label>
        {imagePreview && (
          <div className="mb-2 h-32 rounded-xl overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <input
          type="file"
          name="image_file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/avif"
          onChange={handleMainFileChange}
          className={FILE_INPUT}
        />
        <details className="mt-2">
          <summary className="text-xs text-gray-400 cursor-pointer select-none hover:text-gray-600">
            URL (резервний варіант)
          </summary>
          <input
            name="image_url"
            type="text"
            value={imageUrlState}
            onChange={(e) => {
              setImageUrlState(e.target.value)
              if (!e.target.value.startsWith('blob:')) setImagePreview(e.target.value)
            }}
            placeholder="/images/dacha-tv/... або https://..."
            className={`${INPUT} mt-1.5`}
          />
        </details>
      </div>

      {/* Alt text */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Alt-текст</span>
          {productName && (
            <button
              type="button"
              onClick={() => setImageAltState(`${productName} — Dacha TV`)}
              className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2"
            >
              Авто
            </button>
          )}
        </div>
        <input
          name="image_alt"
          type="text"
          value={imageAltState}
          onChange={(e) => setImageAltState(e.target.value)}
          placeholder="Опис зображення для SEO"
          className={INPUT}
        />
      </div>

      {/* Gallery — unlimited */}
      <div>
        <label className={LABEL}>Галерея</label>
        <input type="hidden" name="gallery_slot_count" value={slots.length} />
        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1.5">
                {slot.preview && (
                  <div className="h-20 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slot.preview} alt="" className="max-h-full max-w-full object-contain" />
                  </div>
                )}
                <input type="hidden" name={`gallery_url_${i}`} value={slot.url} />
                <input
                  type="file"
                  name={`gallery_file_${i}`}
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/avif"
                  onChange={(e) => handleGalleryFileChange(i, e)}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() => setSlots((s) => s.filter((_, j) => j !== i))}
                className={ICON_BTN}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSlots((s) => [...s, { url: '', preview: '' }])}
            className={ADD_BTN}
          >
            + Додати фото
          </button>
        </div>
      </div>

      {/* Video file */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className={LABEL} style={{ marginBottom: 0 }}>Відео файл (mp4 / webm / mov)</label>
          {videoUrlState && (
            <button
              type="button"
              onClick={() => { setVideoPreview(''); setVideoUrlState('') }}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Видалити відео
            </button>
          )}
        </div>
        {videoPreview && (
          <div className="mb-2 rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
            <video src={videoPreview} controls className="w-full max-h-40 object-contain" />
          </div>
        )}
        {videoUrlState && !videoPreview.startsWith('blob:') && (
          <p className="text-xs text-gray-400 mb-2 truncate" title={videoUrlState}>
            Поточне: {videoUrlState}
          </p>
        )}
        <input type="hidden" name="video_url" value={videoUrlState} />
        <input
          type="file"
          name="video_file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleVideoFileChange}
          className={FILE_INPUT}
        />
      </div>

      {/* Primary YouTube */}
      <div>
        <label className={LABEL}>YouTube (головне відео)</label>
        <input
          name={youtubeFieldName}
          type="text"
          value={primaryYt}
          onChange={(e) => setPrimaryYt(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className={INPUT}
        />
      </div>

      {/* Additional YouTube — unlimited */}
      <div>
        <label className={LABEL}>Додаткові YouTube відео</label>
        <div className="space-y-2">
          {extraYts.map((url, i) => (
            <div key={i} className="flex gap-2">
              <input
                name="youtube_video_urls"
                type="text"
                value={url}
                onChange={(e) => setExtraYts((y) => y.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder="https://www.youtube.com/watch?v=..."
                className={INPUT}
              />
              <button
                type="button"
                onClick={() => setExtraYts((y) => y.filter((_, j) => j !== i))}
                className={ICON_BTN}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setExtraYts((y) => [...y, ''])}
            className={ADD_BTN}
          >
            + Додати YouTube відео
          </button>
        </div>
      </div>
    </fieldset>
  )
}
