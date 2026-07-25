import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sendOrderNotifications,
  notifyPresence,
  formatNotifyLog,
} from '../lib/notify/order-notify.ts'

// A fake fetch that records calls and returns a scripted status per URL kind.
function fakeFetch(script) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    const kind = url.includes('api.telegram.org') ? 'telegram' : 'webhook'
    const s = script[kind]
    if (s === 'throw') throw new Error('network down')
    return { ok: s < 400, status: s }
  }
  impl.calls = calls
  return impl
}

const bothConfig = { telegramToken: 'T', telegramChatId: 'C', webhookUrl: 'https://hook' }
const baseArgs = { message: 'hi', payload: { type: 'test' }, now: () => '2026-07-25T00:00:00.000Z' }

// ── Requirement B1/B2: both channels attempted independently ──────────────────

test('both channels configured → both attempted and reported sent', async () => {
  const f = fakeFetch({ telegram: 200, webhook: 200 })
  const r = await sendOrderNotifications({ ...baseArgs, config: bothConfig, fetchImpl: f })
  assert.equal(r.direct_telegram, 'sent')
  assert.equal(r.webhook, 'sent')
  assert.equal(r.telegram_http_status, 200)
  assert.equal(r.webhook_http_status, 200)
  assert.equal(f.calls.length, 2)
})

test('only Telegram configured → webhook not_configured, telegram sent', async () => {
  const f = fakeFetch({ telegram: 200, webhook: 200 })
  const r = await sendOrderNotifications({ ...baseArgs, config: { telegramToken: 'T', telegramChatId: 'C', webhookUrl: null }, fetchImpl: f })
  assert.equal(r.direct_telegram, 'sent')
  assert.equal(r.webhook, 'not_configured')
  assert.equal(f.calls.length, 1)
  assert.ok(f.calls[0].url.includes('api.telegram.org'))
})

test('only webhook configured → telegram not_configured, webhook sent', async () => {
  const f = fakeFetch({ telegram: 200, webhook: 200 })
  const r = await sendOrderNotifications({ ...baseArgs, config: { telegramToken: null, telegramChatId: null, webhookUrl: 'https://hook' }, fetchImpl: f })
  assert.equal(r.direct_telegram, 'not_configured')
  assert.equal(r.webhook, 'sent')
  assert.equal(f.calls.length, 1)
})

// ── Requirement B2: one channel failing NEVER suppresses the other ────────────

test('telegram fails (HTTP 500) but webhook still sends', async () => {
  const f = fakeFetch({ telegram: 500, webhook: 200 })
  const r = await sendOrderNotifications({ ...baseArgs, config: bothConfig, fetchImpl: f })
  assert.equal(r.direct_telegram, 'failed')
  assert.equal(r.telegram_http_status, 500)
  assert.equal(r.webhook, 'sent')
})

test('telegram throws (network) but webhook still sends; never rejects', async () => {
  const f = fakeFetch({ telegram: 'throw', webhook: 200 })
  const r = await sendOrderNotifications({ ...baseArgs, config: bothConfig, fetchImpl: f })
  assert.equal(r.direct_telegram, 'failed')
  assert.equal(r.webhook, 'sent')
})

// ── Requirement B4/B8: both fail → still returns (order is never lost) ─────────

test('both channels fail → result returned, function never throws', async () => {
  const f = fakeFetch({ telegram: 500, webhook: 500 })
  const r = await sendOrderNotifications({ ...baseArgs, config: bothConfig, fetchImpl: f })
  assert.equal(r.direct_telegram, 'failed')
  assert.equal(r.webhook, 'failed')
  // The caller (checkout) ignores this result for order persistence — proven by
  // the fact that it resolves cleanly with a structured value rather than throwing.
})

// ── Requirement B5/B8: no token or URL leakage ────────────────────────────────

test('the structured result + log contain NO token or URL', async () => {
  const f = fakeFetch({ telegram: 200, webhook: 403 })
  const r = await sendOrderNotifications({ ...baseArgs, config: { telegramToken: 'SECRET-TOKEN', telegramChatId: '123', webhookUrl: 'https://secret.example/hook/abc' }, fetchImpl: f })
  const blob = JSON.stringify(r) + ' ' + formatNotifyLog(r)
  assert.ok(!blob.includes('SECRET-TOKEN'), 'no bot token in result/log')
  assert.ok(!blob.includes('secret.example'), 'no webhook URL in result/log')
  assert.ok(!blob.includes('/hook/abc'), 'no webhook path in result/log')
  // But the HTTP status IS present (requirement B5).
  assert.match(formatNotifyLog(r), /webhook=failed http=403/)
})

test('notifyPresence returns booleans only', () => {
  const p = notifyPresence({ telegramToken: 'T', telegramChatId: 'C', webhookUrl: null })
  assert.deepEqual(p, { direct_telegram: true, webhook: false })
})
