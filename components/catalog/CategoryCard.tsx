import Link from 'next/link'
import Image from 'next/image'
import type { CatalogCategory } from '@/types'
import { categoryDisplayName } from '@/lib/supabase/catalog'

interface CategoryCardProps {
  category: CatalogCategory
  productCount?: number
}

function categoryIcon(slug: string): string {
  const s = slug.toLowerCase()
  if (s.includes('sad') || s.includes('garden') || s.includes('rost') || s.includes('roslun')) return '🌿'
  if (s.includes('instrument') || s.includes('tool') || s.includes('elektroinstrument')) return '🔧'
  if (s.includes('mebli') || s.includes('furniture') || s.includes('stil') || s.includes('krisle')) return '🪑'
  if (s.includes('osvitlen') || s.includes('lamp') || s.includes('light')) return '💡'
  if (s.includes('kukhnia') || s.includes('kitchen') || s.includes('kukhon')) return '🍳'
  if (s.includes('van') || s.includes('bath') || s.includes('dush')) return '🚿'
  if (s.includes('sport') || s.includes('fitnes')) return '🏃'
  if (s.includes('dytia') || s.includes('child') || s.includes('igrashk')) return '🧸'
  if (s.includes('avto') || s.includes('auto') || s.includes('mashun')) return '🚗'
  if (s.includes('elektro') || s.includes('cable') || s.includes('kabel')) return '🔌'
  if (s.includes('bud') || s.includes('construct') || s.includes('remon')) return '🏗️'
  if (s.includes('zhyvot') || s.includes('pet') || s.includes('tvar')) return '🐾'
  return '📦'
}

export function CategoryCard({ category, productCount }: CategoryCardProps) {
  const displayName = categoryDisplayName(category.name_ua)
  return (
    <Link
      href={`/catalog/${category.slug}`}
      className="group block bg-white rounded-2xl overflow-hidden border border-honey-100 shadow-sm hover:shadow-md transition-all"
    >
      <div className="relative aspect-[4/3] bg-honey-50 overflow-hidden">
        {category.image_url ? (
          <Image
            src={category.image_url}
            alt={displayName}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-honey-50 to-forest-50 gap-2">
            <span className="text-4xl opacity-40 group-hover:opacity-60 transition-opacity" aria-hidden="true">
              {categoryIcon(category.slug)}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h2 className="font-serif font-semibold text-bark text-base leading-tight mb-1 group-hover:text-honey-700 transition-colors">
          {displayName}
        </h2>
        {productCount != null && productCount > 0 && (
          <p className="text-xs text-gray-400">{productCount} товарів</p>
        )}
        {category.description && (
          <p className="text-xs text-bark/50 line-clamp-2 mt-1">{category.description}</p>
        )}
      </div>
    </Link>
  )
}
