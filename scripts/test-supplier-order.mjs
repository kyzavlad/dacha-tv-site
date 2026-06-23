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
  const bodyStr = JSON.stringify(body)
  const res = await fetch(buildUrl(params), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Content-Length': String(Buffer.byteLength(bodyStr)),
    },
    body: bodyStr,
    cache: 'no-store',
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { _raw_text: text } }
  return { httpStatus: res.status, ok: res.ok, text, json }
}

// Candidate keys for common product fields (supplier feed naming varies).
const SKU_KEYS = ['sku', 'article', 'vendor_code', 'code', 'id', 'product_sku']
const NAME_KEYS = ['name', 'title', 'product_name', 'model']
const STOCK_KEYS = ['stock', 'quantity', 'qty', 'count', 'available', 'availability', 'in_stock', 'instock', 'balance', 'rest']
const STATUS_KEYS = ['status', 'state', 'active', 'enabled', 'visible']

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined
  const lower = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), obj[k]]))
  for (const k of keys) {
    const v = lower.get(k.toLowerCase())
    if (v != null && v !== '' && typeof v !== 'object') return v
  }
  return undefined
}

// ── Read-only: product feed reachability + optional product lookup ───────────
// --search=TEXT       case-insensitive match on product name/title
// --products-sku=SKU  exact (case-insensitive) match on a SKU field
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
    if (!list) {
      console.log(`top-level keys: ${Object.keys(json ?? {}).join(', ') || '(none)'}`)
      console.log(`raw (first 400): ${(text || '(empty)').slice(0, 400)}`)
      return
    }
    console.log(`✔ products returned: ${list.length}`)
    if (list[0]) console.log(`  sample item keys: ${Object.keys(list[0]).join(', ')}`)

    // Optional lookup of a specific product to diagnose stock/status.
    const search = (opts.search ?? '').toString().trim().toLowerCase()
    const skuQuery = (opts['products-sku'] ?? opts.sku ?? '').toString().trim().toLowerCase()
    if (!search && !skuQuery) return

    const matches = list.filter((item) => {
      const name = String(pick(item, NAME_KEYS) ?? '').toLowerCase()
      const sku = String(pick(item, SKU_KEYS) ?? '').toLowerCase()
      if (skuQuery && sku === skuQuery) return true
      if (search && name.includes(search)) return true
      return false
    })

    console.log(`\n  lookup (${skuQuery ? `sku=${skuQuery} ` : ''}${search ? `search="${search}"` : ''}) → ${matches.length} match(es)`)
    matches.slice(0, 10).forEach((item, i) => {
      const sku = pick(item, SKU_KEYS)
      const name = pick(item, NAME_KEYS)
      const stock = pick(item, STOCK_KEYS)
      const status = pick(item, STATUS_KEYS)
      console.log(`   [${i + 1}] sku=${sku ?? '(?)'} | name=${name ?? '(?)'}`)
      console.log(`        stock=${stock ?? '(no stock field)'} | status=${status ?? '(no status field)'}`)
      console.log(`        keys: ${Object.keys(item).join(', ')}`)
    })
    if (matches.length === 0) {
      console.log('   ⚠ No product matched. The SKU sent at checkout may not exist in the supplier feed (→ "Не выполнен").')
    }
  } catch (e) {
    console.error(`✖ get_products failed: ${e.message}`)
  }
}

// ── Read-only: order lifecycle lookups ───────────────────────────────────────
// --order-status=ID            → get_order_details
// --orders=YYYYMMDD-YYYYMMDD    → get_orders for a date range
async function diagOrderStatus() {
  const id = (opts['order-status'] ?? '').toString().trim()
  const range = (opts.orders ?? '').toString().trim()
  if (id) {
    console.log('\n── get_order_details (read-only) ──────────────────────────')
    console.log(`GET ${safeUrl({ method: 'get_order_details', id })}`)
    const { httpStatus, json, text } = await apiGet({ method: 'get_order_details', id })
    console.log(`HTTP ${httpStatus}`)
    console.log(`raw (first 800): ${(text || '(empty)').slice(0, 800)}`)
    const obj = Array.isArray(json) ? json[0] : (json?.orders?.[0] ?? json?.data?.[0] ?? json)
    if (obj && typeof obj === 'object') {
      console.log(`  status=${pick(obj, STATUS_KEYS) ?? '(?)'} | ttn=${pick(obj, ['ttn', 'np_ttn', 'declaration', 'tracking']) ?? '(?)'}`)
    }
  }
  if (range) {
    const [from, to] = range.split('-')
    console.log('\n── get_orders (read-only) ─────────────────────────────────')
    console.log(`GET ${safeUrl({ method: 'get_orders', from, to })}`)
    const { httpStatus, text } = await apiGet({ method: 'get_orders', from, to })
    console.log(`HTTP ${httpStatus}`)
    console.log(`raw (first 800): ${(text || '(empty)').slice(0, 800)}`)
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
    json?.success === false ||
    json?.success === 0 ||
    json?.success === '0' ||
    json?.status === 'error'

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
  await diagOrderStatus()
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
