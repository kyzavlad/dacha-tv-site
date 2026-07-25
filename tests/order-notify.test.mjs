import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sendOrderNotifications,
  notifyPresence,
  formatNotifyLog,
  buildOrderNotifyPayload,
} from '../lib/notify/order-notify.ts'

// Fake fetch: records calls, returns a scripted status per channel kind.
function fakeFetch(script) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    const kind = url.includes('api.telegram.org') ? 'telegram' : 'webhook'
    const s = script[kind]
    if (s === 'throw') throw new Error('network down')
    return { ok: s >= 200 && s < 300, status: s }
  }
  impl.calls = calls
  impl.telegramCalls = () => calls.filter((c) => c.url.includes('api.telegram.org'))
  impl.webhookCalls = () => calls.filter((c) => !c.url.includes('api.telegram.org'))
  return impl
}

const both = { telegramToken: 'T', telegramChatId: '1070085460', webhookUrl: 'https://n8n.example/webhook/dacha-tv-orders' }
const base = { message: 'order!', payload: { type: 'product_order_received', order_id: 'o1' }, eventId: 'product_order_received:abc', now: () => '2026-07-25T00:00:00.000Z' }

// ── A1/A2/A3: webhook primary; Telegram is fallback only; no double-send ──────

test('webhook succeeds → direct Telegram is NOT called (no double notification)', async () => {
  const f = fakeFetch({ webhook: 200, telegram: 200 })
  const r = await sendOrderNotifications({ ...base, config: both, fetchImpl: f })
  assert.equal(r.webhook, 'sent')
  assert.equal(r.telegram_fallback, 'skipped')
  assert.equal(f.webhookCalls().length, 1)
  assert.equal(f.telegramCalls().length, 0, 'telegram must not fire when webhook succeeded')
})

test('webhook fails (non-2xx) → direct Telegram fallback IS called', async () => {
  const f = fakeFetch({ webhook: 500, telegram: 200 })
  const r = await sendOrderNotifications({ ...base, config: both, fetchImpl: f })
  assert.equal(r.webhook, 'failed')
  assert.equal(r.webhook_http_status, 500)
  assert.equal(r.telegram_fallback, 'sent')
  assert.equal(f.telegramCalls().length, 1)
})

test('webhook throws/times out → direct Telegram fallback IS called', async () => {
  const f = fakeFetch({ webhook: 'throw', telegram: 200 })
  const r = await sendOrderNotifications({ ...base, config: both, fetchImpl: f })
  assert.equal(r.webhook, 'failed')
  assert.equal(r.telegram_fallback, 'sent')
})

test('webhook MISSING → direct Telegram fallback IS called', async () => {
  const f = fakeFetch({ webhook: 200, telegram: 200 })
  const r = await sendOrderNotifications({ ...base, config: { ...both, webhookUrl: null }, fetchImpl: f })
  assert.equal(r.webhook, 'not_configured')
  assert.equal(r.telegram_fallback, 'sent')
  assert.equal(f.webhookCalls().length, 0)
  assert.equal(f.telegramCalls().length, 1)
})

// ── A6: order never depends on notification — both fail, still returns ────────

test('both channels fail → returns a result, never throws (order stays saved)', async () => {
  const f = fakeFetch({ webhook: 500, telegram: 500 })
  const r = await sendOrderNotifications({ ...base, config: both, fetchImpl: f })
  assert.equal(r.webhook, 'failed')
  assert.equal(r.telegram_fallback, 'failed')
})

// ── A4: deterministic event_id echoed everywhere ─────────────────────────────

test('event_id is echoed into the result AND the webhook body', async () => {
  const f = fakeFetch({ webhook: 200, telegram: 200 })
  const r = await sendOrderNotifications({ ...base, config: both, fetchImpl: f })
  assert.equal(r.event_id, 'product_order_received:abc')
  const body = JSON.parse(f.webhookCalls()[0].init.body)
  assert.equal(body.event_id, 'product_order_received:abc')
  assert.equal(body.type, 'product_order_received')
  assert.equal(body.message, 'order!')
  assert.equal(body.created_at, '2026-07-25T00:00:00.000Z')
})

test('event_id is stable for the same logical event across retries', async () => {
  const f1 = fakeFetch({ webhook: 500, telegram: 200 })
  const f2 = fakeFetch({ webhook: 200, telegram: 200 })
  const a = await sendOrderNotifications({ ...base, config: both, fetchImpl: f1 })
  const b = await sendOrderNotifications({ ...base, config: both, fetchImpl: f2 })
  assert.equal(a.event_id, b.event_id, 'same event → same id (n8n can dedupe)')
})

// ── A5: payload always carries the full contract ─────────────────────────────

test('buildOrderNotifyPayload always includes every contract field', () => {
  const p = buildOrderNotifyPayload({ type: 'product_order_received', eventId: 'e', message: 'm', createdAt: 't' })
  for (const k of ['type', 'event_id', 'message', 'order_id', 'supplier_order_id', 'name', 'phone', 'product', 'items_text', 'total', 'payment_method', 'warehouse', 'comment', 'page_url', 'created_at']) {
    assert.ok(k in p, `payload must contain ${k}`)
  }
  assert.equal(p.order_id, null)
})

// ── A7: secret-free logs + responses ─────────────────────────────────────────

test('result + log never contain the token or webhook URL', async () => {
  const f = fakeFetch({ webhook: 403, telegram: 200 })
  const r = await sendOrderNotifications({
    ...base,
    config: { telegramToken: 'SECRET-BOT-TOKEN', telegramChatId: '1070085460', webhookUrl: 'https://n8n.example/webhook/SECRETPATH' },
    fetchImpl: f,
  })
  const blob = JSON.stringify(r) + ' ' + formatNotifyLog(r)
  assert.ok(!blob.includes('SECRET-BOT-TOKEN'))
  assert.ok(!blob.includes('SECRETPATH'))
  assert.ok(!blob.includes('n8n.example'))
  assert.match(formatNotifyLog(r), /webhook=failed http=403/)
  assert.match(formatNotifyLog(r), /telegram_fallback=sent/)
})

test('notifyPresence returns booleans only (webhook + direct_telegram)', () => {
  assert.deepEqual(notifyPresence({ telegramToken: 'T', telegramChatId: 'C', webhookUrl: null }), { webhook: false, direct_telegram: true })
  assert.deepEqual(notifyPresence({ telegramToken: null, telegramChatId: null, webhookUrl: 'x' }), { webhook: true, direct_telegram: false })
})
