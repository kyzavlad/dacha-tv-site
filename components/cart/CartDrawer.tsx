'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useCart } from '@/lib/cart/CartContext'

export function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQty, totalPrice } = useCart()

  // Lock scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCart() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, closeCart])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed right-0 top-0 h-full w-full max-w-sm bg-honey-50 z-50 flex flex-col shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Кошик"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-honey-200 flex-shrink-0">
          <h2 className="font-serif text-lg font-bold text-bark">Кошик</h2>
          <button
            type="button"
            onClick={closeCart}
            className="w-10 h-10 flex items-center justify-center text-bark/50 hover:text-bark hover:bg-honey-100 rounded-xl transition-colors"
            aria-label="Закрити кошик"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <svg className="w-12 h-12 text-bark/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6h11" />
              </svg>
              <p className="text-bark/50 font-medium">Кошик порожній</p>
              <p className="text-bark/40 text-sm mt-1">Додайте товари, щоб продовжити</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="bg-white rounded-xl p-4 border border-honey-200">
                <div className="flex items-start gap-3">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-honey-100"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-honey-100 flex items-center justify-center flex-shrink-0 text-2xl">
                      {item.productType === 'honey' || item.productType === 'apiary' ? '🍯'
                        : item.productType === 'flower' ? '🌸'
                        : item.productType === 'catalog' ? '📦'
                        : '🛒'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-bark text-sm leading-snug">{item.name}</p>
                    {item.variant && (
                      <p className="text-xs text-bark/50 mt-0.5">{item.variant}</p>
                    )}
                    <p className="text-honey-700 font-bold text-sm mt-1">{item.price.toLocaleString('uk-UA')} ₴</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-bark/30 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                    aria-label={`Видалити ${item.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Quantity controls */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQty(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-full bg-honey-100 hover:bg-honey-200 text-bark font-bold text-sm flex items-center justify-center transition-colors"
                      aria-label="Зменшити кількість"
                    >−</button>
                    <span className="w-6 text-center text-sm font-semibold text-bark">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded-full bg-honey-100 hover:bg-honey-200 text-bark font-bold text-sm flex items-center justify-center transition-colors"
                      aria-label="Збільшити кількість"
                    >+</button>
                  </div>
                  <span className="text-sm font-bold text-bark">{(item.price * item.quantity).toLocaleString('uk-UA')} ₴</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="flex-shrink-0 border-t border-honey-200 px-5 py-5 bg-white space-y-3">
            <div className="flex items-center justify-between text-base font-bold text-bark">
              <span>Разом</span>
              <span>{totalPrice.toLocaleString('uk-UA')} ₴</span>
            </div>
            <Link
              href="/checkout"
              onClick={closeCart}
              className="flex items-center justify-center w-full py-3.5 bg-honey-600 hover:bg-honey-700 text-white font-semibold rounded-xl transition-colors text-base"
            >
              Оформити замовлення →
            </Link>
            <button
              type="button"
              onClick={closeCart}
              className="w-full py-2.5 text-bark/60 hover:text-bark text-sm font-medium transition-colors"
            >
              Продовжити покупки
            </button>
          </div>
        )}
      </div>
    </>
  )
}
