import Link from 'next/link'
import { formatDate, formatPhoneTel, formatPhoneDisplay } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'

// Compact list card for a real row from the `orders` table (the primary
// checkout path). Read-only — full details and status management live on the
// order detail page at /admin/orders/[id], which this card links to.
interface AdminOrderCardProps {
  order: Order & { itemCount?: number }
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Нова',
  confirmed: 'Підтверджена',
  packed: 'Упакована',
  shipped: 'Відправлена',
  completed: 'Виконана',
  cancelled: 'Скасована',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  new: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  packed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  shipped: 'bg-purple-100 text-purple-800 border-purple-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

const PAYMENT_LABELS: Record<string, string> = {
  cashondelivery: 'Накладний платіж',
  prepayment: 'Передоплата',
}

// Supplier forwarding status → human label + colour. Mirrors InquiryCard so the
// real-order and fallback-order views read the same.
const SUPPLIER_BADGES: Record<string, { label: string; className: string }> = {
  test_sent: { label: 'Тестово відправлено постачальнику', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  sent: { label: 'Відправлено постачальнику', className: 'bg-green-50 text-green-700 border-green-200' },
  sent_unconfirmed: { label: 'Відправлено без підтвердження', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  failed: { label: 'Помилка постачальника', className: 'bg-red-50 text-red-700 border-red-200' },
}

export function AdminOrderCard({ order }: AdminOrderCardProps) {
  const supplierBadge =
    order.supplier_order_status && order.supplier_order_status !== 'skipped'
      ? SUPPLIER_BADGES[order.supplier_order_status]
      : null
  const warehouse = order.nova_poshta_warehouse_name ?? order.delivery_notes

  return (
    <article className="bg-white rounded-2xl border border-honey-100 shadow-sm p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[order.status]}`}
            >
              {STATUS_LABELS[order.status]}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-honey-100 text-honey-800 border border-honey-200">
              🛒 Замовлення з магазину
            </span>
          </div>
          <h3 className="font-semibold text-bark text-lg mt-1">{order.customer_name}</h3>
        </div>
        <time
          dateTime={order.created_at}
          className="text-xs text-bark/50 whitespace-nowrap flex-shrink-0"
        >
          {formatDate(order.created_at)}
        </time>
      </div>

      {/* Phone — large and tappable */}
      <div>
        <a
          href={`tel:${formatPhoneTel(order.phone)}`}
          className="inline-flex items-center gap-2 text-honey-700 font-bold text-xl hover:text-honey-900 transition-colors min-h-[44px]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {formatPhoneDisplay(order.phone)}
        </a>
      </div>

      {/* Supplier forwarding status */}
      {supplierBadge && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${supplierBadge.className}`}>
            {supplierBadge.label}
          </span>
          {order.supplier_order_mode && order.supplier_order_mode !== 'skipped' && (
            <span className="text-xs text-bark/50">режим: {order.supplier_order_mode}</span>
          )}
          {order.supplier_order_id && (
            <span className="text-xs text-bark/50">#{order.supplier_order_id}</span>
          )}
        </div>
      )}

      {/* Order meta */}
      <div className="space-y-1.5 text-sm text-bark/80">
        <div>
          <span className="font-medium text-bark/50">Сума:</span>{' '}
          <span className="font-semibold text-bark">{order.total_uah.toLocaleString('uk-UA')} ₴</span>
          {typeof order.itemCount === 'number' && order.itemCount > 0 && (
            <span className="text-bark/40"> · {order.itemCount} поз.</span>
          )}
        </div>
        {order.method_payment && (
          <div>
            <span className="font-medium text-bark/50">Оплата:</span>{' '}
            {PAYMENT_LABELS[order.method_payment] ?? order.method_payment}
          </div>
        )}
        {warehouse && (
          <div>
            <span className="font-medium text-bark/50">Нова Пошта:</span> {warehouse}
          </div>
        )}
        {order.source && (
          <div>
            <span className="font-medium text-bark/50">Джерело:</span> {order.source}
          </div>
        )}
      </div>

      {/* Manage link → existing detail + status page */}
      <Link
        href={`/admin/orders/${order.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-honey-700 hover:text-honey-900 transition-colors min-h-[44px]"
      >
        Деталі та статус →
      </Link>
    </article>
  )
}
