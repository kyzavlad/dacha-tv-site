import Link from 'next/link'
import { CATALOG_PAGE_SIZE } from '@/lib/supabase/catalog'

interface PaginationProps {
  page: number
  total: number
  baseHref: string  // e.g. /catalog/electronics — ?page=N appended
}

export function Pagination({ page, total, baseHref }: PaginationProps) {
  const totalPages = Math.ceil(total / CATALOG_PAGE_SIZE)
  if (totalPages <= 1) return null

  function pageUrl(p: number) {
    return p === 1 ? baseHref : `${baseHref}?page=${p}`
  }

  // Show at most 7 page numbers: first, last, current ±2, with ellipsis
  const range: (number | '...')[] = []
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - 2 && p <= page + 2)) {
      range.push(p)
    } else if (range[range.length - 1] !== '...') {
      range.push('...')
    }
  }

  return (
    <nav aria-label="Сторінки" className="flex items-center justify-center gap-1 flex-wrap mt-10">
      {page > 1 && (
        <Link
          href={pageUrl(page - 1)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          aria-label="Попередня сторінка"
        >
          ←
        </Link>
      )}

      {range.map((item, i) =>
        item === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 py-2 text-sm text-gray-400 select-none">…</span>
        ) : (
          <Link
            key={item}
            href={pageUrl(item)}
            className={`min-w-[36px] px-3 py-2 text-sm rounded-lg text-center transition-colors ${
              item === page
                ? 'bg-bark text-white font-semibold'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </Link>
        )
      )}

      {page < totalPages && (
        <Link
          href={pageUrl(page + 1)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          aria-label="Наступна сторінка"
        >
          →
        </Link>
      )}
    </nav>
  )
}
