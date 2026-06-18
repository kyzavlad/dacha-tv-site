'use client'

export const dynamic = 'force-dynamic'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useCart } from '@/lib/cart/CartContext'
import { submitProductOrder } from '@/actions/submitProductOrder'

const ukrainianPhone = /^(\+380|0)\d{9}$/

interface Warehouse {
  internal_id: string
  name: string
  city_name: string
  address: string
}

function WarehousePicker({
  warehouseId,
  warehouseName,
  onChange,
  error,
}: {
  warehouseId: string
  warehouseName: string
  onChange: (id: string, name: string) => void
  error?: string
}) {
  const [city, setCity] = useState('')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const searchCity = useCallback(async (term: string, signal?: AbortSignal) => {
    if (!term.trim() || term.trim().length < 2) return
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(
        `/api/supplier/warehouses?city=${encodeURIComponent(term.trim())}`,
        { signal }
      )
      if (signal?.aborted) return
      const data = await res.json() as { ok: boolean; warehouses?: Warehouse[]; error?: string }
      if (!data.ok) {
        setFetchError(data.error ?? 'Помилка пошуку')
      } else {
        const list = data.warehouses ?? []
        setWarehouses(list)
        if (list.length === 0) setFetchError('Місто не знайдено. Перевірте назву та спробуйте ще раз.')
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setFetchError('Помилка з\'єднання')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  // Debounced auto-search: triggers 500ms after the user stops typing
  useEffect(() => {
    const trimmed = city.trim()
    if (trimmed.length < 2) {
      setWarehouses([])
      setFetchError(null)
      return
    }
    // Cancel any in-flight request from the previous keystroke
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const timer = setTimeout(() => searchCity(trimmed, ac.signal), 500)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [city, searchCity])

  function handleCityChange(val: string) {
    setCity(val)
    // Clear the chosen warehouse when city changes
    if (warehouseId) onChange('', '')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={city}
          onChange={(e) => handleCityChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              abortRef.current?.abort()
              const ac = new AbortController()
              abortRef.current = ac
              searchCity(city, ac.signal)
            }
          }}
          placeholder="Місто (наприклад: Київ)"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-bark placeholder:text-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent"
          aria-label="Пошук міста"
        />
        <button
          type="button"
          onClick={() => {
            abortRef.current?.abort()
            const ac = new AbortController()
            abortRef.current = ac
            searchCity(city, ac.signal)
          }}
          disabled={loading || city.trim().length < 2}
          className="px-4 py-3 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-bark font-medium rounded-xl transition-colors text-sm whitespace-nowrap"
          aria-label="Знайти відділення"
        >
          {loading ? '…' : 'Знайти'}
        </button>
      </div>

      {city.trim().length > 0 && city.trim().length < 2 && (
        <p className="text-bark/40 text-xs">Введіть щонайменше 2 символи для пошуку</p>
      )}

      {fetchError && <p className="text-red-500 text-xs">{fetchError}</p>}

      {warehouses.length > 0 && (
        <select
          value={warehouseId}
          onChange={(e) => {
            const w = warehouses.find((w) => w.internal_id === e.target.value)
            onChange(e.target.value, w ? `${w.city_name}, ${w.name}` : e.target.value)
          }}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-bark focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent bg-white"
          aria-label="Оберіть відділення"
        >
          <option value="">— Оберіть відділення —</option>
          {warehouses.map((w) => (
            <option key={w.internal_id} value={w.internal_id}>
              {w.name}{w.address ? `: ${w.address}` : ''}
            </option>
          ))}
        </select>
      )}

      {warehouseId && warehouseName && (
        <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
          ✓ {warehouseName}
        </p>
      )}

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  )
}

export default function CheckoutPage() {
  const { items, totalPrice, clearCart, hydrated } = useCart()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [methodPayment, setMethodPayment] = useState<'cashondelivery' | 'prepayment'>('cashondelivery')
  const [warehouseId, setWarehouseId] = useState('')
  const [warehouseName, setWarehouseName] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null)

  // Supplier (catalog) items can only be paid on delivery until live prepayment is enabled.
  const hasSupplierItems = items.some((item) => item.productType === 'catalog')

  // If the cart gains a supplier item while prepayment is selected, reset to COD.
  useEffect(() => {
    if (hasSupplierItems && methodPayment === 'prepayment') {
      setMethodPayment('cashondelivery')
    }
  }, [hasSupplierItems, methodPayment])

  if (successOrderId) {
    return (
      <div className="bg-cream min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-serif text-2xl font-bold text-bark mb-3">Дякуємо за замовлення!</h1>
          <p className="text-bark/70 mb-2">
            Ваше замовлення{' '}
            <span className="font-semibold text-bark">#{successOrderId.slice(0, 8).toUpperCase()}</span>{' '}
            прийнято.
          </p>
          <p className="text-bark/60 text-sm mb-8">
            Ми зателефонуємо вам найближчим часом для підтвердження.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-honey-600 hover:bg-honey-700 text-white font-semibold rounded-xl transition-colors"
          >
            На головну
          </Link>
        </div>
      </div>
    )
  }

  if (!hydrated) return <div className="bg-cream min-h-screen" />

  if (items.length === 0) {
    return (
      <div className="bg-cream min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-bark/60 mb-4 text-lg">Кошик порожній</p>
          <Link href="/" className="text-honey-700 hover:text-honey-800 font-semibold underline">
            Повернутися до покупок
          </Link>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    if (!ukrainianPhone.test(phone)) {
      setFieldErrors({ phone: ['Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)'] })
      return
    }

    if (!warehouseId) {
      setFieldErrors({ warehouseId: ['Оберіть відділення Нової Пошти'] })
      return
    }

    setSubmitting(true)
    const fd = new FormData()
    fd.set('firstName', firstName.trim())
    fd.set('lastName', lastName.trim())
    fd.set('phone', phone.trim())
    fd.set('methodPayment', methodPayment)
    fd.set('warehouseId', warehouseId)
    if (warehouseName) fd.set('warehouseName', warehouseName)
    if (comment.trim()) fd.set('comment', comment.trim())
    fd.set('source', '/checkout')

    const result = await submitProductOrder(items, fd)
    setSubmitting(false)

    if (!result.success) {
      setError(result.error)
      if ('fieldErrors' in result && result.fieldErrors) setFieldErrors(result.fieldErrors)
      return
    }

    clearCart()
    setSuccessOrderId(result.orderId)
  }

  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav className="text-sm text-bark/50">
          <Link href="/" className="hover:text-bark transition-colors">Головна</Link>
          <span className="mx-2">›</span>
          <span className="text-bark">Оформлення замовлення</span>
        </nav>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h1 className="font-serif text-3xl font-bold text-bark mb-8">Оформлення замовлення</h1>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          {/* Form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl p-6 border border-honey-100 shadow-sm">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name: split */}
                <h2 className="font-serif text-xl font-bold text-bark">Отримувач</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-bark/70 mb-1.5">
                      Прізвище <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      required
                      minLength={2}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Іваненко"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-bark placeholder:text-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent"
                    />
                    {fieldErrors.lastName?.map((e) => <p key={e} className="text-red-500 text-xs mt-1">{e}</p>)}
                  </div>
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-bark/70 mb-1.5">
                      Ім&apos;я <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      required
                      minLength={2}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Іван"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-bark placeholder:text-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent"
                    />
                    {fieldErrors.firstName?.map((e) => <p key={e} className="text-red-500 text-xs mt-1">{e}</p>)}
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-bark/70 mb-1.5">
                    Номер телефону <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+380XXXXXXXXX або 0XXXXXXXXX"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-bark placeholder:text-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent"
                  />
                  {fieldErrors.phone?.map((e) => <p key={e} className="text-red-500 text-xs mt-1">{e}</p>)}
                </div>

                {/* Payment method */}
                <div>
                  <p className="block text-sm font-medium text-bark/70 mb-2">
                    Спосіб оплати <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: 'cashondelivery', label: 'Накладний платіж', desc: 'Оплата при отриманні' },
                      { value: 'prepayment', label: 'Передоплата', desc: 'Оплата до відправки' },
                    ] as const).map((opt) => {
                      const lockedOut = opt.value === 'prepayment' && hasSupplierItems
                      return (
                        <label
                          key={opt.value}
                          className={`flex flex-col gap-0.5 p-3 border-2 rounded-xl transition-colors ${
                            lockedOut
                              ? 'border-gray-200 opacity-60 cursor-not-allowed'
                              : methodPayment === opt.value
                              ? 'border-honey-500 bg-honey-50 cursor-pointer'
                              : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                          }`}
                        >
                          <input
                            type="radio"
                            name="methodPayment"
                            value={opt.value}
                            checked={methodPayment === opt.value}
                            disabled={lockedOut}
                            onChange={() => !lockedOut && setMethodPayment(opt.value)}
                            className="sr-only"
                          />
                          <span className="text-sm font-semibold text-bark">{opt.label}</span>
                          <span className="text-xs text-bark/50">{opt.desc}</span>
                          {lockedOut && (
                            <span className="text-xs text-amber-700 mt-0.5 leading-snug">
                              Буде доступна після підтвердження менеджером
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Nova Poshta warehouse */}
                <div>
                  <label className="block text-sm font-medium text-bark/70 mb-1.5">
                    Відділення Нової Пошти <span className="text-red-500">*</span>
                  </label>
                  <WarehousePicker
                    warehouseId={warehouseId}
                    warehouseName={warehouseName}
                    onChange={(id, name) => { setWarehouseId(id); setWarehouseName(name) }}
                    error={fieldErrors.warehouseId?.[0]}
                  />
                </div>

                {/* Comment */}
                <div>
                  <label htmlFor="comment" className="block text-sm font-medium text-bark/70 mb-1.5">
                    Коментар <span className="text-bark/40 font-normal">(необов&apos;язково)</span>
                  </label>
                  <textarea
                    id="comment"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Будь-які побажання або уточнення"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-bark placeholder:text-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent resize-none"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-honey-600 hover:bg-honey-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-base"
                >
                  {submitting ? 'Оформлюємо…' : 'Оформити замовлення'}
                </button>

                <p className="text-xs text-bark/40 text-center">
                  Після підтвердження ми зателефонуємо та узгодимо деталі доставки
                </p>
              </form>
            </div>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl p-6 border border-honey-100 shadow-sm sticky top-24">
              <h2 className="font-serif text-xl font-bold text-bark mb-4">Ваше замовлення</h2>

              <div className="space-y-3 mb-4">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-bark leading-snug">{item.name}</p>
                      {item.variant && <p className="text-xs text-bark/50">{item.variant}</p>}
                      <p className="text-xs text-bark/50 mt-0.5">× {item.quantity}</p>
                    </div>
                    <span className="text-sm font-semibold text-bark flex-shrink-0">
                      {(item.price * item.quantity).toLocaleString('uk-UA')} ₴
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-honey-100 pt-3 flex items-center justify-between">
                <span className="font-bold text-bark">Разом</span>
                <span className="text-xl font-bold text-bark">
                  {totalPrice.toLocaleString('uk-UA')} ₴
                </span>
              </div>

              <p className="text-xs text-bark/40 mt-3">
                Доставка: Нова Пошта. Оплата при отриманні або передоплата.
              </p>
            </div>

            <div className="mt-4 space-y-2.5 text-xs text-bark/60">
              {[
                'Доставка по Україні: Нова Пошта',
                'Оплата при отриманні або передоплата',
                'Підтвердимо дзвінком після отримання заявки',
              ].map((text) => (
                <div key={text} className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
