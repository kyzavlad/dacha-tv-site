'use client'

import { useState, useRef } from 'react'
import { formatDate } from '@/lib/utils'
import { formatPhoneTel, formatPhoneDisplay } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { StatusToggle } from './StatusToggle'
import { supplierStatusView, SUPPLIER_SEVERITY_BADGE } from '@/lib/supplier/status'
import type { Inquiry } from '@/types'

interface InquiryCardProps {
  inquiry: Inquiry
}

// ── Checkout fallback order parsing ───────────────────────────────────────────
// When the Supabase `orders` table is missing, checkout saves product orders
// into `inquiries.notes` as a JSON blob tagged with _type. We parse it here so
// the admin sees a real order card instead of a generic "Загальна заявка".
interface FallbackOrderItem {
  name: string
  slug?: string
  type?: string
  qty: number
  price: number
  variant?: string | null
  supplier_sku?: string | null
}
interface SupplierProblemLine {
  sku?: string
  name?: string
  name_ua?: string
  qty?: string
  price?: string
  sum?: string
  reason?: string
}
interface FallbackOrder {
  fallback_id?: string
  payment?: string
  warehouse_id?: string
  warehouse_name?: string | null
  items: FallbackOrderItem[]
  total_uah?: number
  supplier_mode?: string
  supplier_status?: string
  supplier_order_id?: string | null
  supplier_response?: unknown
  // Optional supplier lifecycle data (set when an admin/cron has reconciled the
  // order against get_order_details). Not written by checkout itself.
  supplier_latest_status?: string | null
  supplier_problem_lines?: SupplierProblemLine[] | null
}

function parseFallbackOrder(notes: string | null): FallbackOrder | null {
  if (!notes) return null
  const trimmed = notes.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    if (parsed?._type !== 'checkout_order_fallback') return null
    return {
      fallback_id: parsed.fallback_id as string | undefined,
      payment: parsed.payment as string | undefined,
      warehouse_id: parsed.warehouse_id as string | undefined,
      warehouse_name: (parsed.warehouse_name as string | null) ?? null,
      items: Array.isArray(parsed.items) ? (parsed.items as FallbackOrderItem[]) : [],
      total_uah: parsed.total_uah as number | undefined,
      supplier_mode: parsed.supplier_mode as string | undefined,
      supplier_status: parsed.supplier_status as string | undefined,
      supplier_order_id: (parsed.supplier_order_id as string | null) ?? null,
      supplier_response: parsed.supplier_response,
      supplier_latest_status: (parsed.supplier_latest_status as string | null) ?? null,
      supplier_problem_lines: Array.isArray(parsed.supplier_problem_lines)
        ? (parsed.supplier_problem_lines as SupplierProblemLine[])
        : null,
    }
  } catch {
    return null
  }
}

const PAYMENT_LABELS: Record<string, string> = {
  cashondelivery: 'Накладний платіж',
  prepayment: 'Передоплата',
}

function SupplierBadge({ status, mode }: { status?: string; mode?: string }) {
  const view = supplierStatusView(status, mode)
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${SUPPLIER_SEVERITY_BADGE[view.severity]}`}>
      {view.label}
    </span>
  )
}

export function InquiryCard({ inquiry }: InquiryCardProps) {
  const order = parseFallbackOrder(inquiry.notes)
  // For checkout-order rows the JSON lives in `notes`, so we must NOT let the
  // free-text notes editor overwrite it. Such rows hide the editor instead.
  const [notes, setNotes] = useState(inquiry.notes ?? '')
  const [saving, setSaving] = useState(false)
  const lastSaved = useRef(inquiry.notes ?? '')

  async function saveNotes() {
    if (notes === lastSaved.current) return
    setSaving(true)
    try {
      await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inquiry.id, notes }),
      })
      lastSaved.current = notes
    } finally {
      setSaving(false)
    }
  }

  // Extract a human-readable message from the supplier API response object.
  // The raw JSON is kept available in a collapsed <details> block.
  function extractSupplierMessage(response: unknown): string {
    if (!response) return 'Відповідь відсутня'
    if (typeof response === 'string') return response.length > 400 ? response.slice(0, 400) + '…' : response
    if (typeof response === 'object' && response !== null) {
      const r = response as Record<string, unknown>
      for (const key of ['error', 'message', 'Message', 'description', 'Description', 'result', 'Error']) {
        const val = r[key]
        if (typeof val === 'string' && val.trim()) return val.length > 400 ? val.slice(0, 400) + '…' : val
      }
      if (typeof r.result === 'object' && r.result !== null) {
        const nested = r.result as Record<string, unknown>
        for (const key of ['message', 'error', 'description']) {
          const val = nested[key]
          if (typeof val === 'string' && val.trim()) return val
        }
      }
    }
    return 'Дивіться технічні деталі нижче'
  }

  const supplierErrorRaw =
    order &&
    (order.supplier_status === 'failed' || order.supplier_status === 'sent_unconfirmed') &&
    order.supplier_response
      ? (typeof order.supplier_response === 'string'
          ? order.supplier_response
          : JSON.stringify(order.supplier_response, null, 2))
      : null
  const supplierError = supplierErrorRaw

  // An order that was accepted by the supplier API can still later become
  // "Не выполнен" / cancelled in Personal.cab. The admin must verify the final
  // state in the supplier journal — acceptance at submit time is NOT fulfilment.
  const supplierAccepted =
    order && (order.supplier_status === 'sent' || order.supplier_status === 'test_sent')
  const supplierNeedsCheck =
    order &&
    (order.supplier_status === 'sent_unconfirmed' ||
      order.supplier_status === 'failed' ||
      order.supplier_status === 'sent' ||
      order.supplier_status === 'test_sent')

  return (
    <article className="bg-white rounded-2xl border border-honey-100 shadow-sm p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={inquiry.status} />
            {order && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-honey-100 text-honey-800 border border-honey-200">
                🛒 Замовлення з магазину
              </span>
            )}
          </div>
          <h3 className="font-semibold text-bark text-lg mt-1">{inquiry.name}</h3>
        </div>
        <time
          dateTime={inquiry.created_at}
          className="text-xs text-bark/50 whitespace-nowrap flex-shrink-0"
        >
          {formatDate(inquiry.created_at)}
        </time>
      </div>

      {/* Phone — large and tappable */}
      <div>
        <a
          href={`tel:${formatPhoneTel(inquiry.phone)}`}
          className="inline-flex items-center gap-2 text-honey-700 font-bold text-xl hover:text-honey-900 transition-colors min-h-[44px]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {formatPhoneDisplay(inquiry.phone)}
        </a>
      </div>

      {order ? (
        /* ── Checkout order panel ──────────────────────────────────────────── */
        <div className="space-y-3">
          {/* Supplier forwarding status */}
          <div className="flex flex-wrap items-center gap-2">
            <SupplierBadge status={order.supplier_status} mode={order.supplier_mode} />
            {order.supplier_mode && order.supplier_mode !== 'skipped' && (
              <span className="text-xs text-bark/50">режим: {order.supplier_mode}</span>
            )}
            {order.supplier_order_id && (
              <span className="text-xs text-bark/50">#{order.supplier_order_id}</span>
            )}
          </div>
          {supplierAccepted && (
            <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
              {order.supplier_status === 'test_sent'
                ? 'Тестове замовлення прийнято постачальником.'
                : 'Замовлення прийнято постачальником.'}
              {order.supplier_order_id ? ` № ${order.supplier_order_id}.` : ''}
            </p>
          )}
          {supplierError && (
            <div className="space-y-1">
              <div className="text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <p className="font-medium text-red-700 mb-0.5">
                  {order.supplier_status === 'failed' ? '❌ Помилка постачальника' : '⚠ Відправлено без підтвердження'}
                </p>
                <p className="text-red-600">{extractSupplierMessage(order.supplier_response)}</p>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer select-none text-bark/30 hover:text-bark/50 px-1 py-0.5 list-none">
                  ▸ Технічні деталі (raw)
                </summary>
                <pre className="mt-1 p-2 bg-gray-50 rounded-lg text-bark/50 overflow-x-auto text-[10px] whitespace-pre-wrap break-all leading-relaxed">{supplierError}</pre>
              </details>
            </div>
          )}
          {supplierNeedsCheck && (
            <p className="text-xs text-bark/60 bg-honey-50 rounded-lg px-3 py-2">
              ⚠ Прийняте замовлення ще не означає виконане. Перевірте статус у Personal.cab
              {order.supplier_order_id ? ` за номером № ${order.supplier_order_id}` : ''} — якщо статус
              «Не виконано»/«Скасовано», зв&apos;яжіться з постачальником і клієнтом.
            </p>
          )}
          {order.supplier_latest_status && (
            <p className="text-xs text-bark/70 bg-gray-50 rounded-lg px-3 py-2">
              Останній статус Personal.cab:{' '}
              <span className="font-semibold text-bark">{order.supplier_latest_status}</span>
            </p>
          )}
          {order.supplier_problem_lines && order.supplier_problem_lines.length > 0 && (
            <div className="text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
              <p className="font-semibold text-red-700">
                Постачальник видалив позиції — потрібна ручна обробка:
              </p>
              {order.supplier_problem_lines.map((line, idx) => (
                <p key={idx} className="text-red-700">
                  • {line.sku ? `${line.sku} — ` : ''}{line.name_ua || line.name || 'товар'}
                  {line.qty ? ` × ${line.qty}` : ''}
                </p>
              ))}
              <p className="text-red-600/80">
                Перевірте замовлення у Personal.cab
                {order.supplier_order_id ? ` (№ ${order.supplier_order_id})` : ''} та зв&apos;яжіться з клієнтом.
              </p>
            </div>
          )}

          {/* Items */}
          {order.items.length > 0 && (
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-50">
              {order.items.map((it, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-bark leading-snug">
                      {it.name}{it.variant ? ` (${it.variant})` : ''}
                    </p>
                    {it.supplier_sku && (
                      <p className="text-xs text-bark/40">SKU: {it.supplier_sku}</p>
                    )}
                  </div>
                  <span className="text-bark/70 whitespace-nowrap flex-shrink-0">
                    {it.qty} × {it.price.toLocaleString('uk-UA')} ₴
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Order meta */}
          <div className="space-y-1.5 text-sm text-bark/80">
            {typeof order.total_uah === 'number' && (
              <div>
                <span className="font-medium text-bark/50">Сума:</span>{' '}
                <span className="font-semibold text-bark">{order.total_uah.toLocaleString('uk-UA')} ₴</span>
              </div>
            )}
            {order.payment && (
              <div>
                <span className="font-medium text-bark/50">Оплата:</span>{' '}
                {PAYMENT_LABELS[order.payment] ?? order.payment}
              </div>
            )}
            {(order.warehouse_name || order.warehouse_id) && (
              <div>
                <span className="font-medium text-bark/50">Нова Пошта:</span>{' '}
                {order.warehouse_name ?? order.warehouse_id}
                {order.warehouse_name && order.warehouse_id ? (
                  <span className="text-bark/40"> (ID: {order.warehouse_id})</span>
                ) : null}
              </div>
            )}
            {inquiry.source && (
              <div>
                <span className="font-medium text-bark/50">Джерело:</span> {inquiry.source}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Standard inquiry details ──────────────────────────────────────── */
        <div className="space-y-1.5 text-sm text-bark/80">
          {inquiry.product && (
            <div>
              <span className="font-medium text-bark/50">Продукт:</span>{' '}
              {inquiry.product}
            </div>
          )}
          {inquiry.source && (
            <div>
              <span className="font-medium text-bark/50">Джерело:</span>{' '}
              {inquiry.source}
            </div>
          )}
          {inquiry.message && (
            <div className="mt-2 p-3 bg-honey-50 rounded-lg">
              <span className="font-medium text-bark/50">Повідомлення:</span>
              <p className="mt-1 text-bark/80 whitespace-pre-line">{inquiry.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Internal notes — hidden for checkout orders (notes holds the order JSON) */}
      {!order && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-bark/50 flex items-center justify-between">
            <span>Нотатки</span>
            {saving && <span className="text-honey-600">збереження…</span>}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={3}
            placeholder="Результат дзвінка, домовленості, деталі…"
            className="w-full text-sm rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-bark placeholder:text-bark/30 focus:outline-none focus:ring-2 focus:ring-honey-300 focus:border-honey-300 resize-none"
          />
        </div>
      )}

      {/* Status toggle */}
      <StatusToggle inquiryId={inquiry.id} currentStatus={inquiry.status as 'new' | 'contacted' | 'completed' | 'cancelled'} />
    </article>
  )
}
