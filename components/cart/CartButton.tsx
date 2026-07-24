'use client'

import { useCart } from '@/lib/cart/CartContext'
import { useLocale } from '@/lib/i18n/locale-context'
import { tr } from '@/lib/i18n/pages'

export function CartButton() {
  const { totalItems, openCart } = useCart()
  const locale = useLocale()

  const cartLabel = tr({ uk: 'Кошик', ru: 'Корзина' }, locale)
  const itemsNoun =
    totalItems === 1
      ? tr({ uk: 'товар', ru: 'товар' }, locale)
      : tr({ uk: 'товарів', ru: 'товаров' }, locale)

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={`${cartLabel}${totalItems > 0 ? ` — ${totalItems} ${itemsNoun}` : ''}`}
      className="relative flex items-center justify-center w-10 h-10 rounded-full text-bark/70 hover:text-bark hover:bg-honey-50 transition-colors"
    >
      {/* Cart icon */}
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6h11" />
      </svg>
      {totalItems > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-honey-600 text-white text-[10px] font-bold leading-none rounded-full w-4.5 h-4.5 flex items-center justify-center min-w-[18px] min-h-[18px] px-1">
          {totalItems > 99 ? '99+' : totalItems}
        </span>
      )}
    </button>
  )
}
