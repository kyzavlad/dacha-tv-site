'use client'

import type { ReactNode } from 'react'
import { trackPhoneClick } from '@/lib/analytics/gtag'

// A minimal client wrapper around a raw `tel:` anchor that fires the GA4/Ads
// `phone_click` event on click WITHOUT changing any visual styling. Use it in
// server components (which can't attach onClick) where PhoneLink's own markup/
// formatting would alter the existing design — pass the exact classes and the
// already-formatted display text as children.
export function TrackedPhoneLink({
  phone,
  className,
  location,
  children,
}: {
  phone: string
  className?: string
  location?: string
  children: ReactNode
}) {
  return (
    <a href={`tel:${phone}`} className={className} onClick={() => trackPhoneClick(phone, location)}>
      {children}
    </a>
  )
}
