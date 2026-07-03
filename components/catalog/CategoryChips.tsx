import Link from 'next/link'
import type { CatalogCategory } from '@/types'
import { categoryDisplayName } from '@/lib/supabase/catalog'

// Static, horizontally-scrollable category navigation chips. Pure links — NO
// per-result counts (which would require scanning the match set), so this adds
// zero DB cost. Used above search results and in the empty state to keep a large
// catalog navigable.
export function CategoryChips({ categories, label }: { categories: CatalogCategory[]; label?: string }) {
  if (categories.length === 0) return null
  return (
    <div className="mb-6">
      {label && <p className="text-xs font-semibold text-bark/50 uppercase tracking-wide mb-2">{label}</p>}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/catalog/${cat.slug}`}
            className="flex-shrink-0 rounded-full border border-honey-200 bg-white px-3.5 py-1.5 text-sm text-bark/80 hover:border-honey-400 hover:text-honey-800 transition-colors whitespace-nowrap"
          >
            {categoryDisplayName(cat.name_ua)}
          </Link>
        ))}
        <Link
          href="/catalog/all"
          className="flex-shrink-0 rounded-full border border-honey-300 bg-honey-50 px-3.5 py-1.5 text-sm font-medium text-honey-800 hover:bg-honey-100 transition-colors whitespace-nowrap"
        >
          Усі товари →
        </Link>
      </div>
    </div>
  )
}
