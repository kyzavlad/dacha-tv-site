export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { getAdminClient } from '@/lib/supabase/admin'
import { InquiryCard } from '@/components/admin/InquiryCard'
import { AdminOrderCard } from '@/components/admin/AdminOrderCard'
import type { Inquiry, InquiryStatus, Order } from '@/types'

export const metadata: Metadata = {
  title: 'Адмін: Замовлення та заявки',
  robots: 'noindex, nofollow',
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Всі' },
  { value: 'new', label: 'Нові' },
  { value: 'contacted', label: 'Зателефоновано' },
  { value: 'completed', label: 'Виконано' },
  { value: 'cancelled', label: 'Скасовано' },
]

// Lavender/service bookings are managed in /admin/bookings, so we do NOT expose
// "Бронювання" as a main type tab here. Legacy booking-classified inquiry rows
// (if any old ones exist) are hidden from the default view but remain reachable
// via the direct ?type=booking URL, where they are clearly labelled as legacy.
// Only two real tabs. There is no "Всі типи": the page defaults to orders (see
// safeType below), and legacy bookings remain reachable via the direct
// ?type=booking URL without being a chip here.
const TYPE_FILTERS = [
  { value: 'order', label: '🛒 Замовлення' },
  { value: 'inquiry', label: '📋 Заявки' },
]

const VALID_STATUSES = ['new', 'contacted', 'completed', 'cancelled']
// booking stays valid (legacy direct-URL view) but is not a chip.
const VALID_TYPES = ['booking', 'order', 'inquiry']

interface AdminPageProps {
  searchParams: Promise<{ status?: string; type?: string }>
}

function normalizeInquiry(row: Record<string, unknown>): Inquiry {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    product: (row.product as string) ?? null,
    message: (row.message as string) ?? null,
    source: (row.source as string) ?? null,
    status: String(row.status ?? 'new'),
    notes: (row.notes as string) ?? null,
    created_at: String(row.created_at ?? ''),
  }
}

function classifyInquiry(inq: Inquiry): 'booking' | 'order' | 'inquiry' {
  const notes = inq.notes ?? ''
  const source = (inq.source ?? '').toLowerCase()
  if (notes.trim().startsWith('{"_type":"checkout_order_fallback"')) return 'order'
  if (source.includes('lavender') || source.includes('booking') || source.includes('service')) return 'booking'
  if (inq.product?.toLowerCase().includes('лаванд') || inq.product?.toLowerCase().includes('оренда')) return 'booking'
  return 'inquiry'
}

function buildAdminUrl(status: string, type: string): string {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  if (type !== 'all') params.set('type', type)
  const qs = params.toString()
  return `/admin/orders${qs ? `?${qs}` : ''}`
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { status = 'all', type } = await searchParams
  const safeStatus = VALID_STATUSES.includes(status) ? status : 'all'
  // No "Всі типи": a missing/invalid type defaults to "order" so /admin/orders
  // behaves like /admin/orders?type=order and shows real orders first.
  const safeType = type && VALID_TYPES.includes(type) ? type : 'order'

  let inquiries: Inquiry[] = []
  let error: string | null = null
  let errorDetail: string | null = null
  let missingEnv = false

  try {
    const supabase = getAdminClient()
    let query = supabase
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false })

    if (safeStatus !== 'all') {
      query = query.eq('status', safeStatus as InquiryStatus)
    }

    const { data, error: dbError } = await query

    if (dbError) {
      error = 'Не вдалося завантажити заявки'
      errorDetail = dbError.message
    } else {
      inquiries = (data ?? []).map(normalizeInquiry)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Missing Supabase') || msg.includes('credentials') || msg.includes('not configured')) {
      missingEnv = true
      error = 'Supabase не налаштовано'
      errorDetail = 'Встановіть NEXT_PUBLIC_SUPABASE_URL та SUPABASE_SERVICE_ROLE_KEY у Vercel.'
    } else {
      error = 'Помилка зʼєднання з базою даних'
      errorDetail = msg
    }
  }

  // Real product orders live in the `orders` table — the primary checkout path.
  // Load them so the "Замовлення" tab shows them. The inquiries-based fallback
  // (used only when the orders table is ever missing) is rendered separately
  // below, so the two data sources never get conflated. Read-only; status
  // management stays on the /admin/orders/[id] detail page.
  let orders: (Order & { itemCount: number })[] = []
  let ordersError: string | null = null
  if (!missingEnv) {
    try {
      const supabase = getAdminClient()
      const { data: orderRows, error: ordersDbError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (ordersDbError) {
        // A missing `orders` table (PGRST205) is NOT fatal — the fallback orders
        // saved in `inquiries` still render. Any other error is surfaced.
        if (ordersDbError.code !== 'PGRST205') ordersError = ordersDbError.message
      } else {
        const rows = (orderRows ?? []) as Order[]
        const ids = rows.map((o) => o.id)
        const counts = new Map<string, number>()
        if (ids.length > 0) {
          const { data: itemRows } = await supabase
            .from('order_items')
            .select('order_id')
            .in('order_id', ids)
          for (const r of (itemRows ?? []) as { order_id: string }[]) {
            counts.set(r.order_id, (counts.get(r.order_id) ?? 0) + 1)
          }
        }
        orders = rows.map((o) => ({ ...o, itemCount: counts.get(o.id) ?? 0 }))
      }
    } catch (e) {
      ordersError = e instanceof Error ? e.message : String(e)
    }
  }

  // Client-side type classification + filter.
  // Legacy lavender/service booking rows are managed in /admin/bookings, so they
  // are excluded from the default "all" view here. They stay reachable via the
  // direct ?type=booking URL (where a legacy banner is shown), never deleted.
  const classified = inquiries.map((inq) => ({ inq, kind: classifyInquiry(inq) }))
  const filtered = safeType === 'all'
    ? classified.filter((c) => c.kind !== 'booking').map((c) => c.inq)
    : classified.filter((c) => c.kind === safeType).map((c) => c.inq)

  const isLegacyBookingView = safeType === 'booking'

  // Real orders honour the same status filter as inquiries. Order statuses that
  // have no inquiry equivalent (confirmed/packed/shipped) simply don't match the
  // inquiry-oriented status chips, which is the intended behaviour.
  const visibleOrders = safeStatus === 'all' ? orders : orders.filter((o) => o.status === safeStatus)

  // Count per type (before type filter, within current status filter). The
  // "Замовлення" count combines real orders + legacy fallback orders.
  const fallbackOrderCount = classified.filter((c) => c.kind === 'order').length
  const typeCounts = {
    order: visibleOrders.length + fallbackOrderCount,
    inquiry: classified.filter((c) => c.kind === 'inquiry').length,
  }

  const newCount = safeType === 'order'
    ? visibleOrders.filter((o) => o.status === 'new').length + filtered.filter((i) => i.status === 'new').length
    : filtered.filter((i) => i.status === 'new').length

  return (
    <div className="px-4 sm:px-6 py-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Замовлення та заявки</h1>
        {newCount > 0 && (
          <p className="text-sm text-gray-500 mt-0.5">{newCount} нових</p>
        )}
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2 mb-3">
        {TYPE_FILTERS.map(({ value, label }) => {
          const count = typeCounts[value as keyof typeof typeCounts]
          return (
            <a
              key={value}
              href={buildAdminUrl(safeStatus, value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                safeType === value
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${safeType === value ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              )}
            </a>
          )
        })}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map(({ value, label }) => (
          <a
            key={value}
            href={buildAdminUrl(value, safeType)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] flex items-center ${
              safeStatus === value
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {isLegacyBookingView && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
          <p className="text-purple-800 text-sm font-semibold">💜 Застарілі бронювання (legacy)</p>
          <p className="text-purple-700 text-sm mt-0.5">
            Це старі рядки бронювань, що збереглися як заявки. Актуальні бронювання
            керуються на сторінці{' '}
            <a href="/admin/bookings" className="underline font-medium">Бронювання</a>.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6 space-y-2">
          <p className="text-red-700 font-semibold">{error}</p>
          {errorDetail && (
            <p className="text-red-600 text-sm font-mono break-all">{errorDetail}</p>
          )}
          {missingEnv && (
            <p className="text-red-600 text-sm">
              Потрібні:{' '}
              <code className="bg-red-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
              <code className="bg-red-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>
            </p>
          )}
          {errorDetail?.includes('does not exist') && (
            <p className="text-red-600 text-sm">
              Таблиця не знайдена. Виконайте початкову міграцію в Supabase SQL editor.
            </p>
          )}
        </div>
      )}

      {/* A non-fatal error loading real orders is shown as a warning; the page
          (and any fallback orders) still render. */}
      {ordersError && safeType === 'order' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
          <p className="text-yellow-800 text-sm font-semibold">Не вдалося завантажити замовлення</p>
          <p className="text-yellow-700 text-sm font-mono break-all mt-0.5">{ordersError}</p>
        </div>
      )}

      {safeType === 'order' ? (
        /* Orders tab: real `orders` rows first, then any legacy fallback orders
           saved as inquiries. Kept visually separate but under one tab. */
        !error && visibleOrders.length === 0 && filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-bark/50 text-lg">Замовлень немає</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleOrders.map((order) => (
              <AdminOrderCard key={order.id} order={order} />
            ))}
            {filtered.map((inquiry) => (
              <InquiryCard key={inquiry.id} inquiry={inquiry} />
            ))}
          </div>
        )
      ) : (
        <>
          {!error && filtered.length === 0 && (
            <div className="text-center py-16">
              <p className="text-bark/50 text-lg">Заявок немає</p>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="space-y-4">
              {filtered.map((inquiry) => (
                <InquiryCard key={inquiry.id} inquiry={inquiry} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
