'use client'

import { useState, useTransition } from 'react'
import { adminUpdateBookingStatus, adminUpdateBookingSchedule } from '@/actions/submitBooking'
import type { Booking } from '@/lib/bookings/queries'
import { bookingDurationHours, stripBookingMeta } from '@/lib/bookings/pricing'

// Migration-safe statuses only. Active (block the slot): new, confirmed.
// Released (free the slot): cancelled, completed.
const STATUS_LABELS: Record<Booking['status'], string> = {
  new: 'Нова заявка / блокує час',
  confirmed: 'Підтверджено / передплата отримана',
  cancelled: 'Скасовано / час вільний',
  completed: 'Завершено',
  blocked: 'Заблоковано',
}

const STATUS_COLORS: Record<Booking['status'], string> = {
  new: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-500',
  completed: 'bg-blue-100 text-blue-800',
  blocked: 'bg-red-100 text-red-700',
}

const SERVICE_LABELS: Record<string, string> = {
  'orenda-lavandovoho-polia': 'Лавандове поле',
  'orenda-budynochka-na-vodi': 'Будиночок на воді',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Duration shown in admin: duration_hours → comment meta → check_in/check_out →
// 1 hour, so it is correct even without migrations.
const durationOf = (b: Booking): number => bookingDurationHours(b)

function BookingRow({ booking, onUpdate }: { booking: Booking; onUpdate: (id: string, patch: Partial<Booking>) => void }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [notes, setNotes] = useState(booking.admin_notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  // Editable schedule (hourly only)
  const [date, setDate] = useState(booking.booking_date ?? '')
  const [hour, setHour] = useState(booking.booking_hour ?? 6)
  const [duration, setDuration] = useState(durationOf(booking))

  function run(fn: () => Promise<{ success: boolean; error?: string; total?: number; durationHours?: number }>, okText: string, patch?: Partial<Booking>) {
    setError(null); setOkMsg(null)
    start(async () => {
      const res = await fn()
      if (res.success) {
        setOkMsg(okText)
        onUpdate(booking.id, { ...patch, ...(res.total != null ? { total_price_uah: res.total } : {}), ...(res.durationHours != null ? { duration_hours: res.durationHours } : {}) })
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  const setStatus = (status: Booking['status']) =>
    run(() => adminUpdateBookingStatus(booking.id, status, notes || undefined), 'Збережено', { status })

  const saveSchedule = (alsoConfirm: boolean) =>
    run(
      () => adminUpdateBookingSchedule(booking.id, { bookingDate: date, bookingHour: Number(hour), durationHours: Number(duration) }, alsoConfirm),
      alsoConfirm ? 'Збережено та підтверджено' : 'Час збережено',
      { booking_date: date, booking_hour: Number(hour), ...(alsoConfirm ? { status: 'confirmed' as const } : {}) },
    )

  const isHourly = booking.booking_type === 'hourly'
  const dur = durationOf(booking)
  const when = isHourly
    ? `${fmtDate(booking.booking_date)} ${booking.booking_hour != null ? `${String(booking.booking_hour).padStart(2, '0')}:00` : ''}${dur > 1 ? `–${String((booking.booking_hour ?? 0) + dur).padStart(2, '0')}:00` : ''}`
    : `${fmtDate(booking.check_in)} → ${fmtDate(booking.check_out)}`

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button className="w-full flex items-start justify-between p-4 text-left gap-3" onClick={() => setOpen(o => !o)}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm text-gray-900">{booking.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[booking.status]}`}>
              {STATUS_LABELS[booking.status]}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {SERVICE_LABELS[booking.service_slug] ?? booking.service_slug} · {when} · {booking.guest_count} ос.
            {booking.extra_guests_count ? ` (+${booking.extra_guests_count})` : ''}
            {booking.bouquet_qty ? ` · 💐 ${booking.bouquet_qty}` : ''}
            {booking.total_price_uah ? ` · ${booking.total_price_uah.toLocaleString('uk-UA')} ₴` : ''}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{fmtDateTime(booking.created_at)}</div>
        </div>
        <span className="text-gray-400 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-gray-400">Телефон:</span> <a href={`tel:${booking.phone}`} className="text-blue-600 font-medium">{booking.phone}</a></div>
            <div><span className="text-gray-400">Гостей:</span> {booking.guest_count}</div>
            {booking.extra_guests_count ? (
              <div><span className="text-gray-400">Додатково людей:</span> +{booking.extra_guests_count}</div>
            ) : null}
            {isHourly ? (
              <div><span className="text-gray-400">Тривалість:</span> {dur} год</div>
            ) : null}
            {booking.bouquet_qty ? (
              <div><span className="text-gray-400">Букети лаванди:</span> {booking.bouquet_qty} шт × 100 ₴</div>
            ) : null}
            {booking.total_price_uah != null && (
              <div><span className="text-gray-400">Сума:</span> {booking.total_price_uah.toLocaleString('uk-UA')} ₴</div>
            )}
            {stripBookingMeta(booking.comment) && <div className="col-span-2"><span className="text-gray-400">Коментар:</span> {stripBookingMeta(booking.comment)}</div>}
            {booking.source && <div className="col-span-2"><span className="text-gray-400">Сторінка:</span> {booking.source}</div>}
          </div>

          {/* Schedule editor (hourly) */}
          {isHourly && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600">Дата / час / тривалість</p>
              <div className="flex flex-wrap gap-2">
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                <select value={hour} onChange={e => setHour(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                  {Array.from({ length: 24 }, (_, i) => i).map(h => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
                <select value={duration} onChange={e => setDuration(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                    <option key={h} value={h}>{h} год</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => saveSchedule(false)} disabled={pending}
                  className="text-xs bg-gray-700 text-white px-3 py-1.5 rounded-full hover:bg-gray-800 disabled:opacity-40">
                  Зберегти час
                </button>
                <button onClick={() => saveSchedule(true)} disabled={pending}
                  className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-full hover:bg-green-800 disabled:opacity-40">
                  Зберегти і підтвердити
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Нотатки адміна / повернення</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-gray-400 resize-none"
              placeholder="Внутрішні нотатки, статус повернення коштів..."
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {okMsg && <p className="text-xs text-green-600">{okMsg}</p>}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setStatus(booking.status)} disabled={pending}
              className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-full hover:bg-gray-900 disabled:opacity-40">
              Зберегти нотатки
            </button>
            {booking.status === 'new' && (
              <button onClick={() => setStatus('confirmed')} disabled={pending}
                className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-full hover:bg-green-800 disabled:opacity-40">
                Підтвердити
              </button>
            )}
            {(booking.status === 'new' || booking.status === 'confirmed') && (
              <button onClick={() => setStatus('cancelled')} disabled={pending}
                className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-full hover:bg-red-700 disabled:opacity-40">
                Скасувати (звільнити слот)
              </button>
            )}
            {booking.status === 'cancelled' && (
              <button onClick={() => setStatus('new')} disabled={pending}
                className="text-xs bg-yellow-600 text-white px-3 py-1.5 rounded-full hover:bg-yellow-700 disabled:opacity-40">
                Відновити (нове)
              </button>
            )}
            {booking.status === 'confirmed' && (
              <button onClick={() => setStatus('completed')} disabled={pending}
                className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded-full hover:bg-blue-800 disabled:opacity-40">
                Завершити
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

type FilterStatus = 'all' | Booking['status']
type FilterType = 'all' | 'hourly' | 'daily'

export function AdminBookingsClient({ initialBookings }: { initialBookings: Booking[] }) {
  const [bookings, setBookings] = useState(initialBookings)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterSlug, setFilterSlug] = useState<string>('all')

  function handleUpdate(id: string, patch: Partial<Booking>) {
    setBookings(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b))
  }

  const filtered = bookings.filter(b => {
    if (filterStatus !== 'all' && b.status !== filterStatus) return false
    if (filterType !== 'all' && b.booking_type !== filterType) return false
    if (filterSlug !== 'all' && b.service_slug !== filterSlug) return false
    return true
  })

  const counts = {
    new: bookings.filter(b => b.status === 'new').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
          <span className="font-semibold text-yellow-800">{counts.new}</span>
          <span className="text-yellow-700 ml-1">нових</span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
          <span className="font-semibold text-green-800">{counts.confirmed}</span>
          <span className="text-green-700 ml-1">підтверджених</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 text-xs">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
          <option value="all">Всі статуси</option>
          <option value="new">Нові</option>
          <option value="confirmed">Підтверджені</option>
          <option value="cancelled">Скасовані / відхилені</option>
          <option value="completed">Завершені</option>
          <option value="blocked">Заблоковані</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as FilterType)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
          <option value="all">Всі типи</option>
          <option value="hourly">Погодинно</option>
          <option value="daily">Посуточно</option>
        </select>
        <select value={filterSlug} onChange={e => setFilterSlug(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
          <option value="all">Всі послуги</option>
          <option value="orenda-lavandovoho-polia">Лавандове поле</option>
          <option value="orenda-budynochka-na-vodi">Будиночок на воді</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">Бронювань не знайдено.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(b => <BookingRow key={b.id} booking={b} onUpdate={handleUpdate} />)}
        </div>
      )}
    </div>
  )
}
