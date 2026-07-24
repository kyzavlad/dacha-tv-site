import Link from 'next/link'
import { HoneyCard } from './HoneyCard'
import type { HoneyProduct } from '@/types'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

interface HoneyGridProps {
  products: HoneyProduct[]
}

export async function HoneyGrid({ products }: HoneyGridProps) {
  const locale = await getRequestLocale()
  if (products.length === 0) {
    return (
      <p className="text-center text-bark/50 text-sm py-12">
        {tr({ uk: 'Актуальна наявність і ціни — за телефоном або через', ru: 'Актуальное наличие и цены — по телефону или через' }, locale)}{' '}
        <Link href={localizedPath(locale, '/contact')} className="text-honey-700 underline hover:no-underline">
          {tr({ uk: 'форму замовлення', ru: 'форму заказа' }, locale)}
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
