import Link from 'next/link'
import { ProductCard } from './ProductCard'
import type { ApiaryProduct } from '@/types'

interface ProductGridProps {
  products: ApiaryProduct[]
}

export function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-bark/50 text-sm">
          Наявність та ціни уточнюйте за телефоном або через{' '}
          <Link href="/contact" className="text-honey-700 underline hover:no-underline">
            форму замовлення
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
