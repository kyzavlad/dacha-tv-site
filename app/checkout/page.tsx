'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCart } from '@/lib/cart/CartContext'
import type { CartItem } from '@/lib/cart/CartContext'
import { submitProductOrder } from '@/actions/submitProductOrder'
import { isValidUkrainianPhone } from '@/lib/utils'
import { trackBeginCheckout, trackPurchase, type AnalyticsItem } from '@/lib/analytics/gtag'
import { splitLocale, DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { shopUiDict } from '@/lib/i18n/sections/shop-ui'

// Map cart items → GA4 ecommerce items (SKU = productSlug when available).
function toAnalyticsItems(items: CartItem[]): AnalyticsItem[] {
  return items.map((i) => ({
    item_id: i.productSlug || i.id,
    item_name: i.name,
    price: i.price,
    quantity: i.quantity,
    item_variant: i.variant,
    item_category: i.productType,
  }))
}

// Shape returned by /api/supplier/warehouses (server-filtered, ≤30 rows)
interface WarehouseResult {
  internal_id: string
  city: string
  name: string
  address: string
  label: string
}

// Lightweight combobox for Nova Poshta settlement/warehouse selection.
// Searches are server-side filtered (≤30 results), so we never render
// thousands of options. Debounced 300ms + AbortController for stale requests.
function WarehousePicker({
  warehouseId,
  onChange,
  error,
  locale = DEFAULT_LOCALE,
}: {
  warehouseId: string
  onChange: (id: string, label: string) => void
  error?: string
  locale?: Locale
}) {
  const t = useMemo(() => shopUiDict(locale), [locale])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WarehouseResult[]>([])
  const [loading, setLoading] = useState(false)
  const [slowLoad, setSlowLoad] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search is triggered directly from the input's onChange handler
  // (a user-initiated event, not an effect keyed on `query`), so a
  // programmatic query change (select() below) never needs to distinguish
  // itself from a real search.
  function search(raw: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current)

    const trimmed = raw.trim()
    if (trimmed.length < 2) {
      abortRef.current?.abort()
      setResults([])
      setFetchError(null)
      setLoading(false)
      setSlowLoad(false)
      setOpen(false)
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setSlowLoad(false)

    // Slow-load hint: if the first fetch takes over 1.2s (cold cache), tell the user.
    slowTimerRef.current = setTimeout(() => setSlowLoad(true), 1200)

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/supplier/warehouses?q=${encodeURIComponent(trimmed)}`,
          { signal: ac.signal }
        )
        if (ac.signal.aborted) return
        const data = (await res.json()) as { ok: boolean; warehouses?: WarehouseResult[]; error?: string }
        if (!data.ok) {
          setFetchError(data.error ?? t.warehouseErrSearch)
          setResults([])
        } else {
          const list = data.warehouses ?? []
          setResults(list)
          setOpen(list.length > 0)
          setFetchError(list.length === 0 ? t.warehouseNotFound : null)
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        setFetchError(t.warehouseErrConnection)
        setResults([])
      } finally {
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
        setSlowLoad(false)
        if (!ac.signal.aborted) setLoading(false)
      }
    }, 300)
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
    }
  }, [])

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function handleInput(val: string) {
    setQuery(val)
    // Any manual edit invalidates the previously selected warehouse.
    if (warehouseId) onChange('', '')
    search(val)
  }

  function select(w: WarehouseResult) {
    onChange(w.internal_id, w.label)
    setQuery(w.label)
    setResults([])
    setOpen(false)
    setFetchError(null)
    setLoading(false)
    setSlowLoad(false)
  }

  const trimLen = query.trim().length

  return (
    <div className="space-y-2" ref={boxRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder={t.warehousePlaceholder}
          autoComplete="off"
          aria-label={t.warehouseAriaLabel}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-bark placeholder:text-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent"
        />

        {open && results.length > 0 && (
          <ul
            role="listbox"
            aria-label={t.warehouseResultsAria}
            className="absolute z-10 mt-1 w-full max-h-72 overflow-auto bg-white border border-gray-200 rounded-xl shadow-lg"
          >
            {results.map((w) => (
              <li key={w.internal_id} role="option" aria-selected={warehouseId === w.internal_id}>
                <button
                  type="button"
                  onClick={() => select(w)}
                  className="w-full text-left px-4 py-2.5 text-sm text-bark hover:bg-honey-50 transition-colors border-b border-gray-50 last:border-b-0"
                >
                  {w.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Short-query hint */}
      {trimLen > 0 && trimLen < 2 && !warehouseId && (
        <p className="text-bark/40 text-xs">{t.warehouseShortHint}</p>
      )}

      {/* Loading state — visible text + spinner */}
      {loading && !warehouseId && (
        <div className="space-y-0.5">
          <p className="text-bark/60 text-xs flex items-center gap-1.5">
            <svg
              className="animate-spin w-3 h-3 text-honey-500 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t.warehouseSearching}
          </p>
          {slowLoad && (
            <p className="text-bark/40 text-xs pl-[18px]">{t.warehouseSlowHint}</p>
          )}
        </div>
      )}

      {/* Error — hidden once a warehouse is selected to avoid visual noise */}
      {fetchError && !warehouseId && (
        <p className="text-red-500 text-xs">{fetchError}</p>
      )}

      {/* Green selected state */}
      {warehouseId && (
        <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
          ✓ {t.warehouseSelected} {query}
        </p>
      )}

      {/* Form-level validation error (e.g. "submit without selecting") */}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  )
}

export default function CheckoutPage() {
  const pathname = usePathname()
  const locale = splitLocale(pathname ?? '/').locale
  const t = shopUiDict(locale)
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

  // Supplier (catalog) items stay locked to cashondelivery until live prepayment
  // is enabled — preserving PR #16 payment lock.
  const hasSupplierItems = items.some((item) => item.productType === 'catalog')

  // Force the payment method back to cashondelivery whenever a supplier item
  // is present and prepayment is (still) selected — e.g. a supplier item was
  // added to the cart after prepayment was chosen. Adjusted directly during
  // render rather than via an effect — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const lockKey = `${hasSupplierItems}:${methodPayment}`
  const [prevLockKey, setPrevLockKey] = useState(lockKey)
  if (lockKey !== prevLockKey) {
    setPrevLockKey(lockKey)
    if (hasSupplierItems && methodPayment === 'prepayment') {
      setMethodPayment('cashondelivery')
    }
  }

  // GA4 begin_checkout — fire once when the cart is hydrated and non-empty.
  const beginCheckoutFired = useRef(false)
  useEffect(() => {
    if (beginCheckoutFired.current) return
    if (!hydrated || items.length === 0) return
    beginCheckoutFired.current = true
    trackBeginCheckout(toAnalyticsItems(items), totalPrice)
  }, [hydrated, items, totalPrice])

  if (successOrderId) {
    return (
      <div className="bg-cream min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-serif text-2xl font-bold text-bark mb-3">{t.successTitle}</h1>
          <p className="text-bark/70 mb-8">
            {t.successBody}
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-honey-600 hover:bg-honey-700 text-white font-semibold rounded-xl transition-colors"
          >
            {t.successHome}
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
          <p className="text-bark/60 mb-4 text-lg">{t.emptyCartText}</p>
          <Link href="/" className="text-honey-700 hover:text-honey-800 font-semibold underline">
            {t.backToShopping}
          </Link>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    if (!isValidUkrainianPhone(phone)) {
      setFieldErrors({ phone: [t.phoneError] })
      return
    }

    if (!warehouseId) {
      setFieldErrors({ warehouseId: [t.warehouseError] })
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

    // Snapshot the cart BEFORE clearing so the purchase event has line items.
    const purchasedItems = toAnalyticsItems(items)
    const purchasedValue = totalPrice

    const result = await submitProductOrder(items, fd)
    setSubmitting(false)

    if (!result.success) {
      setError(result.error)
      if ('fieldErrors' in result && result.fieldErrors) setFieldErrors(result.fieldErrors)
      return
    }

    // Purchase fires ONLY here — after the internal order was created. Test /
    // internal orders send a marked debug event instead of the real conversion.
    trackPurchase({
      orderId: result.orderId,
      value: purchasedValue,
      items: purchasedItems,
      isTest: result.isTestOrder === true,
    })

    clearCart()
    setSuccessOrderId(result.orderId)
  }

  // Live phone validation: show inline hint as the user types (before submit),
  // without relying on the browser's native tooltip (which may be in Russian).
  const phoneDirtyInvalid = phone.length > 0 && !isValidUkrainianPhone(phone)
  const cyrillicNameRe = /^[Ѐ-ӿ\s\-'ʼ]+$/
  const firstNameCyrillicInvalid = firstName.trim().length > 0 && !cyrillicNameRe.test(firstName.trim())
  const lastNameCyrillicInvalid = lastName.trim().length > 0 && !cyrillicNameRe.test(lastName.trim())

  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav className="text-sm text-bark/50">
          <Link href="/" className="hover:text-bark transition-colors">{t.crumbHome}</Link>
          <span className="mx-2">›</span>
          <span className="text-bark">{t.crumbCheckout}</span>
        </nav>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <h1 className="font-serif text-3xl font-bold text-bark mb-8">{t.checkoutTitle}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          {/* Form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl p-6 border border-honey-100 shadow-sm">
              <form onSubmit={handleSubmit} className="space-y-5">
                <h2 className="font-serif text-xl font-bold text-bark">{t.recipientTitle}</h2>

                {/* Last + first name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-bark/70 mb-1.5">
                      {t.lastNameLabel} <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      required
                      minLength={2}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t.lastNamePlaceholder}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-bark placeholder:text-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent"
                    />
                    {fieldErrors.lastName?.map((e) => <p key={e} className="text-red-500 text-xs mt-1">{e}</p>)}
                    {lastNameCyrillicInvalid && !fieldErrors.lastName?.length && (
                      <p className="text-amber-600 text-xs mt-1">{t.cyrillicHint}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-bark/70 mb-1.5">
                      {t.firstNameLabel} <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      required
                      minLength={2}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t.firstNamePlaceholder}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-bark placeholder:text-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent"
                    />
                    {fieldErrors.firstName?.map((e) => <p key={e} className="text-red-500 text-xs mt-1">{e}</p>)}
                    {firstNameCyrillicInvalid && !fieldErrors.firstName?.length && (
                      <p className="text-amber-600 text-xs mt-1">{t.cyrillicHint}</p>
                    )}
                  </div>
                </div>

                {/* Phone — live inline validation, no reliance on browser tooltip */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-bark/70 mb-1.5">
                    {t.phoneLabel} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t.phonePlaceholder}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-bark placeholder:text-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-400 focus:border-transparent"
                  />
                  {/* Live hint while typing — hidden once corrected or after server error */}
                  {phoneDirtyInvalid && !fieldErrors.phone?.length && (
                    <p className="text-red-500 text-xs mt-1">
                      {t.phoneHint}
                    </p>
                  )}
                  {fieldErrors.phone?.map((e) => <p key={e} className="text-red-500 text-xs mt-1">{e}</p>)}
                </div>

                {/* Payment method */}
                <div>
                  <p className="block text-sm font-medium text-bark/70 mb-2">
                    {t.paymentTitle} <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: 'cashondelivery', label: t.payCodLabel, desc: t.payCodDesc },
                      { value: 'prepayment',     label: t.payPrepayLabel, desc: t.payPrepayDesc },
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
                              {t.payLockedHint}
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
                    {t.warehouseLabel} <span className="text-red-500">*</span>
                  </label>
                  <WarehousePicker
                    warehouseId={warehouseId}
                    onChange={(id, label) => { setWarehouseId(id); setWarehouseName(label) }}
                    error={fieldErrors.warehouseId?.[0]}
                    locale={locale}
                  />
                </div>

                {/* Comment */}
                <div>
                  <label htmlFor="comment" className="block text-sm font-medium text-bark/70 mb-1.5">
                    {t.commentLabel} <span className="text-bark/40 font-normal">{t.commentOptional}</span>
                  </label>
                  <textarea
                    id="comment"
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t.commentPlaceholder}
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
                  {submitting ? t.submitting : t.submit}
                </button>

                <p className="text-xs text-bark/40 text-center">
                  {t.afterSubmitNote}
                </p>
              </form>
            </div>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl p-6 border border-honey-100 shadow-sm sticky top-24">
              <h2 className="font-serif text-xl font-bold text-bark mb-4">{t.orderSummaryTitle}</h2>

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
                <span className="font-bold text-bark">{t.total}</span>
                <span className="text-xl font-bold text-bark">
                  {totalPrice.toLocaleString('uk-UA')} ₴
                </span>
              </div>

              <p className="text-xs text-bark/40 mt-3">
                {t.summaryNote}
              </p>
            </div>

            <div className="mt-4 space-y-2.5 text-xs text-bark/60">
              {[
                t.infoDelivery,
                t.infoPayment,
                t.infoCall,
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
