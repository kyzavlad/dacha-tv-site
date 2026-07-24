'use client'

import { useState } from 'react'
import { useCart, type CartItem } from '@/lib/cart/CartContext'
import { useLocale } from '@/lib/i18n/locale-context'
import { tr } from '@/lib/i18n/pages'

interface AddToCartButtonProps {
  item: Omit<CartItem, 'quantity'>
  quantity?: number
  label?: string
  className?: string
  compact?: boolean
  // When true, the product is out of stock: the button is disabled and shows an
  // "unavailable" label. Enforced authoritatively again at checkout (server).
  outOfStock?: boolean
  outOfStockLabel?: string
}

export function AddToCartButton({ item, quantity = 1, label, className, compact, outOfStock, outOfStockLabel }: AddToCartButtonProps) {
  const { addItem } = useCart()
  const locale = useLocale()
  const [added, setAdded] = useState(false)

  const resolvedLabel = label ?? tr({ uk: 'До кошика', ru: 'В корзину' }, locale)
  const resolvedOutOfStock = outOfStockLabel ?? tr({ uk: 'Немає в наявності', ru: 'Нет в наличии' }, locale)

  function handleClick() {
    if (outOfStock) return
    addItem({ ...item, quantity })
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
  }

  const base = compact
    ? 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors'
    : 'inline-flex items-center justify-center gap-2 w-full py-3 px-6 text-base font-semibold rounded-xl transition-colors'

  const colors = outOfStock
    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
    : added
    ? 'bg-green-600 text-white'
    : 'bg-honey-600 hover:bg-honey-700 text-white'

  if (outOfStock) {
    return (
      <button type="button" disabled aria-disabled="true" className={`${base} ${colors} ${className ?? ''}`}>
        {resolvedOutOfStock}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${base} ${colors} ${className ?? ''}`}
    >
      {added ? (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {tr({ uk: 'Додано', ru: 'Добавлено' }, locale)}
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6h11" />
          </svg>
          {resolvedLabel}
        </>
      )}
    </button>
  )
}
