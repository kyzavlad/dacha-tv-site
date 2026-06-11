'use client'

import { useState, useTransition } from 'react'
import { adminUpdateBookingStatus } from '@/actions/submitBooking'
import type { Booking } from '@/lib/bookings/queries'

const STATUS_LABELS: Record<Booking['status'], string> = {
  new: 'Нове',
  confirmed: 'Підтверджено',
  cancelled: 'Скасовано',
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

function BookingRow({ booking, onUpdate }: { booking: Booking; onUpdate: (id: string, status: Booking['status']) => void }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [notes, setNotes] = useState(booking.admin_notes ?? '')

  function updateStatus(status: Booking['status']) {
    start(async () => {
      await adminUpdateBookingStatus(booking.id, status, notes || undefined)
      onUpdate(booking.id, status)
    })
  }

  const when = booking.booking_type === 'hourly'
    ? `${fmtDate(booking.booking_date)} ${booking.booking_hour != null ? `${String(booking.booking_hour).padStart(2, '0')}:00` : ''}`
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
            {booking.comment && <div className="col-span-2"><span className="text-gray-400">Коментар:</span> {booking.comment}</div>}
            {booking.source && <div><span className="text-gray-400">Сторінка:</span> {booking.source}</div>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Нотатки адміна</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-gray-400 resize-none"
              placeholder="Внутрішні нотатки..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {booking.status === 'new' && (
              <button onClick={() => updateStatus('confirmed')} disabled={pending}
                className="text-xs bg-green-700 text-white px-3 py-1.5 rounded-full hover:bg-green-800 disabled:opacity-40">
                Підтвердити
              </button>
            )}
            {(booking.status === 'new' || booking.status === 'confirmed') && (
              <button onClick={() => updateStatus('cancelled')} disabled={pending}
                className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-full hover:bg-red-700 disabled:opacity-40">
                Скасувати
              </button>
            )}
            {booking.status === 'confirmed' && (
              <button onClick={() => updateStatus('completed')} disabled={pending}
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

  function handleUpdate(id: string, status: Booking['status']) {
    setBookings(bs => bs.map(b => b.id === id ? { ...b, status } : b))
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
          <option value="cancelled">Скасовані</option>
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
