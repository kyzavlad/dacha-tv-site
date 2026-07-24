import Link from 'next/link'
import { FlowerCard } from './FlowerCard'
import type { FlowerProduct } from '@/types'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

interface FlowerGridProps {
  products: FlowerProduct[]
}

export async function FlowerGrid({ products }: FlowerGridProps) {
  const locale = await getRequestLocale()
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <FlowerCard key={product.id} product={product} />
        ))}
      </div>

      {products.length === 0 && (
        <div className="text-center py-20">
          <span className="text-4xl mb-4 block select-none">🌸</span>
          <p className="text-gray-400 text-sm">
            {tr({ uk: 'Каталог поповнюється. Уточнюйте наявність через', ru: 'Каталог пополняется. Уточняйте наличие через' }, locale)}{' '}
            <Link href={localizedPath(locale, '/contact')} className="text-gray-600 underline hover:no-underline">
              {tr({ uk: 'форму запиту', ru: 'форму запроса' }, locale)}
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  )
}
