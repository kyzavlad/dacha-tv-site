// Supplier order forwarding via personal.cab API.
// personal.cab uses query-param routing — do NOT use Bearer auth or REST paths.
//   POST {SUPPLIER_API_URL}?method=add_order&mode=MODE&key=KEY
//   Body: JSON with receiver/delivery/products fields.
//
// Mode rule: ALWAYS test unless SUPPLIER_ORDER_MODE=live is explicitly set.
// In test mode we DO call the real API with mode=test (per supplier docs) — the
// supplier validates and logs the order but does NOT create a real shipment.
// This lets us verify the full end-to-end flow safely. Live orders are impossible
// unless the env flag is flipped.

const ORDER_MODE: 'test' | 'live' = process.env.SUPPLIER_ORDER_MODE === 'live' ? 'live' : 'test'

export interface CheckoutItem {
  supplier_sku: string
  quantity: number
  price_uah: number
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

export interface OrderResult {
  ok: boolean
  order_id?: string
  test_mode: boolean
  mode: 'test' | 'live'
  message: string
  raw_response?: Record<string, unknown>
}

export async function submitOrder(payload: SupplierOrderPayload): Promise<OrderResult> {
  const mode = ORDER_MODE

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
