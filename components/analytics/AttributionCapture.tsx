'use client'

import { useEffect } from 'react'
import { captureAttribution } from '@/lib/analytics/attribution'

// Fire-and-forget: records UTM/referrer attribution into a cookie on first load
// so it survives navigation to checkout/inquiry. Renders nothing.
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution()
  }, [])
  return null
}
