export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import {
  getPersonalCabOrderDetails,
  getPersonalCabOrders,
  type SupplierStatusResult,
} from '@/lib/supplier/order'

// Read-only Personal.cab order LIFECYCLE diagnostic. Lets us see what the
// supplier currently reports for an accepted order — including the dreaded
// "Не выполнен" — without touching checkout, the DB, or creating anything.
//
// Protected by CRON_SECRET (same as all other admin API routes). POST-only.
//
// Two modes (the body decides which):
//   • single order:  { "orderId": "036210" }   → get_order_details
//   • date range:    { "from": "20260622", "to": "20260622" } → get_orders
//
// Usage (production):
//   curl -s -X POST \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -H "Content-Type: application/json" \
//     -d '{"orderId":"036210"}' \
//     https://<site>/api/admin/diag/supplier-order-status
//
//   curl -s -X POST \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -H "Content-Type: application/json" \
//     -d '{"from":"20260622","to":"20260622"}' \
//     https://<site>/api/admin/diag/supplier-order-status
//
// The API key is NEVER included in the response or logs.

function summarize(result: SupplierStatusResult) {
  // Flatten the normalized orders into a compact, key-free summary.
  return {
    ok: result.ok,
    found: result.found,
    message: result.message,
    http_status: result.http_status ?? null,
    count: result.orders.length,
    orders: result.orders.map((o) => ({
      order_id: o.order_id ?? null,
      interpreted_status: o.status,
      raw_status: o.raw_status ?? null,
      ttn: o.ttn ?? null,
      payment: o.payment ?? null,
      delivery: o.delivery ?? null,
      total: o.total ?? null,
    })),
    // The untouched supplier payload, for manual inspection.
    raw_response: result.raw_response ?? null,
  }
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text) as Record<string, unknown>
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const apiUrl = process.env.SUPPLIER_API_URL ?? ''
  const apiKey = process.env.SUPPLIER_API_KEY ?? ''
  const env = { hasApiUrl: apiUrl.length > 0, hasApiKey: apiKey.length > 0, keyLength: apiKey.length }
  if (!env.hasApiUrl || !env.hasApiKey) {
    return Response.json(
      { ok: false, error: 'SUPPLIER_API_URL or SUPPLIER_API_KEY not configured', env },
      { status: 503 },
    )
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  const from = typeof body.from === 'string' ? body.from.trim() : ''
  const to = typeof body.to === 'string' ? body.to.trim() : ''

  // ── Mode A: single order details ──────────────────────────────────────────
  if (orderId) {
    console.info(`[supplier-status-diag] get_order_details id=${orderId}`)
    const result = await getPersonalCabOrderDetails(orderId)
    return Response.json({ mode: 'get_order_details', requested: { orderId }, env, ...summarize(result) })
  }

  // ── Mode B: orders in a date range ────────────────────────────────────────
  if (from && to) {
    console.info(`[supplier-status-diag] get_orders from=${from} to=${to}`)
    const result = await getPersonalCabOrders(from, to)
    return Response.json({ mode: 'get_orders', requested: { from, to }, env, ...summarize(result) })
  }

  return Response.json(
    {
      ok: false,
      error: 'Provide either { "orderId": "..." } or { "from": "YYYYMMDD", "to": "YYYYMMDD" }',
    },
    { status: 400 },
  )
}

export async function GET() {
  return Response.json({ error: 'POST only' }, { status: 405 })
}
