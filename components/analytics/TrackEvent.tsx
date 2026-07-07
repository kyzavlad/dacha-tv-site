'use client'

import { useEffect, useRef } from 'react'
import { trackViewItem, trackSearch, type AnalyticsItem } from '@/lib/analytics/gtag'

// Fire-on-mount trackers for server-rendered pages. Each guards against the
// React strict-mode / re-render double fire with a ref, and depends only on the
// serialisable identifier so navigating between products re-fires correctly.

export function TrackViewItem({ item }: { item: AnalyticsItem }) {
  const fired = useRef<string | null>(null)
  useEffect(() => {
    if (fired.current === item.item_id) return
    fired.current = item.item_id
    trackViewItem(item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.item_id])
  return null
}

export function TrackSearch({ term, resultCount }: { term: string; resultCount?: number }) {
  const fired = useRef<string | null>(null)
  useEffect(() => {
    const key = `${term}::${resultCount ?? ''}`
    if (fired.current === key) return
    fired.current = key
    trackSearch(term, resultCount)
  }, [term, resultCount])
  return null
}
