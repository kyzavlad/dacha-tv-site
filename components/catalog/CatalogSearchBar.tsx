'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SafeImage } from '@/components/shared/SafeImage'

interface Suggestion {
  slug: string
  categorySlug: string | null
  name: string
  image: string | null
  price: string | null
  sku: string | null
}

// Storefront search with live typeahead. Still a real GET form (submits ?q= to
// /catalog) so it works with JS disabled and preserves shareable search URLs;
// the dropdown is progressive enhancement backed by /api/catalog/suggest.
export function CatalogSearchBar({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = value.trim()
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
        setSuggestions(data.suggestions ?? [])
        setOpen(true)
        setActive(-1)
      } catch {
        /* aborted or offline — keep the plain form usable */
      }
    }, 220)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [value])

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function go(s: Suggestion) {
    const cat = s.categorySlug ?? 'all'
    router.push(`/catalog/${cat}/${s.slug}`)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); go(suggestions[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <form action="/catalog" method="get" role="search" className="flex w-full gap-2">
        <input
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          placeholder="Пошук товарів за назвою або артикулом…"
          aria-label="Пошук товарів"
          aria-expanded={open}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-bark placeholder:text-gray-400 focus:outline-none focus:border-honey-400"
        />
        <button
          type="submit"
          className="rounded-xl bg-honey-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-honey-800 transition-colors"
        >
          Знайти
        </button>
      </form>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-2 w-full max-h-[70vh] overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1">
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
                    {s.sku ? `Артикул ${s.sku}` : ''}{s.sku && s.price ? ' · ' : ''}{s.price ?? ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-gray-100">
            <Link
              href={`/catalog?q=${encodeURIComponent(value.trim())}`}
              className="block px-3 py-2 text-center text-xs font-semibold text-honey-700 hover:bg-honey-50"
              onClick={() => setOpen(false)}
            >
              Показати всі результати →
            </Link>
          </li>
        </ul>
      )}
    </div>
  )
}
