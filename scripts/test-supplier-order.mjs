#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Personal.cab supplier diagnostics + add_order smoke test.
//
// Talks directly to the Personal.cab API (query-param routing) so you can verify
// connectivity and the add_order contract WITHOUT going through checkout.
//
// Credentials come from env (never hard-code them):
//   SUPPLIER_API_URL   e.g. https://my.personal.cab/api
//   SUPPLIER_API_KEY   secret key
//
// Modes:
//   (default)        read-only diagnostics — get_products count + warehouse search.
//                    Creates NOTHING. Safe to run anytime.
//   --test-order     send an add_order with &mode=test (supplier validates/logs,
//                    NO real shipment). Prints the raw response.
//   --live           send a REAL add_order (no test mode). Creates a real order in
//                    Personal.cab. Requires the explicit --live flag.
//
// Optional overrides (for --test-order / --live):
//   --sku=XYZ            supplier SKU to order (default: TEST-SKU)
//   --qty=N              quantity (default: 1)
//   --price=N            unit price UAH (default: 100)
//   --phone=380XXXXXXXXX receiver phone WITHOUT '+' (default: 380501234567)
//   --location=ID        Nova Poshta warehouse internal_id (default: from first
//                        warehouse found for --city, else 1)
//   --city=Назва         warehouse search query for diagnostics/location lookup
//
// Examples:
//   node scripts/test-supplier-order.mjs
//   node scripts/test-supplier-order.mjs --city=Пісочин
//   node scripts/test-supplier-order.mjs --test-order --sku=ABC123 --location=42
//   node scripts/test-supplier-order.mjs --live --sku=ABC123 --location=42
// ─────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => !a.includes('=')))
const opts = Object.fromEntries(
  argv.filter((a) => a.includes('=')).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=')
    return [k, rest.join('=')]
  }),
)

const API_URL = process.env.SUPPLIER_API_URL
const API_KEY = process.env.SUPPLIER_API_KEY

if (!API_URL || !API_KEY) {
  console.error('✖ SUPPLIER_API_URL and SUPPLIER_API_KEY must be set in the environment.')
  process.exit(1)
}

const BASE = API_URL.replace(/\/$/, '')

// Build a request URL, never logging the key.
function buildUrl(params) {
  const qp = new URLSearchParams({ key: API_KEY, type: 'json', ...params })
  return `${BASE}?${qp}`
}
function safeUrl(params) {
  const qp = new URLSearchParams({ key: '***', type: 'json', ...params })
  return `${BASE}?${qp}`
}

async function apiGet(params) {
  const res = await fetch(buildUrl(params), { headers: { Accept: 'application/json' }, cache: 'no-store' })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { _raw_text: text } }
  return { httpStatus: res.status, ok: res.ok, text, json }
}

async function apiPost(params, body) {
  const res = await fetch(buildUrl(params), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { _raw_text: text } }
  return { httpStatus: res.status, ok: res.ok, text, json }
}

// ── Read-only: product feed reachability ─────────────────────────────────────
async function diagProducts() {
  console.log('\n── get_products (read-only) ───────────────────────────────')
  console.log(`GET ${safeUrl({ method: 'get_products' })}`)
  try {
    const { httpStatus, json, text } = await apiGet({ method: 'get_products', language: 'ua' })
    console.log(`HTTP ${httpStatus}`)
    const list = Array.isArray(json) ? json
      : Array.isArray(json?.products) ? json.products
      : Array.isArray(json?.data) ? json.data
      : null
    if (list) {
      console.log(`✔ products returned: ${list.length}`)
      if (list[0]) console.log(`  sample item keys: ${Object.keys(list[0]).join(', ')}`)
    } else {
      console.log(`top-level keys: ${Object.keys(json ?? {}).join(', ') || '(none)'}`)
      console.log(`raw (first 400): ${(text || '(empty)').slice(0, 400)}`)
    }
  } catch (e) {
    console.error(`✖ get_products failed: ${e.message}`)
  }
}

// ── Read-only: Nova Poshta warehouse search ──────────────────────────────────
async function diagWarehouses(city) {
  console.log('\n── get_novaposhta_warehouses (read-only) ──────────────────')
  const params = { method: 'get_novaposhta_warehouses' }
  if (city) params.city = city
  console.log(`GET ${safeUrl(params)}`)
  try {
    const { httpStatus, json, text } = await apiGet(params)
    console.log(`HTTP ${httpStatus}`)
    const list = Array.isArray(json) ? json
      : Array.isArray(json?.warehouses) ? json.warehouses
      : Array.isArray(json?.data) ? json.data
      : null
    if (list) {
      console.log(`✔ warehouses returned: ${list.length}`)
      const first = list[0]
      if (first) {
        console.log(`  sample item keys: ${Object.keys(first).join(', ')}`)
        const id = first.internal_id ?? first.id ?? first.Ref ?? '(?)'
        console.log(`  first warehouse id: ${id}`)
        return String(id)
      }
    } else {
      console.log(`top-level keys: ${Object.keys(json ?? {}).join(', ') || '(none)'}`)
      console.log(`raw (first 400): ${(text || '(empty)').slice(0, 400)}`)
    }
  } catch (e) {
    console.error(`✖ get_novaposhta_warehouses failed: ${e.message}`)
  }
  return null
}

// ── Write: add_order (test or live) ──────────────────────────────────────────
async function sendOrder({ live, location }) {
  const mode = live ? 'live' : 'test'
  const phone = (opts.phone ?? '380501234567').replace(/^\+/, '')
  const body = {
    receiver_first_name: 'Тест',
    receiver_last_name: 'Замовлення',
    receiver_phone: phone,
    method_payment: 'cashondelivery',
    location: opts.location ?? location ?? '1',
    products: [{ sku: opts.sku ?? 'TEST-SKU', qty: Number(opts.qty ?? 1), price: Number(opts.price ?? 100) }],
    comments: `Smoke test via scripts/test-supplier-order.mjs (mode=${mode})`,
  }

  const params = { method: 'add_order' }
  if (mode === 'test') params.mode = 'test'

  console.log(`\n── add_order (mode=${mode}) ${live ? '⚠ REAL ORDER' : 'test'} ──────────`)
  console.log(`POST ${safeUrl(params)}`)
  console.log(`body: ${JSON.stringify(body)}`)

  const { httpStatus, ok, json, text } = await apiPost(params, body)
  console.log(`HTTP ${httpStatus}`)
  console.log(`raw response: ${text || '(empty)'}`)

  const orderId = String(json?.order_id ?? json?.id ?? json?.number ?? '').trim()
  const hasError =
    (typeof json?.error === 'string' && json.error.length > 0) ||
    json?.success === false || json?.status === 'error'

  if (!ok) {
    console.error(`✖ HTTP ${httpStatus} — request failed`)
    process.exitCode = 1
  } else if (hasError) {
    console.error(`✖ API error: ${JSON.stringify(json)}`)
    process.exitCode = 1
  } else if (orderId) {
    console.log(`✔ CONFIRMED — order_id=${orderId}`)
  } else {
    console.warn('⚠ HTTP 200 but NO order_id — UNCONFIRMED. Verify manually in Personal.cab journal.')
    process.exitCode = 2
  }
}

async function main() {
  console.log(`Personal.cab diagnostics — base=${BASE}`)
  const city = opts.city

  // Diagnostics always run (read-only, safe).
  await diagProducts()
  const foundLocation = await diagWarehouses(city)

  if (flags.has('--live')) {
    console.log('\n⚠⚠⚠  --live: this will create a REAL order in Personal.cab.  ⚠⚠⚠')
    await sendOrder({ live: true, location: foundLocation })
  } else if (flags.has('--test-order')) {
    await sendOrder({ live: false, location: foundLocation })
  } else {
    console.log('\nℹ Read-only diagnostics done. Pass --test-order to send a test add_order, or --live for a REAL order.')
  }
}

main().catch((e) => {
  console.error(`✖ unexpected: ${e.stack ?? e.message}`)
  process.exit(1)
})
