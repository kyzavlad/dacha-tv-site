export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { getPersonalCabOrderDetails } from '@/lib/supplier/order'
import { ordersToReconcile, decideReconciliation, type LocalOrderRef } from '@/lib/supplier/reconcile'
import { sendOrderNotifications } from '@/lib/notify/order-notify'

// ─── Bounded supplier order-status reconciliation (cron, CRON_SECRET) ─────────
// Re-checks recently-forwarded supplier orders that Personal.cab ACCEPTED but
// may later have marked unfulfilled. For each order still in a pollable state
// (sent / sent_unconfirmed) it calls get_order_details ONCE. On not_fulfilled /
// cancelled it: preserves the supplier_order_id, marks the local order as
// requiring attention (supplier_order_status + admin_notes), and sends a
// Telegram/webhook warning. Never creates or cancels a supplier order.
//
// Bounded for the 3.7 GiB server: at most `limit` orders (default 30, hard cap
// 100), one lightweight status GET each, over a small recent window.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '30', 10) || 30, 1), 100)
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '7', 10) || 7, 1), 30)
  const client = getAdminClient()

  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data: rows, error } = await client
    .from('orders')
    .select('id, supplier_order_id, supplier_order_status, admin_notes, created_at')
    .not('supplier_order_id', 'is', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return Response.json({ ok: false, message: `orders read failed: ${error.message}` }, { status: 200 })
  }

  const pollable = ordersToReconcile((rows ?? []) as LocalOrderRef[], limit)
  let checked = 0
  let flagged = 0
  const attention: Array<{ order_id: string; supplier_order_id: string; lifecycle: string }> = []

  for (const order of pollable) {
    checked++
    const res = await getPersonalCabOrderDetails(String(order.supplier_order_id))
    if (!res.ok || !res.found) continue // request failed or order not visible yet — leave as-is
    const lifecycle = res.orders[0]?.status ?? 'unknown'
    const decision = decideReconciliation(order, lifecycle)
    if (!decision.needsAttention) continue

    flagged++
    attention.push({ order_id: decision.orderId, supplier_order_id: decision.supplierOrderId, lifecycle: decision.lifecycle })

    const existingNotes = (rows ?? []).find((r) => r.id === order.id)?.admin_notes as string | null
    const stamp = new Date().toISOString()
    const note = `⚠️ Постачальник позначив замовлення як «${decision.lifecycle}» (${stamp}). Потребує ручної перевірки. Supplier order ${decision.supplierOrderId} збережено.`
    await client
      .from('orders')
      .update({
        // Preserve supplier_order_id; only advance the status + append a note.
        supplier_order_status: decision.newSupplierStatus,
        admin_notes: existingNotes ? `${existingNotes}\n${note}` : note,
      })
      .eq('id', order.id)

    // Route through the SAME product_order_supplier_status branch the workflow
    // already handles. Deterministic event_id (order + lifecycle) so repeated
    // reconciliation runs finding the same state dedupe in n8n instead of
    // re-alerting every 2 hours.
    await sendOrderNotifications({
      eventId: `product_order_supplier_status:${decision.orderId}:${decision.lifecycle}`,
      message: [
        '⚠️ Замовлення потребує уваги (звірка з постачальником)',
        `Замовлення #${decision.orderId.slice(0, 8).toUpperCase()}`,
        `Постачальник: ${decision.lifecycle}`,
        `Supplier order: ${decision.supplierOrderId}`,
      ].join('\n'),
      payload: {
        type: 'product_order_supplier_status',
        order_id: decision.orderId,
        supplier_order_id: decision.supplierOrderId,
        supplier_status: decision.lifecycle,
        requires_attention: true,
      },
    })
  }

  return Response.json({ ok: true, window_days: days, candidates: pollable.length, checked, flagged, attention })
}
