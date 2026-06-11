'use client'

import { useState } from 'react'

// Photo-review carousel. Uses static files public/reviews/review-01.jpg …
// review-10.jpg. Images are NOT required to exist at build time — any that fail
// to load are hidden, and if none load the whole strip renders nothing.
const PHOTOS = Array.from({ length: 10 }, (_, i) => `/reviews/review-${String(i + 1).padStart(2, '0')}.jpg`)

export function ReviewPhotos() {
  const [broken, setBroken] = useState<Set<string>>(new Set())
  const visible = PHOTOS.filter((src) => !broken.has(src))

  // Hide the section entirely once we know every image is missing.
  if (broken.size >= PHOTOS.length) return null

  return (
    <div className="mt-14">
      <h3 className="text-center font-serif text-2xl font-bold text-bark mb-6">Фото від покупців</h3>
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0">
        {visible.map((src) => (
          // Plain <img> so a missing static file degrades gracefully (no build-time check).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt="Фото-відгук покупця Дача TV"
            loading="lazy"
            onError={() => setBroken((prev) => new Set(prev).add(src))}
            className="snap-start flex-shrink-0 w-44 h-56 sm:w-52 sm:h-64 object-cover rounded-2xl border border-gray-100 bg-honey-50"
          />
        ))}
      </div>
    </div>
  )
}
