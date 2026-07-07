export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { getSupplierOrderMode, buildPersonalCabOrderPayload, TEST_ORDER_GUARD_ENABLED } from '@/lib/supplier/order'

// ─── Read-only order-flow readiness diagnostic ────────────────────────────────
// Confirms the ecommerce order path is wired WITHOUT sending anything. Reports
// notification/supplier config as presence booleans (never secret values), the
// supplier order mode, recent orders + their supplier_order_status, status
// counts, and a DRY-RUN payload build to prove the supplier payload builder
// works. It NEVER contacts the supplier and NEVER creates an order.
// Protected by CRON_SECRET.
//   GET /api/admin/diag/order-flow
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const env = {
    telegramBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
    webhookUrl: Boolean(process.env.WEBHOOK_URL),
    supplierApiUrl: Boolean(process.env.SUPPLIER_API_URL),
    supplierApiKey: Boolean(process.env.SUPPLIER_API_KEY),
    supplierOrderMode: getSupplierOrderMode(), // 'test' | 'live' | 'disabled'
    testOrderGuardEnabled: TEST_ORDER_GUARD_ENABLED,
  }

  // Dry-run: build (but never send) a supplier payload to confirm the builder
  // works and required-field validation is intact.
  const dryRunBuild = buildPersonalCabOrderPayload({
    receiver_first_name: 'Тест',
    receiver_last_name: 'Замовлення',
    receiver_phone: '+380671234567',
    method_payment: 'cashondelivery',
    location: '1',
    items: [{ supplier_sku: 'DIAG-DRYRUN-SKU', quantity: 1, price_uah: 100 }],
    comments: 'diagnostic dry-run — NOT sent',
  })

  const result: Record<string, unknown> = {
    ok: true,
    env,
    supplier_payload_build: { ok: dryRunBuild.ok, errors: dryRunBuild.ok ? [] : dryRunBuild.errors },
    notes: {
      auto_send: env.supplierOrderMode !== 'disabled'
        ? `Supplier auto-forward is ${env.supplierOrderMode.toUpperCase()} — ${env.supplierOrderMode === 'test' ? 'orders are validated & accepted as TEST, no real supplier order is created' : 'REAL supplier orders will be created'}.`
        : 'Supplier auto-forward is DISABLED — supplier items are flagged for manual handling, never sent.',
      // Live real orders ARE forwarded to the supplier; test/internal orders are
      // always blocked from forwarding (supplier_order_status='test_blocked').
      test_order_guard: env.testOrderGuardEnabled
        ? 'ENABLED — real customer orders forward to the supplier in live mode, but orders marked as test/internal (тест / test / «не відправляти» / «не отправлять» / «не надсилати» / "don\'t send") are NEVER forwarded and are saved with supplier_order_status=test_blocked for manual review.'
        : 'DISABLED.',
      // Notifications are healthy when EITHER channel is configured — the
      // webhook/n8n path and direct Telegram are independent and either alone
      // delivers order alerts. Direct Telegram being unset is NOT a problem when
      // the webhook is configured (the intended production setup).
      notifications: env.webhookUrl
        ? (env.telegramBotToken && env.telegramChatId
            ? 'Notifications routed via webhook/n8n; direct Telegram also configured.'
            : 'Notifications routed via webhook/n8n (WEBHOOK_URL). Direct Telegram is optional and intentionally unused.')
        : (env.telegramBotToken && env.telegramChatId
            ? 'Notifications sent via direct Telegram (WEBHOOK_URL not set).'
            : 'No notification channel configured — set WEBHOOK_URL (n8n) or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.'),
    },
  }

  try {
    const client = getAdminClient()
    const [{ data: recent }, statuses, { count: ordersTotal }] = await Promise.all([
      client
        .from('orders')
        .select('id, created_at, customer_name, total_uah, status, supplier_order_mode, supplier_order_status, supplier_order_id')
        .order('created_at', { ascending: false })
        .limit(5),
      client
        .from('orders')
        .select('supplier_order_status')
        .not('supplier_order_status', 'is', null)
        .limit(1000),
      // Total row count in the `orders` table — confirms real orders exist and
      // are readable by the admin, independent of any UI wiring.
      client
        .from('orders')
        .select('id', { count: 'exact', head: true }),
    ])

    result.orders_total = ordersTotal ?? 0

    const statusCounts: Record<string, number> = {}
    for (const r of (statuses.data ?? []) as { supplier_order_status: string | null }[]) {
      const s = r.supplier_order_status ?? 'unknown'
      statusCounts[s] = (statusCounts[s] ?? 0) + 1
    }

    result.recent_orders = (recent ?? []).map((o) => ({
      id: (o.id as string)?.slice(0, 8),
      created_at: o.created_at,
      customer: o.customer_name,
      total_uah: o.total_uah,
      status: o.status,
      supplier_mode: o.supplier_order_mode,
      supplier_status: o.supplier_order_status,
      supplier_order_id: o.supplier_order_id,
    }))
    result.supplier_status_counts = statusCounts
  } catch (e) {
    result.orders_read_error = e instanceof Error ? e.message : String(e)
  }

  return Response.json(result)
}
