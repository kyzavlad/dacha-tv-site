'use client'

import { useEffect, useRef } from 'react'

// Fire-and-forget logging of an internal search to /api/search-log. Runs AFTER
// the results render (client-side), so it never blocks or slows search. Deduped
// per session (same query+count) so a refresh doesn't spam the log. Any failure
// is ignored — logging must never affect the shopper.
export function SearchLogger({
  query,
  locale,
  resultCount,
  path,
}: {
  query: string
  locale: string
  resultCount: number
  path: string
}) {
  const fired = useRef<string | null>(null)
  useEffect(() => {
    const key = `sl:${query.toLowerCase()}:${resultCount}`
    if (fired.current === key) return
    fired.current = key
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch { /* sessionStorage may be unavailable — still log once per mount */ }

    try {
      fetch('/api/search-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, locale, resultCount, path }),
        keepalive: true,
      }).catch(() => {})
    } catch { /* ignore */ }
  }, [query, locale, resultCount, path])

  return null
}
