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

  if (firstName.length < 1) errors.push("Відсутнє ім'я отримувача (receiver_first_name)")
  if (lastName.length < 1) errors.push('Відсутнє прізвище отримувача (receiver_last_name)')
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
      test_mode: mode === 'test',
      mode,
      message: 'SUPPLIER_API_URL та SUPPLIER_API_KEY не налаштовані',
    }
  }

  const base = apiUrl.replace(/\/$/, '')
  const params = new URLSearchParams({ key: apiKey, method: 'add_order', mode, type: 'json' })
  const url = `${base}?${params}`

  // Build the exact field shape the supplier expects.
  const body = {
    receiver_first_name: payload.receiver_first_name,
    receiver_last_name: payload.receiver_last_name,
    ...(payload.receiver_patronymic ? { receiver_patronymic: payload.receiver_patronymic } : {}),
    receiver_phone: payload.receiver_phone,
    method_payment: payload.method_payment,
    location: payload.location,
    products: payload.products,
    ...(payload.comments ? { comments: payload.comments } : {}),
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    const raw = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as Record<string, unknown>

    if (!res.ok) {
      return { ok: false, test_mode: mode === 'test', mode, message: `API помилка: ${res.status}`, raw_response: raw }
    }

    const orderId = String(raw.order_id ?? raw.id ?? raw.number ?? '')
    const ok = !!orderId || raw.status === 'ok' || raw.success === true || raw.error == null

    return {
      ok,
      test_mode: mode === 'test',
      mode,
      order_id: orderId || undefined,
      message: ok
        ? (mode === 'test' ? 'Тестове замовлення прийнято постачальником (mode=test)' : 'Замовлення передано постачальнику')
        : `Невідома відповідь: ${JSON.stringify(raw)}`,
      raw_response: raw,
    }
  } catch (e) {
    return { ok: false, test_mode: mode === 'test', mode, message: e instanceof Error ? e.message : String(e) }
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
      test_mode: false,
      mode: 'test',
      message: 'Авто-відправлення постачальнику вимкнено (SUPPLIER_ORDER_MODE=disabled)',
    }
  }
  return sendPersonalCabOrder(payload, { mode })
}
