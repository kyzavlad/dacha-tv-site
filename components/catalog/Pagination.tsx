import Link from 'next/link'
import { CATALOG_PAGE_SIZE } from '@/lib/supabase/catalog'
import { getRequestLocale } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

interface PaginationLabels {
  prev: string
  next: string
  pageOf: (page: number, total: number) => string
}

interface PaginationProps {
  page: number
  total: number
  baseHref: string  // e.g. /catalog/electronics — ?page=N appended
  // Extra query params to preserve across page links (e.g. { sort: 'price_asc' }).
  params?: Record<string, string | undefined>
  // Localized button/indicator copy. Falls back to Ukrainian when omitted.
  labels?: PaginationLabels
  // Optional override for "is there a next page". Search cannot cheaply COUNT its
  // merged (text + category + SKU) result set, so it paginates by the proven
  // page-full heuristic: pass hasNext = (products.length >= PAGE_SIZE). When true
  // this guarantees a Next link (and a clickable page+1) even if the display total
  // would otherwise round down. Category leaves it undefined and uses the exact total.
  hasNext?: boolean
}

export async function Pagination({ page, total, baseHref, params, labels, hasNext }: PaginationProps) {
  const locale = await getRequestLocale()
  const defaultLabels: PaginationLabels = {
    prev: tr({ uk: 'Попередня', ru: 'Предыдущая' }, locale),
    next: tr({ uk: 'Наступна', ru: 'Следующая' }, locale),
    pageOf: (page, total) =>
      `${tr({ uk: 'Сторінка', ru: 'Страница' }, locale)} ${page} ${tr({ uk: 'з', ru: 'из' }, locale)} ${total}`,
  }
  const l = labels ?? defaultLabels
  const countedPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE))
  // When the caller supplies a page-full "hasNext" hint that reaches past the
  // counted total, extend the last page so Next / page+1 stay reachable.
  const lastPage = Math.max(countedPages, hasNext ? page + 1 : 1)
  const canPrev = page > 1
  const canNext = page < lastPage

  if (lastPage <= 1) return null

  function pageUrl(p: number) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v) sp.set(k, v)
    }
    if (p > 1) sp.set('page', String(p))
    const qs = sp.toString()
    return qs ? `${baseHref}?${qs}` : baseHref
  }

  // Show at most 7 page numbers: first, last, current ±2, with ellipsis
  const range: (number | '...')[] = []
  for (let p = 1; p <= lastPage; p++) {
    if (p === 1 || p === lastPage || (p >= page - 2 && p <= page + 2)) {
      range.push(p)
    } else if (range[range.length - 1] !== '...') {
      range.push('...')
    }
  }

  const arrowBtn = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors'
  const arrowDisabled = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-100 text-gray-300 cursor-not-allowed select-none'

  return (
    <nav aria-label={tr({ uk: 'Сторінки', ru: 'Страницы' }, locale)} className="flex flex-col items-center gap-3 mt-10">
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {canPrev ? (
          <Link href={pageUrl(page - 1)} className={arrowBtn} aria-label={l.prev} rel="prev">
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">{l.prev}</span>
          </Link>
        ) : (
          <span className={arrowDisabled} aria-disabled="true">
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">{l.prev}</span>
          </span>
        )}

        {range.map((item, i) =>
          item === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 py-2 text-sm text-gray-400 select-none">…</span>
          ) : (
            <Link
              key={item}
              href={pageUrl(item)}
              className={`min-w-[40px] px-3 py-2 text-sm rounded-lg text-center transition-colors ${
                item === page
                  ? 'bg-bark text-white font-semibold'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
              aria-current={item === page ? 'page' : undefined}
            >
              {item}
            </Link>
          )
        )}

        {canNext ? (
          <Link href={pageUrl(page + 1)} className={arrowBtn} aria-label={l.next} rel="next">
            <span className="hidden sm:inline">{l.next}</span>
            <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <span className={arrowDisabled} aria-disabled="true">
            <span className="hidden sm:inline">{l.next}</span>
            <span aria-hidden="true">→</span>
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400">{l.pageOf(page, lastPage)}</p>
    </nav>
  )
}
