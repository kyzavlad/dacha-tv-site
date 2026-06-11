import Link from 'next/link'
import { HoneyCard } from './HoneyCard'
import type { HoneyProduct } from '@/types'

interface HoneyGridProps {
  products: HoneyProduct[]
}

export function HoneyGrid({ products }: HoneyGridProps) {
  if (products.length === 0) {
    return (
      <p className="text-center text-bark/50 text-sm py-12">
        Актуальна наявність і ціни — за телефоном або через{' '}
        <Link href="/contact" className="text-honey-700 underline hover:no-underline">
          форму замовлення
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.map((product) => (
        <HoneyCard key={product.id} product={product} />
      ))}
    </div>
  )
}
