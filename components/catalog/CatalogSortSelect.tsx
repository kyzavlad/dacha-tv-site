'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { CATALOG_SORTS } from '@/lib/supabase/catalog'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { catalogDict, catalogSortLabel } from '@/lib/i18n/sections/catalog'

// Lightweight sort dropdown. Navigates by rewriting the URL query (?sort=…),
// resetting pagination, so the listing itself stays server-rendered. No state,
// no data fetching on the client — just a router push on change.
export function CatalogSortSelect({ value, locale = DEFAULT_LOCALE }: { value: string; locale?: Locale }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = catalogDict(locale)

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    if (e.target.value === 'featured') params.delete('sort')
    else params.set('sort', e.target.value)
    params.delete('page') // any re-sort returns to page 1
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <label className="flex items-center gap-2 text-sm text-gray-500">
      <span className="hidden sm:inline">{t.sortPrefix}</span>
      <select
        value={value}
        onChange={handleChange}
        aria-label={t.sortAria}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-bark focus:outline-none focus:border-honey-400 cursor-pointer"
      >
        {CATALOG_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {catalogSortLabel(t, s.value)}
          </option>
        ))}
      </select>
    </label>
  )
}
