// ─── Shared order-notification sender (both channels, structured result) ──────
// One place that fans an order alert out to BOTH independent channels:
//   • direct Telegram — TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
//   • webhook / n8n   — WEBHOOK_URL
// Neither channel gates the other, neither ever throws, and the customer's order
// is never coupled to delivery success. Returns a structured, secret-free result
// so callers can log it and the diagnostic endpoint can report the last outcome.
//
// The production bug this addresses: the two channels were configured/awaited
// correctly in the checkout action, but there was (a) no shared, testable sender,
// (b) no structured per-channel status, and (c) no way to probe config presence
// or fire a safe test. WEBHOOK_URL was also undocumented. All fixed here.

export type ChannelOutcome = 'sent' | 'failed' | 'not_configured'

export interface NotifyResult {
  direct_telegram: ChannelOutcome
  webhook: ChannelOutcome
  // Raw HTTP status codes (never any token/URL/secret). null when not attempted.
  telegram_http_status: number | null
  webhook_http_status: number | null
  at: string // ISO timestamp of the attempt
}

export interface NotifyConfig {
  telegramToken?: string | null
  telegramChatId?: string | null
  webhookUrl?: string | null
}

// Presence-only view of the config — booleans, never the values. Safe to return
// from a diagnostic endpoint.
export interface NotifyPresence {
  direct_telegram: boolean
  webhook: boolean
}

type FetchLike = (input: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
}) => Promise<{ ok: boolean; status: number }>

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
    direct_telegram: Boolean(c.telegramToken && c.telegramChatId),
    webhook: Boolean(c.webhookUrl),
  }
}

// Module-level last-known result so a protected diagnostic GET can report the
// most recent real send without persisting anything or exposing secrets. Resets
// on process restart — documented as "last-known", not durable history.
let lastResult: NotifyResult | null = null
export function getLastNotifyResult(): NotifyResult | null {
  return lastResult
}

// Send an order notification to every configured channel. Never throws. `now` is
// injectable for deterministic tests; `fetchImpl` lets tests avoid real network.
export async function sendOrderNotifications(opts: {
  message: string
  payload: Record<string, unknown>
  config?: NotifyConfig
  fetchImpl?: FetchLike
  now?: () => string
}): Promise<NotifyResult> {
  const cfg = opts.config ?? readNotifyConfigFromEnv()
  const f: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const nowIso = (opts.now ?? (() => new Date().toISOString()))()

  const result: NotifyResult = {
    direct_telegram: 'not_configured',
    webhook: 'not_configured',
    telegram_http_status: null,
    webhook_http_status: null,
    at: nowIso,
  }

  const tasks: Promise<void>[] = []

  // ── Channel 1: direct Telegram (plain text) ─────────────────────────────────
  if (cfg.telegramToken && cfg.telegramChatId) {
    tasks.push((async () => {
      try {
        const res = await f(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: cfg.telegramChatId, text: opts.message }),
        })
        result.telegram_http_status = res.status
        result.direct_telegram = res.ok ? 'sent' : 'failed'
      } catch {
        result.direct_telegram = 'failed'
      }
    })())
  }

  // ── Channel 2: webhook / n8n ────────────────────────────────────────────────
  if (cfg.webhookUrl) {
    const url = cfg.webhookUrl
    tasks.push((async () => {
      try {
        const res = await f(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'website', ...opts.payload, message: opts.message, created_at: nowIso }),
        })
        result.webhook_http_status = res.status
        result.webhook = res.ok ? 'sent' : 'failed'
      } catch {
        result.webhook = 'failed'
      }
    })())
  }

  // allSettled never rejects — both channels are attempted and awaited so the
  // request is not abandoned in a standalone/serverless runtime.
  await Promise.allSettled(tasks)
  lastResult = result
  return result
}

// A one-line, secret-free log string for the structured result (requirement B5).
export function formatNotifyLog(r: NotifyResult): string {
  const t = r.telegram_http_status != null ? ` http=${r.telegram_http_status}` : ''
  const w = r.webhook_http_status != null ? ` http=${r.webhook_http_status}` : ''
  return `direct_telegram=${r.direct_telegram}${t} webhook=${r.webhook}${w}`
}
