'use client'

import { useState, useTransition } from 'react'
import { adminUpdateOrderStatus } from './actions'
import type { OrderStatus } from '@/types'

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Нова',
  confirmed: 'Підтверджена',
  packed: 'Упакована',
  shipped: 'Відправлена',
  completed: 'Виконана',
  cancelled: 'Скасована',
}

const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const BUTTON_COLORS: Record<OrderStatus, string> = {
  new: 'bg-yellow-600 hover:bg-yellow-700',
  confirmed: 'bg-blue-700 hover:bg-blue-800',
  packed: 'bg-indigo-700 hover:bg-indigo-800',
  shipped: 'bg-purple-700 hover:bg-purple-800',
  completed: 'bg-green-700 hover:bg-green-800',
  cancelled: 'bg-red-600 hover:bg-red-700',
}

interface Props {
  orderId: string
  currentStatus: OrderStatus
  currentAdminNotes: string | null
}

export function OrderStatusForm({ orderId, currentStatus, currentAdminNotes }: Props) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus)
  const [notes, setNotes] = useState(currentAdminNotes ?? '')
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const nextStatuses = NEXT_STATUSES[status]

  function updateStatus(newStatus: OrderStatus) {
    setMessage(null)
    start(async () => {
      const result = await adminUpdateOrderStatus(orderId, newStatus, notes || undefined)
      if (result.success) {
        setStatus(newStatus)
        setMessage(`Статус оновлено: ${STATUS_LABELS[newStatus]}`)
      } else {
        setMessage(`Помилка: ${result.error ?? 'невідома'}`)
      }
    })
  }

  async function saveNotes() {
    setMessage(null)
    start(async () => {
      const result = await adminUpdateOrderStatus(orderId, status, notes)
      if (result.success) {
        setMessage('Нотатки збережено')
      } else {
        setMessage(`Помилка: ${result.error ?? 'невідома'}`)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Нотатки адміна</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-gray-400 resize-none"
          placeholder="Внутрішні нотатки… напр., № замовлення в кабінеті постачальника, результат звірки"
        />
        <p className="mt-1 text-[11px] text-gray-400 leading-relaxed">
          Порада: якщо статус «звірити в кабінеті», запишіть тут № замовлення постачальника після перевірки.
        </p>
        <button
          onClick={saveNotes}
          disabled={pending}
          className="mt-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-full disabled:opacity-40 transition-colors"
        >
          Зберегти нотатки
        </button>
      </div>

      {nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((s) => (
            <button
              key={s}
              onClick={() => updateStatus(s)}
              disabled={pending}
              className={`text-sm text-white px-4 py-2 rounded-full disabled:opacity-40 transition-colors ${BUTTON_COLORS[s]}`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {message && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          {message}
        </p>
      )}
    </div>
  )
}
