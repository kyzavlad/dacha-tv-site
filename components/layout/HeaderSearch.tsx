'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SafeImage } from '@/components/shared/SafeImage'
import { localizedPath, type Locale } from '@/lib/i18n'
import { useLocale } from '@/lib/i18n/locale-context'

interface Suggestion {
  slug: string
  categorySlug: string | null
  name: string
  image: string | null
  price: string | null
  sku: string | null
}

// Locale-aware storefront strings for the header search.
const STRINGS: Record<Locale, { placeholder: string; find: string; aria: string; all: string }> = {
  uk: { placeholder: 'Пошук товарів...', find: 'Знайти', aria: 'Пошук товарів', all: 'Показати всі результати →' },
  ru: { placeholder: 'Поиск товаров...', find: 'Найти', aria: 'Поиск товаров', all: 'Показать все результаты →' },
  en: { placeholder: 'Search products...', find: 'Search', aria: 'Search products', all: 'Show all results →' },
}

// Global header search: a real GET form (works without JS, shareable ?q= URLs)
// with progressive-enhancement typeahead from /api/catalog/suggest. Locale-aware:
// placeholders localize and submit/suggestion links keep the active /ru or /en
// prefix. Submits to <locale>/search?q=…
export function HeaderSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const locale = useLocale()
  const t = STRINGS[locale]
  const searchPath = localizedPath(locale, '/search')

  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controller = useRef<AbortController | null>(null)

  // Debounced fetch is triggered directly from the input's onChange handler
  // (a user-initiated event, not an effect keyed on `value`) so state updates
  // stay tied to the interaction that caused them.
  function handleValueChange(next: string) {
    setValue(next)
    const q = next.trim()
    if (debounce.current) clearTimeout(debounce.current)
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    debounce.current = setTimeout(async () => {
      controller.current?.abort()
      controller.current = new AbortController()
      try {
        const res = await fetch(`/api/catalog/suggest?q=${encodeURIComponent(q)}`, { signal: controller.current.signal })
        const data = (await res.json()) as { suggestions?: Suggestion[] }
        setSuggestions((data.suggestions ?? []).slice(0, 8))
        setOpen(true)
        setActive(-1)
      } catch {
        /* aborted or offline — the plain form still submits */
      }
    }, 220)
  }

  useEffect(() => {
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function go(s: Suggestion) {
    const cat = s.categorySlug ?? 'all'
    router.push(localizedPath(locale, `/catalog/${cat}/${s.slug}`))
    setOpen(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const q = value.trim()
    if (!q) return
    setOpen(false)
    router.push(`${searchPath}?q=${encodeURIComponent(q)}`)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); go(suggestions[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={boxRef} className={`relative w-full ${compact ? '' : 'max-w-2xl'}`}>
      <form action={searchPath} method="get" role="search" onSubmit={submit} className="flex w-full gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400" aria-hidden="true">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
          </span>
          <input
            type="search"
            name="q"
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            placeholder={t.placeholder}
            aria-label={t.aria}
            aria-expanded={open}
            className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-bark placeholder:text-gray-400 focus:outline-none focus:border-honey-400"
          />
        </div>
        <button
          type="submit"
          className="flex-shrink-0 rounded-xl bg-honey-700 px-4 sm:px-5 py-2.5 text-sm font-semibold text-white hover:bg-honey-800 transition-colors"
        >
          {t.find}
        </button>
      </form>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-2 w-full max-h-[70vh] overflow-auto rounded-xl border border-gray-200 bg-white shadow-xl py-1">
          {suggestions.map((s, i) => (
            <li key={s.slug}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? 'bg-honey-50' : 'hover:bg-gray-50'}`}
              >
                <span className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-honey-50">
                  <SafeImage
                    src={s.image}
                    alt={s.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    fallback={<span className="flex h-full w-full items-center justify-center text-base opacity-40">🌿</span>}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-bark">{s.name}</span>
                  <span className="block truncate text-[11px] text-bark/40">
                    {s.sku ? `${s.sku}` : ''}{s.sku && s.price ? ' · ' : ''}{s.price ?? ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-gray-100">
            <Link
              href={`${searchPath}?q=${encodeURIComponent(value.trim())}`}
              className="block px-3 py-2 text-center text-xs font-semibold text-honey-700 hover:bg-honey-50"
              onClick={() => setOpen(false)}
            >
              {t.all}
            </Link>
          </li>
        </ul>
      )}
    </div>
  )
}
