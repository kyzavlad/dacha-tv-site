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

// ─── Test / internal order guard ──────────────────────────────────────────────
// Even with SUPPLIER_ORDER_MODE=live, an order whose customer name / phone /
// delivery text / comment marks it as a test or "do not send" order must NEVER be
// forwarded to the supplier. The site order + notifications are still created; only
// the supplier API call is suppressed. The guard is always on — there is no env
// flag to turn it off, so a real test can never leak to the supplier.
const TEST_ORDER_MARKERS = [
  'тест',            // covers тест / тестове / тестовий / тестовый
  'test',            // covers test / testing
  'не відправляти',
  'не відправляйте',
  'не надсилати',
  'не надсилайте',
  'не отправлять',
  'не отправляйте',
  "don't send",
  'dont send',
  'do not send',
]

// Returns the marker that flagged the order as test/internal, or null. Matching is
// case-insensitive substring across every provided field.
export function detectTestOrderMarker(fields: Array<string | null | undefined>): string | null {
  const hay = fields.map((f) => (f ?? '').toString().toLowerCase()).join('  ¶  ')
  for (const m of TEST_ORDER_MARKERS) if (hay.includes(m)) return m
  return null
}

// True when the test-order guard is active (it always is — no env toggle).
export const TEST_ORDER_GUARD_ENABLED = true

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
  const endpoint = `${base}/`
  // Query-param routing. Test mode passes &mode=test so the supplier validates
  // and logs without shipping; live mode omits it for a REAL order.
  const qp: Record<string, string> = { key: apiKey, method: 'add_order' }
  if (mode === 'test') qp.mode = 'test'
  const params = new URLSearchParams(qp)
  const url = `${endpoint}?${params}`

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

// ─────────────────────────────────────────────────────────────────────────────
// Order LIFECYCLE (read-only status lookups)
//
// add_order only tells us whether Personal.cab ACCEPTED the order at submit time.
// It says nothing about what happens afterwards — the supplier can later mark an
// accepted order "Не выполнен" (not fulfilled), cancel it, or attach a TTN. To
// react to that we poll the supplier with read methods:
//   get_order_details — GET ?key=KEY&method=get_order_details&id=ORDERID
//   get_orders        — GET ?key=KEY&method=get_orders&from=YYYYMMDD&to=YYYYMMDD
//
// These are READ-only and create nothing. Unlike add_order (whose POST body is
// broken by type=json), the GET read methods expect type=json and return JSON.
// Both helpers NEVER throw — supplier failures must never reach the checkout UI.
// ─────────────────────────────────────────────────────────────────────────────

// Normalized lifecycle status, derived from the supplier's free-text status so
// callers can branch without re-implementing string matching everywhere.
export type NormalizedSupplierStatus =
  | 'fulfilled'      // Выполнен / Виконано / completed / done
  | 'processing'     // Новый / В обработке / new / pending
  | 'shipped'        // Отправлен / has a TTN
  | 'cancelled'      // Отменен / Скасовано / canceled
  | 'not_fulfilled'  // Не выполнен — the exact problem state we are chasing
  | 'unknown'        // anything we cannot confidently classify

// A supplier line that the supplier removed from the order (the real cause of
// "Не выполнен"): the order is accepted but one or more products are dropped.
export interface SupplierProblemLine {
  sku?: string
  name?: string
  name_ua?: string
  qty?: string
  price?: string
  sum?: string
  reason: string   // 'deleted_by_supplier'
}

// Normalized view of a single supplier order, plus the raw supplier object so
// the admin/diag can always inspect the untouched response.
export interface SupplierOrderInfo {
  order_id?: string        // Номер / order_id  e.g. "MC-26-036210"
  internal_id?: string     // Ссылка (list) / Start_Order.id  e.g. "771234"
  raw_status?: string      // Статус
  tracker_status?: string  // СтатусТреккера
  status: NormalizedSupplierStatus
  ttn?: string
  payment?: string
  delivery?: string
  recipient?: string
  phone?: string
  total?: string
  problem_lines?: SupplierProblemLine[]
  raw: Record<string, unknown>
}

// Result wrapper for a lifecycle lookup. ok=false means the request itself
// failed (network/HTTP/parse) — NOT that the order is in a bad state.
export interface SupplierStatusResult {
  ok: boolean
  found: boolean
  message: string
  orders: SupplierOrderInfo[]
  http_status?: number
  raw_response?: unknown
}

// Map a supplier free-text status (ru/uk/en) to a normalized lifecycle value.
export function normalizeSupplierStatus(raw: string | null | undefined): NormalizedSupplierStatus {
  const s = (raw ?? '').toString().trim().toLowerCase()
  if (!s) return 'unknown'
  // "Не выполнен" / "не виконано" — check the negative BEFORE the positive so
  // "выполнен" inside "не выполнен" does not get mis-read as fulfilled.
  if (/(^|[^а-яіїєґ])не\s*вы?полнен|не\s*викона|not\s*fulfil/.test(s)) return 'not_fulfilled'
  if (/отмен|скасов|cancel|відмін/.test(s)) return 'cancelled'
  if (/выполнен|викона|complete|done|fulfil|готов/.test(s)) return 'fulfilled'
  if (/отправл|відправл|ship|відвантаж/.test(s)) return 'shipped'
  if (/нов|обработ|оброб|комплект|pending|process|очік|prinят|прийн/.test(s)) return 'processing'
  return 'unknown'
}

// Combine the supplier status, tracker status and deleted lines into one
// normalized lifecycle status. Priority: an explicit cancellation wins; then a
// deleted product line means the order cannot be fulfilled as placed; then the
// main status; finally the tracker status as a last resort.
function interpretLifecycle(
  rawStatus: string | undefined,
  trackerStatus: string | undefined,
  problemLines: SupplierProblemLine[] | undefined,
): NormalizedSupplierStatus {
  const base = normalizeSupplierStatus(rawStatus)
  if (base === 'cancelled') return 'cancelled'
  if (problemLines && problemLines.length > 0) return 'not_fulfilled'
  if (base !== 'unknown') return base
  return normalizeSupplierStatus(trackerStatus)
}

// Pull the first present, non-empty value across a list of candidate keys
// (case-insensitive — works for Cyrillic too). Supplier responses mix Russian,
// Latin and English field names depending on the method.
function pickField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  const lowerMap = new Map<string, unknown>()
  for (const k of Object.keys(obj)) lowerMap.set(k.toLowerCase(), obj[k])
  for (const key of keys) {
    const v = lowerMap.get(key.toLowerCase())
    if (v != null && v !== '' && typeof v !== 'object') return String(v)
  }
  return undefined
}

// Case-insensitive single-key lookup that returns the raw value (objects too).
function getKeyCI(obj: Record<string, unknown>, name: string): unknown {
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === name.toLowerCase()) return obj[k]
  }
  return undefined
}

// Normalize one raw supplier order object (list item OR Start_Order) into
// SupplierOrderInfo. Candidate keys cover both the Russian get_orders list
// shape and the Latin get_order_details Start_Order shape.
function toSupplierOrderInfo(
  raw: Record<string, unknown>,
  opts?: { problemLines?: SupplierProblemLine[] },
): SupplierOrderInfo {
  const order_id = pickField(raw, ['order_id', 'Номер', 'number', 'order_number', 'orderid'])
  const internal_id = pickField(raw, ['Ссылка', 'id', 'order_ref', 'ref'])
  const raw_status = pickField(raw, ['Статус', 'status', 'state', 'order_status', 'status_name'])
  const tracker_status = pickField(raw, ['СтатусТреккера', 'tracker_status', 'tracking_status'])
  const ttn = pickField(raw, ['ТТН', 'ttn', 'np_ttn', 'declaration', 'tracking', 'tracking_number'])
  const payment = pickField(raw, ['МетодОплаты', 'method_payment', 'payment', 'payment_method', 'pay'])
  const delivery = pickField(raw, ['delivery', 'location', 'Доставка', 'warehouse', 'np_warehouse', 'address'])
  const recipient = pickField(raw, ['Получатель', 'receiver', 'recipient', 'customer', 'receiver_name'])
  const phone = pickField(raw, ['ТелефонПолучателя', 'phone', 'receiver_phone', 'Телефон'])
  const total = pickField(raw, ['СуммаЗаказа', 'total', 'sum', 'amount', 'total_price', 'price'])
  const problem_lines = opts?.problemLines && opts.problemLines.length > 0 ? opts.problemLines : undefined
  return {
    order_id,
    internal_id,
    raw_status,
    tracker_status,
    status: interpretLifecycle(raw_status, tracker_status, problem_lines),
    ttn,
    payment,
    delivery,
    recipient,
    phone,
    total,
    problem_lines,
    raw,
  }
}

// Extract deleted product lines from a Transcript_Order block. These are the
// lines the supplier removed (article "B-391" in the MC-26-036210 example).
function extractProblemLines(transcript: Record<string, unknown>): SupplierProblemLine[] {
  const del = getKeyCI(transcript, 'delete')
  if (!del || typeof del !== 'object') return []
  const lines = getKeyCI(del as Record<string, unknown>, 'line_delete')
  const arr = Array.isArray(lines)
    ? lines
    : lines && typeof lines === 'object'
      ? [lines]
      : []
  return arr
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l) => ({
      sku: pickField(l, ['article', 'sku', 'vendor_code', 'code']),
      name: pickField(l, ['product_name', 'name', 'title']),
      name_ua: pickField(l, ['product_name_ua', 'name_ua']),
      qty: pickField(l, ['qty', 'quantity', 'count']),
      price: pickField(l, ['price']),
      sum: pickField(l, ['sum', 'total']),
      reason: 'deleted_by_supplier',
    }))
}

// Shared GET helper for read methods. Includes type=json (correct for reads).
// Never throws — returns a structured failure instead.
async function supplierApiGet(
  params: Record<string, string>,
): Promise<{ ok: boolean; httpStatus?: number; parsed: unknown; text: string; error?: string }> {
  const apiUrl = process.env.SUPPLIER_API_URL
  const apiKey = process.env.SUPPLIER_API_KEY
  if (!apiUrl || !apiKey) {
    return { ok: false, parsed: null, text: '', error: 'SUPPLIER_API_URL та SUPPLIER_API_KEY не налаштовані' }
  }
  const base = apiUrl.replace(/\/$/, '')
  const endpoint = `${base}/`
  const qp = new URLSearchParams({ key: apiKey, type: 'json', ...params })
  const url = `${endpoint}?${qp}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    const text = await res.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = { _raw_text: text }
    }
    return { ok: res.ok, httpStatus: res.status, parsed, text }
  } catch (e) {
    return { ok: false, parsed: null, text: '', error: e instanceof Error ? e.message : String(e) }
  }
}

// Extract an array of order-like objects from an arbitrary supplier LIST
// response (get_orders). Handles arrays, nested arrays, and a single object.
function extractOrderList(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    for (const key of ['orders', 'data', 'result', 'items', 'order', 'Заказы']) {
      const v = getKeyCI(obj, key)
      if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
      if (v && typeof v === 'object') return [v as Record<string, unknown>]
    }
    // A single order object returned at the top level (has an id-ish field).
    if (pickField(obj, ['order_id', 'Номер', 'id', 'Ссылка', 'number', 'status', 'Статус'])) return [obj]
  }
  return []
}

// Look up ONE order by its Personal.cab id. Read-only. Never throws.
// get_order_details returns a { Start_Order, Transcript_Order } envelope — the
// presence of Start_Order means the order EXISTS. Deleted lines inside
// Transcript_Order.delete.line_delete are surfaced as problem_lines.
export async function getPersonalCabOrderDetails(id: string): Promise<SupplierStatusResult> {
  const orderId = (id ?? '').toString().trim()
  if (!orderId) {
    return { ok: false, found: false, message: 'Не вказано id замовлення', orders: [] }
  }
  const { ok, httpStatus, parsed, error } = await supplierApiGet({ method: 'get_order_details', id: orderId })
  if (!ok) {
    return {
      ok: false,
      found: false,
      message: error ?? `HTTP ${httpStatus ?? '?'} від постачальника`,
      orders: [],
      http_status: httpStatus,
      raw_response: parsed,
    }
  }

  const obj =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null

  // ── Start_Order / Transcript_Order envelope ───────────────────────────────
  const startOrder = obj ? getKeyCI(obj, 'Start_Order') : undefined
  if (startOrder && typeof startOrder === 'object') {
    const transcript = obj ? getKeyCI(obj, 'Transcript_Order') : undefined
    const problemLines =
      transcript && typeof transcript === 'object'
        ? extractProblemLines(transcript as Record<string, unknown>)
        : []
    // Merge in Transcript_Order.order_info (if an object) so a status carried
    // there is picked up; Start_Order fields still take precedence.
    const orderInfo =
      transcript && typeof transcript === 'object'
        ? getKeyCI(transcript as Record<string, unknown>, 'order_info')
        : undefined
    const mergedRaw: Record<string, unknown> = {
      ...(orderInfo && typeof orderInfo === 'object' && !Array.isArray(orderInfo)
        ? (orderInfo as Record<string, unknown>)
        : {}),
      ...(startOrder as Record<string, unknown>),
    }
    const info = toSupplierOrderInfo(mergedRaw, { problemLines })
    const problemNote = problemLines.length > 0
      ? ` — видалено рядків: ${problemLines.length} (${problemLines.map((l) => l.sku ?? '?').join(', ')})`
      : ''
    return {
      ok: true,
      found: true,
      message: `Знайдено замовлення ${info.order_id ?? orderId}: ${info.raw_status ?? info.status}${problemNote}`,
      orders: [info],
      http_status: httpStatus,
      raw_response: parsed,
    }
  }

  // ── Fallback: flat / list-shaped detail responses ─────────────────────────
  const list = extractOrderList(parsed).map((o) => toSupplierOrderInfo(o))
  return {
    ok: true,
    found: list.length > 0,
    message: list.length > 0
      ? `Знайдено замовлення ${orderId}: ${list[0].raw_status ?? list[0].status}`
      : `Замовлення ${orderId} не знайдено у відповіді постачальника`,
    orders: list,
    http_status: httpStatus,
    raw_response: parsed,
  }
}

// List orders in a date range (YYYYMMDD). Read-only. Never throws. Normalizes
// the Russian-keyed get_orders list items (Номер, Статус, ТТН, …).
export async function getPersonalCabOrders(from: string, to: string): Promise<SupplierStatusResult> {
  const f = (from ?? '').toString().trim()
  const t = (to ?? '').toString().trim()
  const ymd = /^\d{8}$/
  if (!ymd.test(f) || !ymd.test(t)) {
    return { ok: false, found: false, message: 'from/to мають бути у форматі YYYYMMDD', orders: [] }
  }
  const { ok, httpStatus, parsed, error } = await supplierApiGet({ method: 'get_orders', from: f, to: t })
  if (!ok) {
    return {
      ok: false,
      found: false,
      message: error ?? `HTTP ${httpStatus ?? '?'} від постачальника`,
      orders: [],
      http_status: httpStatus,
      raw_response: parsed,
    }
  }
  const list = extractOrderList(parsed).map((o) => toSupplierOrderInfo(o))
  return {
    ok: true,
    found: list.length > 0,
    message: `Отримано ${list.length} замовлень за період ${f}–${t}`,
    orders: list,
    http_status: httpStatus,
    raw_response: parsed,
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
