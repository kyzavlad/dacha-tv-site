'use client'

import { useState, type ReactNode } from 'react'

interface SafeImageProps {
  src: string | null | undefined
  alt: string
  /** Classes applied to the <img>. Caller controls layout (e.g. absolute inset-0 object-cover). */
  className?: string
  /** Rendered when there is no src or the image fails to load (404/blocked). */
  fallback: ReactNode
}

// Renders EXTERNAL supplier product images (e.g. https://images.zone/...) with a
// plain <img>, deliberately bypassing Next.js image optimization — the Vercel
// Hobby optimizer returns 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED for these
// URLs. Local images and the logo keep using next/image and are unaffected.
//
// On a missing or broken image the `fallback` node is shown instead, so a broken
// image icon / empty alt text never reaches the customer.
export function SafeImage({ src, alt, className, fallback }: SafeImageProps) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) return <>{fallback}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  )
}
