'use client'

import { useState } from 'react'
import { useCart, type CartItem } from '@/lib/cart/CartContext'

interface AddToCartButtonProps {
  item: Omit<CartItem, 'quantity'>
  quantity?: number
  label?: string
  className?: string
  compact?: boolean
}

export function AddToCartButton({ item, quantity = 1, label = 'До кошика', className, compact }: AddToCartButtonProps) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  function handleClick() {
    addItem({ ...item, quantity })
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
  }

  const base = compact
    ? 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors'
    : 'inline-flex items-center justify-center gap-2 w-full py-3 px-6 text-base font-semibold rounded-xl transition-colors'

  const colors = added
    ? 'bg-green-600 text-white'
    : 'bg-honey-600 hover:bg-honey-700 text-white'

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
          Додано
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6h11" />
          </svg>
          {label}
        </>
      )}
    </button>
  )
}
