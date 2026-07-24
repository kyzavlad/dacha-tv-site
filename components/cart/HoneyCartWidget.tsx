'use client'

import { AddToCartButton } from './AddToCartButton'
import { BuyNowButton } from './BuyNowButton'
import { useLocale } from '@/lib/i18n/locale-context'
import { tr } from '@/lib/i18n/pages'

interface HoneyCartWidgetProps {
  productSlug: string
  productName: string
  // Single canonical price (UAH / 1 L). Honey no longer has plastic/glass
  // variants — one price, one button.
  price?: number | null
  imageUrl?: string | null
  status: string
}

export function HoneyCartWidget({ productSlug, productName, price, imageUrl, status }: HoneyCartWidgetProps) {
  const locale = useLocale()
  const isUnavailable = status !== 'available' && status !== 'preorder'

  if (isUnavailable) {
    return (
      <div className="bg-gray-100 text-gray-600 rounded-xl px-4 py-3 text-sm font-medium text-center">
        {tr({ uk: 'Немає в наявності', ru: 'Нет в наличии' }, locale)}
      </div>
    )
  }

  if (price == null || price <= 0) {
    return (
      <a href="/contact" className="inline-flex items-center justify-center w-full py-3 px-6 text-base font-semibold rounded-xl border border-honey-300 text-honey-700 hover:bg-honey-50 transition-colors">
        {tr({ uk: 'Уточнити ціну', ru: 'Уточнить цену' }, locale)}
      </a>
    )
  }

  const cartItem = {
    id: `honey-${productSlug}`,
    productType: 'honey' as const,
    productSlug,
    name: productName,
    price,
    imageUrl: imageUrl ?? undefined,
    variant: '1 л',
  }

  return (
    <div className="space-y-3">
      <AddToCartButton item={cartItem} />
      <BuyNowButton item={cartItem} />
    </div>
  )
}
