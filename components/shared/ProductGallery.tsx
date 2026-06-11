'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'

export interface GalleryImage {
  src: string
  alt: string
}

interface ProductGalleryProps {
  images: GalleryImage[]
  blurDataURL?: string
  isUnavailable?: boolean
  priority?: boolean
  /** Fallback content shown when images is empty */
  children?: React.ReactNode
  /** Optional badge label shown top-left on the main image */
  featuredLabel?: string
  /** Tailwind bg class for the badge, e.g. "bg-honey-600" */
  featuredBadgeClass?: string
}

export function ProductGallery({
  images,
  blurDataURL,
  isUnavailable,
  priority,
  children,
  featuredLabel,
  featuredBadgeClass = 'bg-gray-900',
}: ProductGalleryProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => { setActiveIdx(0) }, [images])

  const prev = useCallback(() => {
    setActiveIdx((i) => (i - 1 + images.length) % images.length)
  }, [images.length])

  const next = useCallback(() => {
    setActiveIdx((i) => (i + 1) % images.length)
  }, [images.length])

  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false)
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, prev, next])

  const active = images[activeIdx]

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-50">
        {active ? (
          <>
            <Image
              src={active.src}
              alt={active.alt}
              fill
              priority={priority}
              className="object-cover cursor-zoom-in"
              sizes="(max-width: 1024px) 100vw, 50vw"
              {...(blurDataURL ? { placeholder: 'blur' as const, blurDataURL } : {})}
              onClick={() => setLightboxOpen(true)}
            />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); prev() }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full shadow hover:bg-white transition-colors"
                  aria-label="Попереднє фото"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); next() }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full shadow hover:bg-white transition-colors"
                  aria-label="Наступне фото"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </>
        ) : (
          children ?? null
        )}

        {featuredLabel && (
          <div className="absolute top-4 left-4 z-10">
            <span className={`${featuredBadgeClass} text-white text-sm font-semibold px-3 py-1.5 rounded-full`}>
              {featuredLabel}
            </span>
          </div>
        )}

        {isUnavailable && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
            <span className="bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-full">
              Немає в наявності
            </span>
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                i === activeIdx ? 'border-gray-800' : 'border-transparent hover:border-gray-300'
              }`}
              aria-label={`Фото ${i + 1}`}
              aria-pressed={i === activeIdx}
            >
              <Image src={img.src} alt={img.alt} fill className="object-cover" sizes="64px" />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Переглянути фото"
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            onClick={() => setLightboxOpen(false)}
            aria-label="Закрити"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); prev() }}
                aria-label="Попереднє фото"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                onClick={(e) => { e.stopPropagation(); next() }}
                aria-label="Наступне фото"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          <div
            className="relative w-full h-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={active.src}
              alt={active.alt}
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 80vw"
            />
          </div>

          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveIdx(i) }}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === activeIdx ? 'bg-white' : 'bg-white/40 hover:bg-white/70'
                  }`}
                  aria-label={`Фото ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
