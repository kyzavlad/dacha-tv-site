import Link from 'next/link'
import { ProductCard } from './ProductCard'
import type { ApiaryProduct } from '@/types'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

interface ProductGridProps {
  products: ApiaryProduct[]
}

export async function ProductGrid({ products }: ProductGridProps) {
  const locale = await getRequestLocale()
  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-bark/50 text-sm">
          {tr({ uk: 'Наявність та ціни уточнюйте за телефоном або через', ru: 'Наличие и цены уточняйте по телефону или через' }, locale)}{' '}
          <Link href={localizedPath(locale, '/contact')} className="text-honey-700 underline hover:no-underline">
            {tr({ uk: 'форму замовлення', ru: 'форму заказа' }, locale)}
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
