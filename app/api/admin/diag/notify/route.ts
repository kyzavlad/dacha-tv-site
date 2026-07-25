export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { notifyPresence, getLastNotifyResult, sendOrderNotifications } from '@/lib/notify/order-notify'

// ─── Notification diagnostic (protected: CRON_SECRET) ─────────────────────────
// GET  → presence booleans + last-known send result. NEVER returns token/URL
//        values, only whether each channel is configured and the last outcome.
// POST → sends a clearly-marked SAFE test notification through both channels and
//        returns the structured per-channel result (sent/failed/not_configured +
//        HTTP status). No customer data, no order side effects.
//
// This is exactly the probe to run when "the Telegram notification did not
// arrive": GET tells you which channels are configured; POST proves delivery.

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  return Response.json({
    ok: true,
    configured: notifyPresence(),
    last_result: getLastNotifyResult(),
    hint: 'POST to this endpoint (same auth) to send a safe test notification.',
  })
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const presence = notifyPresence()
  if (!presence.direct_telegram && !presence.webhook) {
    return Response.json(
      {
        ok: false,
        configured: presence,
        message:
          'No notification channel is configured. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and/or WEBHOOK_URL.',
      },
      { status: 200 },
    )
  }

  const stamp = new Date().toISOString()
  const result = await sendOrderNotifications({
    message: `🧪 Dacha TV notification test — ${stamp}. If you see this, order alerts are working. (No real order.)`,
    payload: { type: 'notification_test', at: stamp },
  })

  return Response.json({ ok: true, configured: presence, result })
}
