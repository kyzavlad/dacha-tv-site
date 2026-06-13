export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import type { Order, OrderStatus } from '@/types'

export const metadata: Metadata = { title: 'Адмін: Замовлення', robots: 'noindex, nofollow' }

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Нова',
  confirmed: 'Підтверджена',
  packed: 'Упакована',
  shipped: 'Відправлена',
  completed: 'Виконана',
  cancelled: 'Скасована',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  packed: 'bg-indigo-100 text-indigo-800',
  shipped: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function getAllOrders(): Promise<Order[]> {
  const client = getAdminClient()
  const { data, error } = await client
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Order[]
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const { status } = await searchParams
  const activeFilter = status ?? 'all'

  const allOrders = await getAllOrders().catch(() => [] as Order[])
  const orders = activeFilter === 'all' ? allOrders : allOrders.filter((o) => o.status === activeFilter)

  const counts = {
    new: allOrders.filter((o) => o.status === 'new').length,
    confirmed: allOrders.filter((o) => o.status === 'confirmed').length,
    all: allOrders.length,
  }

  const filterOptions: Array<{ value: string; label: string }> = [
    { value: 'all', label: 'Всі' },
    { value: 'new', label: 'Нові' },
    { value: 'confirmed', label: 'Підтверджені' },
    { value: 'packed', label: 'Упаковані' },
    { value: 'shipped', label: 'Відправлені' },
    { value: 'completed', label: 'Виконані' },
    { value: 'cancelled', label: 'Скасовані' },
  ]

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900 font-serif">Замовлення</h1>
        <div className="flex gap-2 text-sm">
          {counts.new > 0 && (
            <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full font-semibold">
              {counts.new} нових
            </span>
          )}
          {counts.confirmed > 0 && (
            <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full font-semibold">
              {counts.confirmed} підтверджених
            </span>
          )}
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {filterOptions.map((opt) => (
          <Link
            key={opt.value}
            href={opt.value === 'all' ? '/admin/orders' : `/admin/orders?status=${opt.value}`}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              activeFilter === opt.value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-gray-400 py-6">Замовлень не знайдено.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  ID
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Клієнт
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                  Телефон
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                  Сума
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Статус
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                  Дата
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {order.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{order.customer_name}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                    <a href={`tel:${order.phone}`} className="hover:text-blue-600 transition-colors">
                      {order.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 hidden md:table-cell">
                    {order.total_uah.toLocaleString('uk-UA')} ₴
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status]}`}
                    >
                      {STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">
                    {fmtDateTime(order.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Деталі →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
