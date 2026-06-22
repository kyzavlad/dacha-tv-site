export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'

// Direct Personal.cab add_order diagnostic — bypasses checkout, n8n, Supabase,
// and all frontend form logic. Lets us verify that Vercel production env vars
// can create an order in isolation.
//
// Protected by CRON_SECRET (same as all other admin API routes).
// POST-only. Accepts { "mode": "live", "confirmLive": "CREATE_REAL_SUPPLIER_ORDER" }
// to send a real order; defaults to test mode (safe).
//
// Usage (production):
//   curl -s -X POST \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -H "Content-Type: application/json" \
//     -d '{}' \
//     https://<site>/api/admin/diag/supplier-order-direct
//
//   # Live (creates a real order — use only when ready):
//   curl -s -X POST \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -H "Content-Type: application/json" \
//     -d '{"mode":"live","confirmLive":"CREATE_REAL_SUPPLIER_ORDER"}' \
//     https://<site>/api/admin/diag/supplier-order-direct

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  // ── Parse request body ────────────────────────────────────────────────────
  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text) as Record<string, unknown>
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const isLiveRequest =
    body.mode === 'live' && body.confirmLive === 'CREATE_REAL_SUPPLIER_ORDER'
  const testMode = !isLiveRequest

  // ── Env inspection (booleans only — never log the actual key) ─────────────
  const apiUrl = process.env.SUPPLIER_API_URL ?? ''
  const apiKey = process.env.SUPPLIER_API_KEY ?? ''
  const hasApiUrl = apiUrl.length > 0
  const hasApiKey = apiKey.length > 0
  const keyLength = apiKey.length

  console.info(
    `[supplier-direct-diag] env — hasApiUrl=${hasApiUrl} hasApiKey=${hasApiKey} keyLength=${keyLength}`,
  )

  if (!hasApiUrl || !hasApiKey) {
    return Response.json({
      ok: false,
      error: 'SUPPLIER_API_URL or SUPPLIER_API_KEY not configured in this environment',
      env: { hasApiUrl, hasApiKey, keyLength },
    }, { status: 503 })
  }

  const base = apiUrl.replace(/\/$/, '')

  // ── Build add_order URL — no type=json (breaks Personal.cab body parsing) ──
  const qp = new URLSearchParams({ key: apiKey, method: 'add_order' })
  if (testMode) qp.set('mode', 'test')
  const url = `${base}?${qp}`

  // Redacted URL for logging (key replaced with ***)
  const qpSafe = new URLSearchParams({ key: '***', method: 'add_order' })
  if (testMode) qpSafe.set('mode', 'test')
  const urlSafe = `${base}?${qpSafe}`

  // ── Hardcoded diagnostic order payload ────────────────────────────────────
  const timestamp = new Date().toISOString()
  const orderBody = {
    receiver_first_name: 'Влад',
    receiver_last_name: 'Кузьменко',
    receiver_phone: '380951444853',
    method_payment: 'cashondelivery',
    location: '1AE7D725-103E-11E5-ADD9-005056887B8D',
    products: [{ sku: 'N-1171', qty: 1, price: 69 }],
    comments: `DIRECT RUNTIME DIAG dachatv.com ${timestamp}`,
  }

  const bodyStr = JSON.stringify(orderBody)
  const contentLength = Buffer.byteLength(bodyStr)

  console.info(
    `[supplier-direct-diag] request — url=${urlSafe} test_mode=${testMode} live_mode=${isLiveRequest}` +
    ` first=${orderBody.receiver_first_name} last=${orderBody.receiver_last_name}` +
    ` phone=${orderBody.receiver_phone} location=${orderBody.location}` +
    ` products=${JSON.stringify(orderBody.products)} content_length=${contentLength}`,
  )

  // ── Send ─────────────────────────────────────────────────────────────────
  let httpStatus: number
  let rawText: string
  let parsedResponse: Record<string, unknown> | null = null

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Length': String(contentLength),
      },
      body: bodyStr,
      cache: 'no-store',
    })

    httpStatus = res.status
    rawText = await res.text()

    try {
      parsedResponse = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null
    } catch {
      parsedResponse = null
    }

    console.info(
      `[supplier-direct-diag] response — http=${httpStatus} body=${rawText.slice(0, 500) || '(empty)'}`,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[supplier-direct-diag] fetch exception — ${msg}`)
    return Response.json({
      ok: false,
      test_mode: testMode,
      live_mode: isLiveRequest,
      interpreted_status: 'request_failed',
      error: msg,
      env: { hasApiUrl, hasApiKey, keyLength },
    }, { status: 502 })
  }

  // ── Interpret response — mirrors sendPersonalCabOrder logic ──────────────
  const r = parsedResponse
  const httpOk = httpStatus >= 200 && httpStatus < 300
  const hasExplicitError =
    (typeof r?.error === 'string' && (r.error as string).length > 0) ||
    (r?.error != null && r?.error !== false && typeof r?.error !== 'string') ||
    r?.success === false ||
    r?.success === 0 ||
    r?.success === '0' ||
    r?.status === 'error'

  const orderId = r
    ? String(r.order_id ?? r.id ?? r.number ?? '').trim()
    : ''
  const confirmed = orderId.length > 0

  let interpretedStatus: 'accepted' | 'rejected' | 'unconfirmed' | 'request_failed'
  if (!httpOk || hasExplicitError) {
    interpretedStatus = 'rejected'
  } else if (confirmed) {
    interpretedStatus = 'accepted'
  } else {
    interpretedStatus = 'unconfirmed'
  }

  return Response.json({
    ok: httpOk && !hasExplicitError,
    test_mode: testMode,
    live_mode: isLiveRequest,
    interpreted_status: interpretedStatus,
    order_id: orderId || null,
    http_status: httpStatus,
    raw_response: rawText,
    parsed_response: parsedResponse,
    env: { hasApiUrl, hasApiKey, keyLength },
    request_summary: {
      url: urlSafe,
      content_length: contentLength,
      payload_fields: Object.keys(orderBody),
      products: orderBody.products,
    },
  })
}

// Reject everything except POST.
export async function GET() {
  return Response.json({ error: 'POST only' }, { status: 405 })
}
