// Supplier order forwarding via personal.cab API.
// personal.cab uses query-param routing — do NOT use Bearer auth or REST paths.
//   POST {SUPPLIER_API_URL}?method=add_order&mode=MODE&key=KEY
//   Body: JSON with receiver/delivery/products fields.
//
// SUPPLIER_ORDER_MODE controls auto-forwarding on checkout:
//   disabled | manual | off → never auto-send (kill switch; local order still saved)
//   test                    → send with &mode=test (supplier validates/logs, NO real shipment)
//   live                    → send without test mode (REAL supplier order)
// Default is `test`. `live` is only ever used when explicitly set — this makes
// accidental production shipments impossible. The admin "send test" action always
// uses test mode regardless of this env, so it can never create a live order.

export type SupplierOrderMode = 'disabled' | 'test' | 'live'

// Resolve the configured auto-send mode. `manual`/`off`/`none` are treated as a
// `disabled` kill switch. Anything other than an explicit `live` defaults to the
// safe `test` mode.
export function getSupplierOrderMode(): SupplierOrderMode {
  const raw = (process.env.SUPPLIER_ORDER_MODE ?? '').trim().toLowerCase()
  if (raw === 'live') return 'live'
  if (raw === 'disabled' || raw === 'manual' || raw === 'off' || raw === 'none') return 'disabled'
  return 'test'
}

// Whether checkout should auto-forward supplier items to personal.cab.
export function isAutoSendEnabled(): boolean {
  return getSupplierOrderMode() !== 'disabled'
}

export interface SupplierOrderPayload {
  receiver_first_name: string
  receiver_last_name: string
  receiver_patronymic?: string
  receiver_phone: string
  method_payment: 'cashondelivery' | 'prepayment'
  location: string          // Nova Poshta warehouse internal_id
  products: Array<{ sku: string; qty: number; price: number }>
  comments?: string
}

// Loose, source-agnostic input shape for the payload builder. Strings may be
// null/empty (older orders, missing data) — the builder validates and reports
// exactly what is missing instead of silently sending a broken order.
export interface BuildPayloadInput {
  receiver_first_name?: string | null
  receiver_last_name?: string | null
  receiver_patronymic?: string | null
  receiver_phone?: string | null
  method_payment?: string | null
  location?: string | null   // Nova Poshta warehouse internal_id
  items: Array<{ supplier_sku?: string | null; quantity: number; price_uah: number }>
  comments?: string | null
}

export type BuildPayloadResult =
  | { ok: true; payload: SupplierOrderPayload }
  | { ok: false; errors: string[] }

export interface OrderResult {
  ok: boolean
  // confirmed = the API returned a real order id/number → the order is actually
  // registered in Personal.cab. ok=true + confirmed=false means HTTP 200 with no
  // explicit error but also no order id: we MUST NOT report this as a successful
  // live send (it is the exact case where orders silently never appear in the
  // supplier journal). Checkout maps this to the 'sent_unconfirmed' status.
  confirmed: boolean
  order_id?: string
  test_mode: boolean
  mode: 'test' | 'live'
  message: string
  raw_response?: Record<string, unknown>
}

const ukrainianPhone = /^(\+380|0)\d{9}$/

// Build & validate the exact add_order payload from order data + supplier line
// items. NEVER throws. Only items with a non-empty supplier_sku and positive
// qty/price are forwarded; everything else is dropped (manual items stay local).
// Returns the precise list of problems when the order cannot be safely sent.
export function buildPersonalCabOrderPayload(input: BuildPayloadInput): BuildPayloadResult {
  const errors: string[] = []

  const firstName = (input.receiver_first_name ?? '').trim()
  const lastName = (input.receiver_last_name ?? '').trim()
  const phone = (input.receiver_phone ?? '').trim()
  const location = (input.location ?? '').trim()
  const patronymic = (input.receiver_patronymic ?? '').trim()
  const comments = (input.comments ?? '').trim()
  const payment = (input.method_payment ?? '').trim()

  // Personal.cab requires Cyrillic names — Latin letters cause a hard API rejection.
  const cyrillicOnly = /^[Ѐ-ӿ\s\-'ʼ]+$/
  if (firstName.length < 1) {
    errors.push("Відсутнє ім'я отримувача (receiver_first_name)")
  } else if (!cyrillicOnly.test(firstName)) {
    errors.push("Для відправки Новою Поштою введіть імʼя та прізвище кирилицею.")
  }
  if (lastName.length < 1) {
    errors.push('Відсутнє прізвище отримувача (receiver_last_name)')
  } else if (!cyrillicOnly.test(lastName)) {
    errors.push("Для відправки Новою Поштою введіть імʼя та прізвище кирилицею.")
  }
  if (!ukrainianPhone.test(phone)) errors.push('Некоректний або відсутній телефон отримувача (receiver_phone)')
  if (location.length < 1) errors.push('Відсутнє відділення Нової Пошти (location / nova_poshta_warehouse_id)')

  // method_payment must be one of the two supported values; default to the
  // production-first cashondelivery when unset.
  const method_payment: 'cashondelivery' | 'prepayment' =
    payment === 'prepayment' ? 'prepayment' : 'cashondelivery'

  // Only items with a real SKU and positive qty/price are eligible.
  const products = input.items
    .filter((i) => {
      const sku = (i.supplier_sku ?? '').trim()
      return sku.length > 0 && i.quantity > 0 && i.price_uah > 0
    })
    .map((i) => ({ sku: (i.supplier_sku as string).trim(), qty: i.quantity, price: i.price_uah }))

  if (products.length === 0) {
    errors.push('Немає товарів постачальника з SKU та коректною ціною/кількістю для відправлення')
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    payload: {
      receiver_first_name: firstName,
      receiver_last_name: lastName,
      ...(patronymic ? { receiver_patronymic: patronymic } : {}),
      receiver_phone: phone,
      method_payment,
      location,
      products,
      ...(comments ? { comments } : {}),
    },
  }
}

// Send a pre-built payload to personal.cab with an EXPLICIT mode. Never throws.
// Used by both the checkout auto-send path and the admin test action.
export async function sendPersonalCabOrder(
  payload: SupplierOrderPayload,
  opts: { mode: 'test' | 'live' },
): Promise<OrderResult> {
  const mode = opts.mode

  const apiUrl = process.env.SUPPLIER_API_URL
  const apiKey = process.env.SUPPLIER_API_KEY
  if (!apiUrl || !apiKey) {
    return {
      ok: false,
      confirmed: false,
      test_mode: mode === 'test',
      mode,
      message: 'SUPPLIER_API_URL та SUPPLIER_API_KEY не налаштовані',
    }
  }

  const base = apiUrl.replace(/\/$/, '')
  // Query-param routing. Test mode passes &mode=test so the supplier validates
  // and logs without shipping; live mode omits it for a REAL order.
  const qp: Record<string, string> = { key: apiKey, method: 'add_order' }
  if (mode === 'test') qp.mode = 'test'
  const params = new URLSearchParams(qp)
  const url = `${base}?${params}`

  // Personal.cab expects the phone WITHOUT a leading '+': 380XXXXXXXXX, not
  // +380XXXXXXXXX. Sending the '+' is a prime suspect for orders silently never
  // landing in the supplier journal, so strip it here at the boundary.
  const supplierPhone = payload.receiver_phone.replace(/^\+/, '')

  // Build the exact field shape the supplier expects.
  const body = {
    receiver_first_name: payload.receiver_first_name,
    receiver_last_name: payload.receiver_last_name,
    ...(payload.receiver_patronymic ? { receiver_patronymic: payload.receiver_patronymic } : {}),
    receiver_phone: supplierPhone,
    method_payment: payload.method_payment,
    location: payload.location,
    products: payload.products,
    ...(payload.comments ? { comments: payload.comments } : {}),
  }

  console.info(
    `[supplier] add_order — mode=${mode} phone=${supplierPhone} products=${body.products.length} location=${body.location}`,
  )

  // Serialize once so we can compute Content-Length. Without an explicit
  // Content-Length some servers (including Personal.cab) do not parse the JSON
  // body, returning "Variable X is required" for every field.
  const bodyStr = JSON.stringify(body)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Length': String(Buffer.byteLength(bodyStr)),
      },
      body: bodyStr,
      cache: 'no-store',
    })

    // Read the body as text first so we can diagnose empty/non-JSON responses —
    // the exact situations where we were wrongly reporting success.
    const text = await res.text()
    let raw: Record<string, unknown>
    try {
      raw = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      raw = { _raw_text: text }
    }
    console.info(`[supplier] response — http=${res.status} body=${(text || '(empty)').slice(0, 500)}`)

    if (!res.ok) {
      return {
        ok: false,
        confirmed: false,
        test_mode: mode === 'test',
        mode,
        message: `API помилка HTTP ${res.status}: ${JSON.stringify(raw)}`,
        raw_response: raw,
      }
    }

    // confirmed = a real order id/number is present. This is the ONLY positive
    // proof the order was registered. Empty JSON, empty text, or HTTP 200 with no
    // id do NOT count as confirmed.
    const orderId = String(raw.order_id ?? raw.id ?? raw.number ?? '').trim()
    const confirmed = orderId.length > 0

    // ok=true only when the API did not return an explicit error. Do NOT use
    // `raw.error == null` as positive proof — undefined == null is true, so an
    // empty response would look like success. We invert: error only if a non-empty
    // error string (or truthy error/success===false) is present.
    // Personal.cab returns success:0 (integer) for application-level errors, not
    // success:false. Treat 0 and '0' explicitly — do NOT rely on truthiness.
    const hasExplicitError =
      (typeof raw.error === 'string' && raw.error.length > 0) ||
      (raw.error != null && raw.error !== false && typeof raw.error !== 'string') ||
      raw.success === false ||
      raw.success === 0 ||
      raw.success === '0' ||
      raw.status === 'error'
    const ok = !hasExplicitError

    let message: string
    if (!ok) {
      message = `Помилка від постачальника: ${JSON.stringify(raw)}`
    } else if (confirmed) {
      message = mode === 'test'
        ? `Тестове замовлення прийнято (mode=test, id=${orderId})`
        : `Замовлення передано постачальнику (id=${orderId})`
    } else {
      // HTTP 200, no explicit error, but no order id either.
      message = mode === 'test'
        ? 'Тест: HTTP 200, order_id відсутній (очікувано для test-mode)'
        : `HTTP 200 без order_id — НЕ підтверджено. Перевірте журнал Personal.cab. Відповідь: ${JSON.stringify(raw)}`
    }

    return {
      ok,
      confirmed,
      test_mode: mode === 'test',
      mode,
      order_id: orderId || undefined,
      message,
      raw_response: raw,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[supplier] add_order exception — ${msg}`)
    return { ok: false, confirmed: false, test_mode: mode === 'test', mode, message: msg }
  }
}

// Backward-compatible auto-send entry point used by checkout. Honours the global
// SUPPLIER_ORDER_MODE: returns a non-sent result (without touching the API) when
// the kill switch is on; otherwise forwards in the configured test/live mode.
export async function submitOrder(payload: SupplierOrderPayload): Promise<OrderResult> {
  const mode = getSupplierOrderMode()
  if (mode === 'disabled') {
    return {
      ok: false,
      confirmed: false,
      test_mode: false,
      mode: 'test',
      message: 'Авто-відправлення постачальнику вимкнено (SUPPLIER_ORDER_MODE=disabled)',
    }
  }
  return sendPersonalCabOrder(payload, { mode })
}
