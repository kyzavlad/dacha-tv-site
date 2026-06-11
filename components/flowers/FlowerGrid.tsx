import Link from 'next/link'
import { FlowerCard } from './FlowerCard'
import type { FlowerProduct } from '@/types'

interface FlowerGridProps {
  products: FlowerProduct[]
}

export function FlowerGrid({ products }: FlowerGridProps) {
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
            Каталог поповнюється. Уточнюйте наявність через{' '}
            <Link href="/contact" className="text-gray-600 underline hover:no-underline">
              форму запиту
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  )
}
