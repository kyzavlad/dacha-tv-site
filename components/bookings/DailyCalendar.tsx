'use client'

import { useState, useEffect, useTransition } from 'react'
import { submitDailyBooking } from '@/actions/submitBooking'

interface Props {
  serviceSlug: string
  serviceName: string
  pricePerNight: number
  capacity: number
  checkInTime: string
  checkOutTime: string
  source?: string
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateUA(d: Date): string {
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
}

export function DailyCalendar({
  serviceSlug, serviceName, pricePerNight, capacity, checkInTime, checkOutTime, source,
}: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [checkIn, setCheckIn] = useState<Date | null>(null)
  const [checkOut, setCheckOut] = useState<Date | null>(null)
  const [bookedDates, setBookedDates] = useState<Set<string>>(new Set())

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [guestCount, setGuestCount] = useState(1)
  const [comment, setComment] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const from = toISODate(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1))
    const to = toISODate(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 2, 0))
    fetch(`/api/bookings/availability?slug=${serviceSlug}&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => setBookedDates(new Set(d.bookedDates ?? [])))
      .catch(() => {})
  }, [viewMonth, serviceSlug])

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const firstDow = (new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay() + 6) % 7

  function handleDayClick(d: Date) {
    if (d < today) return
    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(d)
      setCheckOut(null)
    } else {
      if (d <= checkIn) { setCheckIn(d); setCheckOut(null) }
      else setCheckOut(d)
    }
  }

  const nights = checkIn && checkOut
    ? Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000)
    : 0
  const total = pricePerNight * Math.max(1, nights)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!checkIn || !checkOut) return
    setFieldErrors({})
    setServerError(null)

    const fd = new FormData()
    fd.append('serviceSlug', serviceSlug)
    fd.append('serviceName', serviceName)
    fd.append('name', name)
    fd.append('phone', phone)
    fd.append('checkIn', toISODate(checkIn))
    fd.append('checkOut', toISODate(checkOut))
    fd.append('guestCount', String(guestCount))
    fd.append('comment', comment)
    fd.append('source', source ?? '')
    fd.append('_honeypot', '')

    startTransition(async () => {
      const result = await submitDailyBooking(fd)
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
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
        <div className="text-2xl mb-2">🏠</div>
        <h3 className="font-serif text-lg font-bold text-blue-900 mb-1">Бронювання прийнято!</h3>
        <p className="text-blue-700 text-sm">
          Ми зв'яжемось з вами за номером <strong>{phone}</strong> для підтвердження.
        </p>
        <button
          onClick={() => { setSuccess(false); setCheckIn(null); setCheckOut(null); setName(''); setPhone(''); setGuestCount(1); setComment('') }}
          className="mt-4 text-xs text-blue-600 underline"
        >
          Забронювати ще
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">‹</button>
          <span className="font-semibold text-sm text-gray-800 capitalize">
            {viewMonth.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">›</button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-400 border-b border-gray-100">
          {['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map(d => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)
            const dateStr = toISODate(d)
            const isPast = d < today
            const isBooked = bookedDates.has(dateStr)
            const isCheckIn = checkIn && toISODate(d) === toISODate(checkIn)
            const isCheckOut = checkOut && toISODate(d) === toISODate(checkOut)
            const isInRange = checkIn && checkOut && d > checkIn && d < checkOut
            return (
              <button
                key={i}
                disabled={isPast || isBooked}
                onClick={() => handleDayClick(d)}
                className={[
                  'py-2 text-sm transition-colors relative',
                  isPast || isBooked ? 'text-gray-300 cursor-not-allowed' + (isBooked ? ' line-through' : '') : 'cursor-pointer hover:bg-blue-50',
                  isCheckIn || isCheckOut ? 'bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-700' : '',
                  isInRange ? 'bg-blue-100 text-blue-900' : '',
                ].join(' ')}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>

      {checkIn && (
        <p className="text-sm text-gray-700">
          {checkOut
            ? <>Заїзд <strong>{formatDateUA(checkIn)}</strong> · Виїзд <strong>{formatDateUA(checkOut)}</strong> · {nights} ніч{nights === 1 ? '' : nights < 5 ? 'і' : 'ей'}</>
            : <>Заїзд <strong>{formatDateUA(checkIn)}</strong> · Оберіть дату виїзду</>
          }
        </p>
      )}

      {!checkIn && (
        <p className="text-sm text-gray-500">Оберіть дату заїзду, потім — дату виїзду.</p>
      )}

      {checkIn && checkOut && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-2xl p-5 space-y-4">
          <div className="text-sm text-gray-600 bg-blue-50 rounded-xl px-3 py-2">
            Заїзд о <strong>{checkInTime}</strong> · Виїзд о <strong>{checkOutTime}</strong> наступного дня
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ваше ім'я *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              placeholder="Ім'я" />
            {fieldErrors.name && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.name[0]}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Телефон *</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              placeholder="+380XXXXXXXXX" />
            {fieldErrors.phone && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.phone[0]}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Кількість гостей</label>
            <select value={guestCount} onChange={e => setGuestCount(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500">
              {Array.from({ length: capacity }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n} {n === 1 ? 'особа' : n < 5 ? 'особи' : 'осіб'}</option>
              ))}
            </select>
          </div>

          <div className="text-sm text-gray-700">
            Вартість: <strong>{total.toLocaleString('uk-UA')} ₴</strong>
            <span className="text-xs text-gray-500 ml-1">({nights} ніч × {pricePerNight.toLocaleString('uk-UA')} ₴)</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Коментар (необов'язково)</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Побажання або запитання" />
          </div>

          {serverError && <p className="text-xs text-red-600">{serverError}</p>}

          <button type="submit" disabled={pending}
            className="w-full bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {pending ? 'Надсилаємо…' : 'Забронювати'}
          </button>
        </form>
      )}
    </div>
  )
}
