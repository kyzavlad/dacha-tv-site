// ─── Bounded supplier order-status reconciliation (PURE core) ─────────────────
// Personal.cab HAS read-only order-status lookups (get_order_details /
// get_orders — see lib/supplier/order.ts), so a bounded scheduled job can catch
// the case where the supplier ACCEPTED an order but later marked it unfulfilled.
// This module holds the pure decision logic so it is unit-testable without the
// supplier API or a database; the cron route wires it to both.

import type { NormalizedSupplierStatus } from './order'

export interface LocalOrderRef {
  id: string
  supplier_order_id: string | null
  supplier_order_status: string | null
}

// Local supplier_order_status values that are worth re-polling: the order was
// forwarded (or accepted-but-unconfirmed) and has not yet reached a terminal /
// attention state. Terminal states (already not_fulfilled/cancelled) and
// non-supplier orders (skipped/disabled/failed) are never polled again.
const POLLABLE_STATUSES = new Set(['sent', 'sent_unconfirmed'])

export function ordersToReconcile(orders: LocalOrderRef[], limit = 50): LocalOrderRef[] {
  return orders
    .filter((o) => !!o.supplier_order_id && POLLABLE_STATUSES.has(String(o.supplier_order_status ?? '')))
    .slice(0, Math.max(0, limit))
}

export interface ReconcileDecision {
  orderId: string
  supplierOrderId: string
  lifecycle: NormalizedSupplierStatus
  needsAttention: boolean
  // The supplier_order_status to persist. On an attention state we record the
  // real lifecycle; otherwise the row is left as-is (returned unchanged so the
  // caller can skip a no-op write).
  newSupplierStatus: string | null
}

// A supplier order needs human attention when the supplier explicitly did NOT
// fulfil it (or cancelled it) AFTER accepting it. `fulfilled`/`shipped`/
// `processing`/`unknown` are not escalated — the order proceeds normally.
export function decideReconciliation(
  order: LocalOrderRef,
  lifecycle: NormalizedSupplierStatus,
): ReconcileDecision {
  const needsAttention = lifecycle === 'not_fulfilled' || lifecycle === 'cancelled'
  return {
    orderId: order.id,
    supplierOrderId: String(order.supplier_order_id),
    lifecycle,
    needsAttention,
    // Preserve the supplier order id (caller never nulls it); only advance the
    // status to the attention lifecycle when there IS an attention condition.
    newSupplierStatus: needsAttention ? lifecycle : null,
  }
}
