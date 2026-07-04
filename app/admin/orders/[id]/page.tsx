export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import { OrderStatusForm } from '../OrderStatusForm'
import { SupplierTestButton } from '../SupplierTestButton'
import { supplierStatusView, SUPPLIER_SEVERITY_BADGE } from '@/lib/supplier/status'
import type { Order, OrderItem, OrderStatus } from '@/types'

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

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  catalog: 'Каталог',
  apiary: 'Пасіка',
  flower: 'Квіти',
  honey: 'Мед',
  custom: 'Інше',
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function getOrder(id: string): Promise<Order & { items: OrderItem[] }> {
  try {
    const client = getAdminClient()
    const { data: order, error } = await client
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !order) notFound()

    const { data: items } = await client
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      .order('id')

    return { ...(order as Order), items: (items ?? []) as OrderItem[] }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('credentials') || msg.includes('not configured')) notFound()
    throw e
  }
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminOrderDetailPage({ params }: PageProps) {
  const { id } = await params
  const order = await getOrder(id)
  const shortId = order.id.slice(0, 8).toUpperCase()
  const hasCatalogItems = order.items.some((i) => i.product_type === 'catalog')
  const supplier = supplierStatusView(order.supplier_order_status, order.supplier_order_mode)
  // A confirmed/accepted LIVE send already exists for this order. The manual
  // test button re-sends in TEST mode (never live) but overwrites the stored
  // supplier result, so we warn before it replaces a real send record.
  const sentLive =
    order.supplier_order_mode === 'live' &&
    (order.supplier_order_status === 'sent' || order.supplier_order_status === 'sent_unconfirmed')

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Back link */}
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
      >
        ← До списку замовлень
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-serif">
            Замовлення #{shortId}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{fmtDateTime(order.created_at)}</p>
        </div>
        <span
          className={`text-sm px-3 py-1 rounded-full font-semibold ${STATUS_COLORS[order.status]}`}
        >
          {STATUS_LABELS[order.status]}
        </span>
      </div>

      <div className="space-y-5">
        {/* Customer info */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
            Клієнт
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-400 text-xs mb-0.5">Ім&apos;я</dt>
              <dd className="font-medium text-gray-900">{order.customer_name}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-xs mb-0.5">Телефон</dt>
              <dd>
                <a
                  href={`tel:${order.phone}`}
                  className="font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {order.phone}
                </a>
              </dd>
            </div>
            {order.delivery_notes && (
              <div className="sm:col-span-2">
                <dt className="text-gray-400 text-xs mb-0.5">Доставка</dt>
                <dd className="text-gray-900">{order.delivery_notes}</dd>
              </div>
            )}
            {order.comment && (
              <div className="sm:col-span-2">
                <dt className="text-gray-400 text-xs mb-0.5">Коментар</dt>
                <dd className="text-gray-900">{order.comment}</dd>
              </div>
            )}
            {order.source && (
              <div>
                <dt className="text-gray-400 text-xs mb-0.5">Сторінка</dt>
                <dd className="text-gray-600 text-xs font-mono">{order.source}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Items */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
              Товари
            </h2>
          </div>
          {order.items.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-4">Товари не знайдено.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Товар
                  </th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                    Тип
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Ціна
                  </th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    К-сть
                  </th>
                  <th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Сума
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{item.product_name}</p>
                      {item.variant && (
                        <p className="text-xs text-gray-500">{item.variant}</p>
                      )}
                      <p className="text-xs text-gray-400 font-mono">{item.product_slug}</p>
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {PRODUCT_TYPE_LABELS[item.product_type] ?? item.product_type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">
                      {item.unit_price_uah.toLocaleString('uk-UA')} ₴
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">{item.quantity}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">
                      {item.subtotal_uah.toLocaleString('uk-UA')} ₴
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200">
                <tr>
                  <td colSpan={4} className="px-5 py-3 text-right font-bold text-gray-800">
                    Разом:
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900 text-base">
                    {order.total_uah.toLocaleString('uk-UA')} ₴
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {/* Supplier order — shown for any order that contains catalog items or
            already has supplier data. Pure manual orders (honey/flowers only)
            never touch the supplier, so the section is hidden for them. */}
        {(hasCatalogItems || (order.supplier_order_mode && order.supplier_order_mode !== 'skipped')) && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
              Постачальник
            </h2>
            {order.supplier_order_mode && order.supplier_order_mode !== 'skipped' ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
                <div>
                  <dt className="text-gray-400 text-xs mb-0.5">Режим</dt>
                  <dd>
                    {order.supplier_order_mode === 'test' ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-semibold">
                        🧪 Тестовий
                      </span>
                    ) : order.supplier_order_mode === 'live' ? (
                      <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-0.5 rounded-full text-xs font-semibold">
                        ✅ Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full text-xs font-semibold">
                        ⛔ {order.supplier_order_mode}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-gray-400 text-xs mb-0.5">Статус</dt>
                  <dd>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${SUPPLIER_SEVERITY_BADGE[supplier.severity]}`}>
                      {supplier.label}
                    </span>
                  </dd>
                  {supplier.hint && (
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{supplier.hint}</p>
                  )}
                </div>
                {order.supplier_order_id && (
                  <div>
                    <dt className="text-gray-400 text-xs mb-0.5">ID замовлення</dt>
                    <dd className="font-mono text-gray-900">{order.supplier_order_id}</dd>
                  </div>
                )}
                {order.method_payment && (
                  <div>
                    <dt className="text-gray-400 text-xs mb-0.5">Оплата</dt>
                    <dd className="text-gray-900">
                      {order.method_payment === 'cashondelivery' ? 'Накладний платіж' : 'Передоплата'}
                    </dd>
                  </div>
                )}
                {order.nova_poshta_warehouse_name && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-400 text-xs mb-0.5">Нова Пошта</dt>
                    <dd className="text-gray-900">{order.nova_poshta_warehouse_name}</dd>
                  </div>
                )}
                {order.nova_poshta_warehouse_id && (
                  <div>
                    <dt className="text-gray-400 text-xs mb-0.5">ID відділення</dt>
                    <dd className="font-mono text-xs text-gray-500">{order.nova_poshta_warehouse_id}</dd>
                  </div>
                )}
                {order.supplier_order_response && (
                  <div className="sm:col-span-2">
                    <dt className="text-gray-400 text-xs mb-0.5">Відповідь API</dt>
                    <dd>
                      <pre className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-3 overflow-auto max-h-40 text-gray-700 font-mono">
                        {JSON.stringify(order.supplier_order_response, null, 2)}
                      </pre>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-400 mb-4">Ще не надсилалося постачальнику.</p>
            )}

            <div className="pt-3 border-t border-gray-100">
              <SupplierTestButton orderId={order.id} sentLive={sentLive} />
            </div>
          </section>
        )}

        {/* Status management */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">
            Управління статусом
          </h2>
          <OrderStatusForm
            orderId={order.id}
            currentStatus={order.status}
            currentAdminNotes={order.admin_notes}
          />
        </section>
      </div>
    </div>
  )
}
