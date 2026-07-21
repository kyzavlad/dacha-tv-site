'use client'

import { useRouter } from 'next/navigation'
import { useCart, type CartItem } from '@/lib/cart/CartContext'

interface BuyNowButtonProps {
  item: Omit<CartItem, 'quantity'>
  quantity?: number
  className?: string
  outOfStock?: boolean
}

export function BuyNowButton({ item, quantity = 1, className, outOfStock }: BuyNowButtonProps) {
  const { clearCart, addItem, closeCart } = useCart()
  const router = useRouter()

  function handleClick() {
    if (outOfStock) return
    clearCart()
    addItem({ ...item, quantity })
    closeCart()
    router.push('/checkout')
  }

  if (outOfStock) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-2 w-full py-3 px-6 text-base font-semibold rounded-xl border border-bark/20 text-bark hover:bg-bark hover:text-cream transition-colors ${className ?? ''}`}
    >
      Купити зараз
    </button>
  )
}
