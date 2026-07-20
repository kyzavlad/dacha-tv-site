'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { LOCALES, LOCALE_LABELS, splitLocale, switchLocaleHref, type Locale } from '@/lib/i18n'
import { LOCALE_SHORT, LOCALE_FLAG, ui } from '@/lib/i18n-ui'

// One reusable, accessible language dropdown. Preserves the canonical path + the
// query string, never double-prefixes, and never localizes /admin or /api (the
// switch helper returns those unchanged). Closes on selection, outside click and
// Escape. Uses client navigation (router.push) — no hard reload.
export function LanguageSwitcher({ className = '', align = 'left' }: { className?: string; align?: 'left' | 'right' }) {
  const router = useRouter()
  const pathname = usePathname() || '/'
  const search = useSearchParams()
  const { locale: active } = splitLocale(pathname)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(loc: Locale) {
    setOpen(false)
    if (loc === active) return
    const query = search?.toString() ?? ''
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    router.push(`${switchLocaleHref(loc, pathname, query)}${hash}`)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ui('languageAria', active)}
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-gray-300 transition-colors"
      >
        <span aria-hidden="true">{LOCALE_FLAG[active]}</span>
        <span className="font-medium">{LOCALE_SHORT[active]}</span>
        <span aria-hidden="true" className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ui('languageAria', active)}
          className={`absolute z-50 mt-1 min-w-[10rem] rounded-xl border border-gray-100 bg-white shadow-lg py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {LOCALES.map((loc) => {
            const isActive = loc === active
            return (
              <li key={loc} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onClick={() => choose(loc)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    isActive ? 'font-semibold text-honey-700 bg-honey-50' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span aria-hidden="true">{LOCALE_FLAG[loc]}</span>
                  <span>{LOCALE_LABELS[loc]}</span>
                  {isActive && <span className="ml-auto text-honey-600" aria-hidden="true">✓</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
