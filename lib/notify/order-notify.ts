// ─── Order notification sender: n8n webhook PRIMARY, Telegram FALLBACK ────────
// The real production destination is the active n8n workflow at WEBHOOK_URL
// (https://n8n.vladkuzmenko.com/webhook/dacha-tv-orders), which itself routes
// product_order_received / product_order_fallback / product_order_supplier_status
// to the Telegram Product Order node (chat 1070085460, reads $json.message).
//
// Therefore direct Telegram from the site is a FALLBACK ONLY — used when the
// webhook is not configured, or throws / times out / returns a non-2xx. On a
// successful webhook send we NEVER also send direct Telegram (that would double
// the alert, since n8n already forwards to the same chat).
//
// Every notification carries a deterministic `event_id` so n8n can dedupe
// accidental repeats (e.g. reconciliation re-reporting the same supplier state).
// The customer's order is NEVER coupled to notification delivery: this never
// throws and returns a structured, secret-free result.

export type ChannelOutcome = 'sent' | 'failed' | 'not_configured' | 'skipped'

export interface NotifyResult {
  // Primary channel.
  webhook: ChannelOutcome
  // Fallback channel — 'skipped' when the webhook already succeeded.
  telegram_fallback: ChannelOutcome
  webhook_http_status: number | null
  telegram_http_status: number | null
  event_id: string
  at: string
}

export interface NotifyConfig {
  telegramToken?: string | null
  telegramChatId?: string | null
  webhookUrl?: string | null
}

export interface NotifyPresence {
  webhook: boolean
  direct_telegram: boolean
}

type FetchLike = (input: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}) => Promise<{ ok: boolean; status: number }>

const WEBHOOK_TIMEOUT_MS = 8000

export function readNotifyConfigFromEnv(): NotifyConfig {
  return {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? null,
    telegramChatId: process.env.TELEGRAM_CHAT_ID ?? null,
    webhookUrl: process.env.WEBHOOK_URL ?? null,
  }
}

export function notifyPresence(config?: NotifyConfig): NotifyPresence {
  const c = config ?? readNotifyConfigFromEnv()
  return {
    webhook: Boolean(c.webhookUrl),
    direct_telegram: Boolean(c.telegramToken && c.telegramChatId),
  }
}

// Last-known result for the diagnostic GET (secret-free, resets on restart).
let lastResult: NotifyResult | null = null
export function getLastNotifyResult(): NotifyResult | null {
  return lastResult
}

const is2xx = (status: number) => status >= 200 && status < 300

// The full order-notification payload contract shared with n8n. Every field is
// always present (null when unknown) so the workflow's expression paths never
// hit undefined. `message` is what the Telegram Product Order node renders.
export interface OrderNotifyPayload {
  type: string
  event_id: string
  message: string
  order_id: string | null
  supplier_order_id: string | null
  name: string | null
  phone: string | null
  product: string | null
  items_text: string | null
  total: number | null
  payment_method: string | null
  warehouse: string | null
  comment: string | null
  page_url: string | null
  created_at: string
}

// Build the canonical payload, guaranteeing every contract field exists.
export function buildOrderNotifyPayload(input: {
  type: string
  eventId: string
  message: string
  createdAt: string
  order_id?: string | null
  supplier_order_id?: string | null
  name?: string | null
  phone?: string | null
  product?: string | null
  items_text?: string | null
  total?: number | null
  payment_method?: string | null
  warehouse?: string | null
  comment?: string | null
  page_url?: string | null
  extra?: Record<string, unknown>
}): OrderNotifyPayload & Record<string, unknown> {
  return {
    type: input.type,
    event_id: input.eventId,
    message: input.message,
    order_id: input.order_id ?? null,
    supplier_order_id: input.supplier_order_id ?? null,
    name: input.name ?? null,
    phone: input.phone ?? null,
    product: input.product ?? null,
    items_text: input.items_text ?? null,
    total: input.total ?? null,
    payment_method: input.payment_method ?? null,
    warehouse: input.warehouse ?? null,
    comment: input.comment ?? null,
    page_url: input.page_url ?? null,
    created_at: input.createdAt,
    ...(input.extra ?? {}),
  }
}

// Send one order notification. Webhook first (primary); direct Telegram only as
// a fallback. Never throws. `eventId` is echoed into the payload + result.
export async function sendOrderNotifications(opts: {
  message: string
  payload: Record<string, unknown>
  eventId: string
  config?: NotifyConfig
  fetchImpl?: FetchLike
  now?: () => string
}): Promise<NotifyResult> {
  const cfg = opts.config ?? readNotifyConfigFromEnv()
  const f: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const at = (opts.now ?? (() => new Date().toISOString()))()

  const result: NotifyResult = {
    webhook: 'not_configured',
    telegram_fallback: 'not_configured',
    webhook_http_status: null,
    telegram_http_status: null,
    event_id: opts.eventId,
    at,
  }

  // ── Primary: n8n webhook ────────────────────────────────────────────────────
  let webhookSucceeded = false
  if (cfg.webhookUrl) {
    const body = JSON.stringify({
      source: 'website',
      event_id: opts.eventId,
      ...opts.payload,
      message: opts.message,
      created_at: at,
    })
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), WEBHOOK_TIMEOUT_MS)
    try {
      const res = await f(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      })
      result.webhook_http_status = res.status
      webhookSucceeded = is2xx(res.status)
      result.webhook = webhookSucceeded ? 'sent' : 'failed'
    } catch {
      result.webhook = 'failed' // throw / timeout / abort
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Fallback: direct Telegram — ONLY when the webhook did not succeed ────────
  if (webhookSucceeded) {
    result.telegram_fallback = 'skipped' // never double-send
  } else if (cfg.telegramToken && cfg.telegramChatId) {
    try {
      const res = await f(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cfg.telegramChatId, text: opts.message }),
      })
      result.telegram_http_status = res.status
      result.telegram_fallback = is2xx(res.status) ? 'sent' : 'failed'
    } catch {
      result.telegram_fallback = 'failed'
    }
  } else {
    result.telegram_fallback = 'not_configured'
  }

  lastResult = result
  return result
}

// A one-line, secret-free log string (requirement A7).
export function formatNotifyLog(r: NotifyResult): string {
  const w = r.webhook_http_status != null ? ` http=${r.webhook_http_status}` : ''
  const t = r.telegram_http_status != null ? ` http=${r.telegram_http_status}` : ''
  return `event=${r.event_id} webhook=${r.webhook}${w} telegram_fallback=${r.telegram_fallback}${t}`
}
