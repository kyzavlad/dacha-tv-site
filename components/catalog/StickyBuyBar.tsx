'use client'

import { useEffect, useRef, useState } from 'react'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { useLocale } from '@/lib/i18n/locale-context'
import { tr } from '@/lib/i18n/pages'
import type { CartItem } from '@/lib/cart/CartContext'

// ─── Mobile sticky purchase bar (product detail) ─────────────────────────────
// On a phone the price + "До кошика" pair scrolls out of view as soon as the
// shopper reads the description, specs or related products — the exact moment
// they decide to buy. This pins a compact price + add-to-cart bar to the bottom
// of the viewport once the primary CTA has scrolled away, and hides it again
// when the real CTA is back on screen (so the two are never shown at once).
//
// Deliberately narrow:
//   • mobile only (lg:hidden) — the desktop layout keeps the CTA beside the image
//   • no new dependency: one IntersectionObserver, cleaned up on unmount
//   • reuses AddToCartButton, so cart state, analytics (add_to_cart) and the
//     out-of-stock rule are exactly the same as the main CTA
//   • renders nothing at all when the product is not buyable or is out of stock
export function StickyBuyBar({
  item,
  priceLabel,
  anchorId,
  outOfStock,
}: {
  item: Omit<CartItem, 'quantity'>
  priceLabel: string | null
  anchorId: string
  outOfStock?: boolean
}) {
  const locale = useLocale()
  const [visible, setVisible] = useState(false)
  const observed = useRef<Element | null>(null)

  useEffect(() => {
    const anchor = document.getElementById(anchorId)
    if (!anchor || typeof IntersectionObserver === 'undefined') return
    observed.current = anchor
    const io = new IntersectionObserver(
      ([entry]) => {
        // Show the bar only once the primary CTA is above the viewport — never
        // while it is visible, and not before the shopper has scrolled past it.
        setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0)
      },
      { threshold: 0 },
    )
    io.observe(anchor)
    return () => io.disconnect()
  }, [anchorId])

  if (outOfStock) return null

  return (
    <div
      aria-hidden={!visible}
      className={`lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-honey-100 bg-white/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] transition-transform duration-200 ${
        visible ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          {priceLabel ? (
            <div className="text-lg font-bold text-bark leading-tight truncate">{priceLabel}</div>
          ) : (
            <div className="text-sm font-semibold text-honey-700 leading-tight truncate">
              {tr({ uk: 'Ціна за запитом', ru: 'Цена по запросу' }, locale)}
            </div>
          )}
          <div className="text-[11px] text-bark/60 leading-tight">
            {tr({ uk: 'Доставка по Україні', ru: 'Доставка по Украине' }, locale)}
          </div>
        </div>
        <div className="ml-auto w-[52%] max-w-[220px]">
          <AddToCartButton item={item} className="!py-2.5 !text-sm" />
        </div>
      </div>
    </div>
  )
}
