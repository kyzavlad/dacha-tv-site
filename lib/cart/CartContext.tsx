'use client'

import { createContext, useContext, useEffect, useReducer, useCallback, useState } from 'react'
import { trackAddToCart } from '@/lib/analytics/gtag'

export interface CartItem {
  id: string           // unique: productType + productSlug + variant (or just productSlug)
  productType: 'catalog' | 'apiary' | 'flower' | 'honey' | 'custom'
  productSlug: string
  name: string
  price: number        // snapshot price at add-to-cart time (UAH)
  quantity: number
  imageUrl?: string
  variant?: string     // e.g. "1L пластик" for honey packaging
}

interface CartState {
  items: CartItem[]
  isOpen: boolean
}

type CartAction =
  | { type: 'ADD_ITEM'; item: Omit<CartItem, 'quantity'> & { quantity?: number } }
  | { type: 'REMOVE_ITEM'; id: string }
  | { type: 'UPDATE_QTY'; id: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'SET_OPEN'; open: boolean }
  | { type: 'HYDRATE'; items: CartItem[] }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, items: action.items }
    case 'ADD_ITEM': {
      const qty = action.item.quantity ?? 1
      const existing = state.items.find((i) => i.id === action.item.id)
      if (existing) {
        return {
          ...state,
          isOpen: true,
          items: state.items.map((i) =>
            i.id === action.item.id ? { ...i, quantity: i.quantity + qty } : i
          ),
        }
      }
      return {
        ...state,
        isOpen: true,
        items: [...state.items, { ...action.item, quantity: qty }],
      }
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) }
    case 'UPDATE_QTY':
      if (action.quantity < 1) {
        return { ...state, items: state.items.filter((i) => i.id !== action.id) }
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, quantity: action.quantity } : i
        ),
      }
    case 'CLEAR':
      return { ...state, items: [] }
    case 'SET_OPEN':
      return { ...state, isOpen: action.open }
    default:
      return state
  }
}

interface CartContextValue {
  items: CartItem[]
  isOpen: boolean
  hydrated: boolean
  totalItems: number
  totalPrice: number
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void
  removeItem: (id: string) => void
  updateQty: (id: string, quantity: number) => void
  clearCart: () => void
  openCart: () => void
  closeCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = 'dacha_cart_v1'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isOpen: false })
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage on mount — set flag AFTER dispatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[]
        if (Array.isArray(parsed)) dispatch({ type: 'HYDRATE', items: parsed })
      }
    } catch {}
    setHydrated(true)
  }, [])

  // Persist to localStorage — only after hydration to avoid wiping stored cart
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items))
    } catch {}
  }, [state.items, hydrated])

  const addItem = useCallback((item: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
    dispatch({ type: 'ADD_ITEM', item })
    // GA4 add_to_cart — central so every add path (product page, cards, honey
    // form) is covered. Never throws; no-op when analytics is unconfigured.
    trackAddToCart({
      item_id: item.productSlug || item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity ?? 1,
      item_variant: item.variant,
      item_category: item.productType,
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_ITEM', id })
  }, [])

  const updateQty = useCallback((id: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QTY', id, quantity })
  }, [])

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' })
  }, [])

  const openCart = useCallback(() => dispatch({ type: 'SET_OPEN', open: true }), [])
  const closeCart = useCallback(() => dispatch({ type: 'SET_OPEN', open: false }), [])

  const totalItems = state.items.reduce((s, i) => s + i.quantity, 0)
  const totalPrice = state.items.reduce((s, i) => s + i.price * i.quantity, 0)

  return (
    <CartContext.Provider value={{ items: state.items, isOpen: state.isOpen, hydrated, totalItems, totalPrice, addItem, removeItem, updateQty, clearCart, openCart, closeCart }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
