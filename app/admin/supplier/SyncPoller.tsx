'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export function SyncPoller({ active }: { active: boolean }) {
  const router = useRouter()
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) {
      if (ref.current) { clearInterval(ref.current); ref.current = null }
      return
    }
    ref.current = setInterval(() => router.refresh(), 4000)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [active, router])

  return null
}
