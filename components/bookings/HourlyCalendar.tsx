'use client'

import { useState, useEffect, useTransition } from 'react'
import { submitHourlyBooking } from '@/actions/submitBooking'
import { computeBookingPrice, type HourlyPricingConfig } from '@/lib/bookings/pricing'

interface Props {
  serviceSlug: string
  serviceName: string
  pricePerHour: number
  capacity: number
  extraGuestPrice: number
  slotStartHour: number
  slotEndHour: number
  source?: string
  // Optional limits/extras (used by the lavender field rental). Omitted →
  // current generic behaviour for other hourly services.
  maxDateISO?: string          // latest selectable date, e.g. '2026-07-20'
  enableBouquets?: boolean     // show the lavender bouquet upsell
  bouquetPrice?: number        // price per bouquet (default 100)
  requireRules?: boolean       // require a rules-confirmation checkbox
  rulesLabel?: string
  // Optional two-tier hourly pricing: slots starting at/after eveningStartHour
  // cost eveningPriceUah instead of pricePerHour (used by the lavender field).
  eveningStartHour?: number
  eveningPriceUah?: number
  // Extra guests above the included capacity (0 → no extra-guest UI).
  maxExtraGuests?: number
  // Multi-hour duration (1 → single hour, no duration selector).
  maxDurationHours?: number
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateUA(d: Date): string {
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function HourlyCalendar({
  serviceSlug, serviceName, pricePerHour, capacity, extraGuestPrice,
  slotStartHour, slotEndHour, source,
  maxDateISO, enableBouquets = false, bouquetPrice = 100,
  requireRules = false, rulesLabel, eveningStartHour, eveningPriceUah,
  maxExtraGuests = 0, maxDurationHours = 1,
}: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const maxDate = maxDateISO ? new Date(`${maxDateISO}T23:59:59`) : null

  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [duration, setDuration] = useState(1)
  const [bookedHours, setBookedHours] = useState<number[]>([])
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [comment, setComment] = useState('')
  const [extraWanted, setExtraWanted] = useState(false)
  const [extraGuests, setExtraGuests] = useState(1)
  const [bouquetWanted, setBouquetWanted] = useState(false)
  const [bouquetQty, setBouquetQty] = useState(1)
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!selectedDate) return
    setLoading(true)
    setSelectedHour(null)
    const dateStr = toISODate(selectedDate)
    fetch(`/api/bookings/availability?slug=${serviceSlug}&date=${dateStr}`)
      .then(r => r.json())
      .then(d => setBookedHours(d.bookedHours ?? []))
      .catch(() => setBookedHours([]))
      .finally(() => setLoading(false))
  }, [selectedDate, serviceSlug])

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const firstDow = (new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay() + 6) % 7

  function prevMonth() {
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
    setSelectedDate(null)
  }
  function nextMonth() {
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
    setSelectedDate(null)
  }

  const slots: number[] = []
  for (let h = slotStartHour; h < slotEndHour; h++) slots.push(h)

  // Longest run of free, in-hours slots starting at `start` (caps duration).
  function maxDurationFrom(start: number): number {
    let run = 0
    for (let h = start; h < slotEndHour && !bookedHours.includes(h) && run < maxDurationHours; h++) run++
    return Math.max(1, run)
  }
  const maxDur = selectedHour != null ? maxDurationFrom(selectedHour) : 1

  // Keep duration within the valid range whenever the start hour changes.
  useEffect(() => {
    setDuration(d => Math.min(Math.max(1, d), maxDur))
  }, [selectedHour, maxDur])

  const cfg: HourlyPricingConfig = {
    flatPricePerHour: pricePerHour,
    dayPriceUah: pricePerHour,
    eveningStartHour,
    eveningPriceUah,
  }
  const price = computeBookingPrice({
    startHour: selectedHour ?? slotStartHour,
    durationHours: duration,
    extraGuests: maxExtraGuests > 0 && extraWanted ? Math.max(1, extraGuests) : 0,
    extraGuestPrice,
    bouquetQty: enableBouquets && bouquetWanted ? Math.max(1, bouquetQty) : 0,
    bouquetPrice,
    cfg,
  })

  // Disable the "next month" arrow once we'd move past the max bookable date.
  const canGoNext = !maxDate || new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1) <= maxDate

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDate || selectedHour === null) return
    setFieldErrors({})
    setServerError(null)

    if (requireRules && !rulesAccepted) {
      setFieldErrors({ rulesAccepted: ['Підтвердіть, що ознайомлені з правилами'] })
      return
    }

    const fd = new FormData()
    fd.append('serviceSlug', serviceSlug)
    fd.append('serviceName', serviceName)
    fd.append('name', name)
    fd.append('phone', phone)
    fd.append('bookingDate', toISODate(selectedDate))
    fd.append('bookingHour', String(selectedHour))
    fd.append('durationHours', String(duration))
    fd.append('extraGuestsCount', String(price.extraGuests))
    fd.append('bouquetQty', String(price.bouquetQty))
    fd.append('rulesAccepted', requireRules ? (rulesAccepted ? 'true' : 'false') : 'true')
    fd.append('comment', comment)
    fd.append('source', source ?? '')
    fd.append('_honeypot', '')

    startTransition(async () => {
      const result = await submitHourlyBooking(fd)
      if (result.success) {
        setSuccess(true)
      } else {
        if ('fieldErrors' in result) setFieldErrors(result.fieldErrors ?? {})
        setServerError(result.error)
      }
    })
  }

  if (success) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6 text-center">
        <div className="text-2xl mb-2">💜</div>
        <h3 className="font-serif text-lg font-bold text-purple-900 mb-1">Бронювання прийнято!</h3>
        <p className="text-purple-700 text-sm">
          Ми зв'яжемось з вами за номером <strong>{phone}</strong> для підтвердження.
        </p>
        <button
          onClick={() => { setSuccess(false); setSelectedDate(null); setSelectedHour(null); setDuration(1); setName(''); setPhone(''); setComment(''); setExtraWanted(false); setExtraGuests(1); setBouquetWanted(false); setBouquetQty(1); setRulesAccepted(false) }}
          className="mt-4 text-xs text-purple-600 underline"
        >
          Забронювати ще
        </button>
      </div>
    )
  }

  const endHour = (selectedHour ?? slotStartHour) + duration

  return (
    <div className="space-y-6">
      {/* Calendar */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
          <span className="font-semibold text-sm text-gray-800 capitalize">
            {viewMonth.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMonth} disabled={!canGoNext} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-400 border-b border-gray-100">
          {['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(d => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)
            const isPast = d < today
            const isAfterMax = maxDate ? d > maxDate : false
            const disabled = isPast || isAfterMax
            const isSelected = selectedDate && toISODate(d) === toISODate(selectedDate)
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => setSelectedDate(d)}
                className={[
                  'py-2 text-sm transition-colors',
                  disabled ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-purple-50 cursor-pointer',
                  isSelected ? 'bg-purple-700 text-white rounded-lg font-semibold hover:bg-purple-700' : '',
                ].join(' ')}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hour slots */}
      {selectedDate && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Початок · {formatDateUA(selectedDate)}
          </p>
          {loading ? (
            <p className="text-xs text-gray-400">Завантаження…</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {slots.map(h => {
                const booked = bookedHours.includes(h)
                const isSelected = selectedHour === h
                return (
                  <button
                    key={h}
                    disabled={booked}
                    onClick={() => setSelectedHour(h)}
                    className={[
                      'py-2 rounded-xl text-xs font-semibold border transition-colors',
                      booked ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through' : '',
                      !booked && isSelected ? 'bg-purple-700 text-white border-purple-700' : '',
                      !booked && !isSelected ? 'bg-white text-gray-700 border-gray-200 hover:border-purple-400 hover:text-purple-700' : '',
                    ].join(' ')}
                  >
                    {String(h).padStart(2, '0')}:00
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Booking form */}
      {selectedDate && selectedHour !== null && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-2xl p-5 space-y-4">
          <div className="text-sm font-semibold text-gray-800">
            {formatDateUA(selectedDate)} · {String(selectedHour).padStart(2, '0')}:00–{String(endHour).padStart(2, '0')}:00
          </div>

          {/* Duration */}
          {maxDurationHours > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Тривалість</label>
              <select
                value={duration} onChange={e => setDuration(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
              >
                {Array.from({ length: maxDur }, (_, i) => i + 1).map(h => (
                  <option key={h} value={h}>{h} {h === 1 ? 'година' : h < 5 ? 'години' : 'годин'}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ваше ім'я *</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
              placeholder="Ім'я"
            />
            {fieldErrors.name && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.name[0]}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Телефон *</label>
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
              placeholder="+380XXXXXXXXX"
            />
            {fieldErrors.phone && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.phone[0]}</p>}
          </div>

          {/* Included guests + optional extra guests */}
          {maxExtraGuests > 0 && (
            <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
              <p className="text-sm text-gray-700 mb-2">
                Включено <strong>{capacity}</strong> {capacity === 1 ? 'особа' : capacity < 5 ? 'особи' : 'осіб'}.
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox" checked={extraWanted}
                  onChange={e => setExtraWanted(e.target.checked)}
                  className="w-4 h-4 accent-purple-700"
                />
                Будуть додаткові гості (понад {capacity})? +{extraGuestPrice} ₴/особа
              </label>
              {extraWanted && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-600">Додатково людей:</span>
                  <input
                    type="number" min={1} max={maxExtraGuests} step={1} value={extraGuests}
                    onChange={e => setExtraGuests(Math.min(maxExtraGuests, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                  />
                  <span className="text-xs text-gray-500">= +{price.extraTotal.toLocaleString('uk-UA')} ₴</span>
                </div>
              )}
            </div>
          )}

          {/* Bouquet upsell */}
          {enableBouquets && (
            <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox" checked={bouquetWanted}
                  onChange={e => setBouquetWanted(e.target.checked)}
                  className="w-4 h-4 accent-purple-700"
                />
                Хочете придбати букети лаванди? {bouquetPrice} грн/шт
              </label>
              {bouquetWanted && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-600">Кількість:</span>
                  <input
                    type="number" min={1} max={99} step={1} value={bouquetQty}
                    onChange={e => setBouquetQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                  />
                  <span className="text-xs text-gray-500">= +{price.bouquetTotal.toLocaleString('uk-UA')} ₴</span>
                </div>
              )}
            </div>
          )}

          {/* Price breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700 space-y-1">
            <div className="flex justify-between">
              <span>Оренда{duration > 1 ? ` · ${duration} год` : ''}</span>
              <span>{price.base.toLocaleString('uk-UA')} ₴</span>
            </div>
            {price.extraTotal > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Додатково гостей: +{price.extraGuests}</span>
                <span>+{price.extraTotal.toLocaleString('uk-UA')} ₴</span>
              </div>
            )}
            {price.bouquetTotal > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Букети лаванди: {price.bouquetQty} шт</span>
                <span>+{price.bouquetTotal.toLocaleString('uk-UA')} ₴</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-1 mt-1">
              <span>Разом</span>
              <span>{price.total.toLocaleString('uk-UA')} ₴</span>
            </div>
          </div>

          {/* Rules confirmation */}
          {requireRules && (
            <div>
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox" checked={rulesAccepted}
                  onChange={e => setRulesAccepted(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-purple-700 flex-shrink-0"
                />
                <span>{rulesLabel ?? 'З правилами відвідування лавандового поля ознайомлений(а)'}</span>
              </label>
              {fieldErrors.rulesAccepted && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.rulesAccepted[0]}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Коментар (необов'язково)</label>
            <textarea
              value={comment} onChange={e => setComment(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 resize-none"
              placeholder="Побажання або запитання"
            />
          </div>

          {serverError && <p className="text-xs text-red-600">{serverError}</p>}

          <button
            type="submit" disabled={pending || (requireRules && !rulesAccepted)}
            className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold text-sm hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? 'Надсилаємо…' : 'Забронювати'}
          </button>
        </form>
      )}
    </div>
  )
}
