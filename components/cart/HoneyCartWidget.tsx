'use client'

import { useState } from 'react'
import { AddToCartButton } from './AddToCartButton'
import { BuyNowButton } from './BuyNowButton'

interface HoneyCartWidgetProps {
  productSlug: string
  productName: string
  pricePlastic?: number | null
  priceGlass?: number | null
  imageUrl?: string | null
  status: string
}

export function HoneyCartWidget({ productSlug, productName, pricePlastic, priceGlass, imageUrl, status }: HoneyCartWidgetProps) {
  const hasPlastic = pricePlastic != null && pricePlastic > 0
  const hasGlass = priceGlass != null && priceGlass > 0
  const hasBothVariants = hasPlastic && hasGlass

  const defaultVariant = hasPlastic ? 'plastic' : hasGlass ? 'glass' : null
  const [selectedVariant, setSelectedVariant] = useState<'plastic' | 'glass' | null>(defaultVariant)

  const isUnavailable = status !== 'available' && status !== 'preorder'

  if (isUnavailable) {
    return (
      <div className="bg-gray-100 text-gray-600 rounded-xl px-4 py-3 text-sm font-medium text-center">
        Немає в наявності
      </div>
    )
  }

  if (!hasPlastic && !hasGlass) {
    return (
      <a href="/contact" className="inline-flex items-center justify-center w-full py-3 px-6 text-base font-semibold rounded-xl border border-honey-300 text-honey-700 hover:bg-honey-50 transition-colors">
        Уточнити ціну
      </a>
    )
  }

  const price = selectedVariant === 'plastic' ? pricePlastic! : priceGlass!
  const variantLabel = selectedVariant === 'plastic' ? '1L пластик' : '1L скло'
  const cartItemId = `honey-${productSlug}-${selectedVariant}`

  const cartItem = {
    id: cartItemId,
    productType: 'honey' as const,
    productSlug,
    name: productName,
    price,
    imageUrl: imageUrl ?? undefined,
    variant: variantLabel,
  }

  return (
    <div className="space-y-3">
      {hasBothVariants && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelectedVariant('plastic')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
              selectedVariant === 'plastic'
                ? 'bg-honey-600 text-white border-honey-600'
                : 'border-honey-200 text-bark hover:border-honey-400'
            }`}
          >
            Пластик — {pricePlastic} ₴
          </button>
          <button
            type="button"
            onClick={() => setSelectedVariant('glass')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
              selectedVariant === 'glass'
                ? 'bg-honey-600 text-white border-honey-600'
                : 'border-honey-200 text-bark hover:border-honey-400'
            }`}
          >
            Скло — {priceGlass} ₴
          </button>
        </div>
      )}

      <AddToCartButton item={cartItem} />
      <BuyNowButton item={cartItem} />
    </div>
  )
}
