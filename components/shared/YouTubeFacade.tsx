'use client'

import { useState } from 'react'
import Image from 'next/image'

interface YouTubeFacadeProps {
  videoId: string
  title: string
  className?: string
}

export function YouTubeFacade({ videoId, title, className }: YouTubeFacadeProps) {
  const [loaded, setLoaded] = useState(false)
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`

  if (loaded) {
    return (
      <div className={`relative w-full aspect-video ${className ?? ''}`}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`}
          title={title}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full rounded-xl"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setLoaded(true)}
      className={`relative w-full aspect-video cursor-pointer group rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-honey-600 focus:ring-offset-2 ${className ?? ''}`}
      aria-label={`Відтворити відео: ${title}`}
    >
      <Image
        src={thumbnailUrl}
        alt={`Мініатюра відео: ${title}`}
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-105"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 800px"
      />
      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 md:w-20 md:h-20 bg-red-600 rounded-full flex items-center justify-center shadow-xl group-hover:bg-red-700 transition-colors">
          <svg
            className="w-7 h-7 md:w-9 md:h-9 text-white ml-1"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
        <p className="text-white text-sm font-medium line-clamp-2">{title}</p>
      </div>
    </button>
  )
}
