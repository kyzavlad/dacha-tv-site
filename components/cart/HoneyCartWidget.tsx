'use client'

import { AddToCartButton } from './AddToCartButton'
import { BuyNowButton } from './BuyNowButton'
import { localizedPath } from '@/lib/i18n'
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
  const unitLabel = tr({ uk: '1 л', ru: '1 л', en: '1 L' }, locale)

  if (isUnavailable) {
    return (
      <div className="bg-gray-100 text-gray-600 rounded-xl px-4 py-3 text-sm font-medium text-center">
        {tr({ uk: 'Немає в наявності', ru: 'Нет в наличии', en: 'Out of stock' }, locale)}
      </div>
    )
  }

  if (price == null || price <= 0) {
    return (
      <a href={localizedPath(locale, '/contact')} className="inline-flex items-center justify-center w-full py-3 px-6 text-base font-semibold rounded-xl border border-honey-300 text-honey-700 hover:bg-honey-50 transition-colors">
        {tr({ uk: 'Уточнити ціну', ru: 'Уточнить цену', en: 'Ask for price' }, locale)}
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
    variant: unitLabel,
  }

  return (
    <div className="space-y-3">
      <AddToCartButton item={cartItem} />
      <BuyNowButton item={cartItem} />
    </div>
  )
}
