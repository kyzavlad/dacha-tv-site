'use server'

import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  buildPersonalCabOrderPayload,
  sendPersonalCabOrder,
  getSupplierOrderMode,
} from '@/lib/supplier/order'
import { normalizeUkrainianPhone, isValidUkrainianPhone } from '@/lib/utils'

const orderItemSchema = z.object({
  id: z.string(),
  productType: z.enum(['catalog', 'apiary', 'flower', 'honey', 'custom']),
  productSlug: z.string().min(1),
  name: z.string().min(1),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
  imageUrl: z.string().optional(),
  variant: z.string().optional(),
})

const submitOrderSchema = z.object({
  firstName: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  lastName: z.string().min(2, 'Прізвище має містити щонайменше 2 символи'),
  patronymic: z.string().optional(),
  // Validate then normalise to canonical +380XXXXXXXXX so both the saved order
  // and the supplier payload always receive a clean phone number.
  phone: z
    .string()
    .refine(isValidUkrainianPhone, 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)')
    .transform((v) => normalizeUkrainianPhone(v)!),
  methodPayment: z.enum(['cashondelivery', 'prepayment']),
  warehouseId: z.string().min(1, 'Оберіть відділення Нової Пошти'),
  warehouseName: z.string().optional(),
  comment: z.string().max(500).optional(),
  items: z.array(orderItemSchema).min(1, 'Кошик порожній'),
  source: z.string().optional(),
})

type ActionResult =
  | { success: true; orderId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

// Short, non-secret correlation id so a single checkout attempt can be traced
// across all of its log lines in production.
function newTraceId(): string {
  return Math.random().toString(36).slice(2, 8)
}

// User-facing fallback. Kept generic on purpose; the precise cause is logged
// server-side under the [checkout-submit] prefix, never leaked to the customer.
const FRIENDLY_ERROR = 'Не вдалося оформити замовлення. Спробуйте ще раз.'

// Fail-safe product-order notification. Sends BOTH channels independently:
//   • direct Telegram — whenever TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set
//   • webhook / n8n   — whenever WEBHOOK_URL is set
// There is deliberately NO "webhook OR Telegram" gating — that gating was the
// cause of silently-lost order notifications. Each channel is awaited (so the
// request actually completes in a serverless environment instead of being killed
// when the action returns) but a failure in either channel can NEVER throw or
// block checkout: every error is caught and logged loudly, never rethrown.
async function notifyProductOrder(opts: {
  trace: string
  message: string
  payload: Record<string, unknown>
}): Promise<void> {
  const { trace, message, payload } = opts
  const tasks: Promise<void>[] = []

  // ── Channel 1: direct Telegram (plain text, no parse_mode) ──────────────────
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (token && chatId) {
    console.info(`[checkout-submit ${trace}] direct telegram queued`)
    tasks.push(
      (async () => {
        try {
          const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message }),
          })
          if (res.ok) {
            console.info(`[checkout-submit ${trace}] direct telegram sent`)
          } else {
            const body = await res.text().catch(() => '')
            console.error(`[checkout-submit ${trace}] direct telegram failed — HTTP ${res.status} ${body.slice(0, 300)}`)
          }
        } catch (e: unknown) {
          console.error(`[checkout-submit ${trace}] direct telegram failed — ${e instanceof Error ? e.message : String(e)}`)
        }
      })(),
    )
  } else {
    console.info(`[checkout-submit ${trace}] direct telegram skipped — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set`)
  }

  // ── Channel 2: webhook / n8n ────────────────────────────────────────────────
  const webhookUrl = process.env.WEBHOOK_URL
  if (webhookUrl) {
    console.info(`[checkout-submit ${trace}] webhook queued`)
    tasks.push(
      (async () => {
        try {
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'website',
              ...payload,
              message,
              created_at: new Date().toISOString(),
            }),
          })
          if (!res.ok) {
            console.error(`[checkout-submit ${trace}] webhook failed — HTTP ${res.status}`)
          }
        } catch (e: unknown) {
          console.error(`[checkout-submit ${trace}] webhook failed — ${e instanceof Error ? e.message : String(e)}`)
        }
      })(),
    )
  } else {
    console.info(`[checkout-submit ${trace}] webhook skipped — WEBHOOK_URL not set`)
  }

  // Promise.allSettled never rejects — checkout success is fully decoupled from
  // notification delivery, but we still wait so the requests are not abandoned.
  await Promise.allSettled(tasks)
}

// Map a supplier mode+status to the customer-service notification line. The icon
// reflects the REAL outcome:
//   ✅ sent / test_sent       → forwarded (confirmed or test)
//   ⚠️ sent_unconfirmed       → HTTP 200 but no order_id; needs manual check
//   ❌ failed/not_sent/etc.   → not forwarded at all
// Returns null when there is nothing to forward (skipped).
function supplierNotifyLine(mode: string, status: string, orderId?: string | null): string | null {
  if (mode === 'skipped' || status === 'skipped') return null
  const idPart = orderId ? ` #${orderId}` : ''
  if (status === 'sent') {
    return `✅ Постачальнику відправлено${idPart}`
  }
  if (status === 'test_sent') {
    return `🧪 Тест-відправлення постачальнику прийнято${idPart}`
  }
  if (status === 'sent_unconfirmed') {
    return `⚠️ Постачальник прийняв без номера — перевірити вручну`
  }
  return `❌ Не відправлено постачальнику (статус: ${status}). Потребує ручної обробки.`
}

// True for statuses whose raw API response/error is worth attaching to the
// webhook payload for diagnosis (failed = hard error, sent_unconfirmed = no id).
function supplierNeedsDiagnostics(status: string): boolean {
  return status === 'failed' || status === 'sent_unconfirmed'
}

export async function submitProductOrder(
  rawItems: unknown[],
  formData: FormData
): Promise<ActionResult> {
  const trace = newTraceId()
  const itemCount = Array.isArray(rawItems) ? rawItems.length : 0
  console.info(`[checkout-submit ${trace}] start — items=${itemCount}`)

  const raw = {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    patronymic: formData.get('patronymic') ?? undefined,
    phone: formData.get('phone'),
    methodPayment: formData.get('methodPayment'),
    warehouseId: formData.get('warehouseId'),
    warehouseName: formData.get('warehouseName') ?? undefined,
    comment: formData.get('comment') ?? undefined,
    items: rawItems,
    source: formData.get('source') ?? undefined,
  }

  // ── Step 1: validation ──────────────────────────────────────────────────────
  const parsed = submitOrderSchema.safeParse(raw)
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>
    const fieldErrors: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(flat)) fieldErrors[k] = v ?? []
    console.error(`[checkout-submit ${trace}] validation failed — fields: ${Object.keys(fieldErrors).join(', ') || '(none)'}`)
    return { success: false, error: 'Перевірте правильність введених даних', fieldErrors }
  }

  const d = parsed.data
  const customerName = `${d.lastName} ${d.firstName}${d.patronymic ? ` ${d.patronymic}` : ''}`
  const totalUah = d.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  // d.phone is already normalised to +380XXXXXXXXX by the Zod transform above.
  console.info(
    `[checkout-submit ${trace}] validated — payment=${d.methodPayment} warehouse=${d.warehouseId} total=${totalUah} phone=${d.phone}`,
  )

  try {
    // getAdminClient() throws when Supabase env vars are missing. Keep it inside
    // the try so the failure is logged and surfaced as a friendly error rather
    // than an unhandled server-action rejection.
    const client = getAdminClient()

    // ── Step 2: supplier SKU lookup (decides which items are forwarded) ────────
    const catalogSlugs = d.items
      .filter((i) => i.productType === 'catalog')
      .map((i) => i.productSlug)

    const slugToSku: Map<string, string> = new Map()
    if (catalogSlugs.length > 0) {
      const { data: skuRows, error: skuError } = await client
        .from('catalog_products')
        .select('slug, supplier_sku')
        .in('slug', catalogSlugs)
      if (skuError) {
        // Non-fatal: without SKUs we simply treat the items as manual.
        console.error(`[checkout-submit ${trace}] supplier SKU lookup failed (non-fatal): ${skuError.message}`)
      }
      for (const row of skuRows ?? []) {
        if (row.supplier_sku) slugToSku.set(row.slug as string, row.supplier_sku as string)
      }
    }

    // Supplier line items = catalog items with a known supplier SKU. Everything
    // else (catalog items without a SKU, honey/apiary/flower/custom) is a manual
    // item handled locally — it is NEVER forwarded to the supplier.
    const supplierLineItems = d.items
      .filter((i) => i.productType === 'catalog' && slugToSku.has(i.productSlug))
      .map((i) => ({ supplier_sku: slugToSku.get(i.productSlug)!, quantity: i.quantity, price_uah: i.price }))

    const hasSupplierItems = supplierLineItems.length > 0
    const hasManualItems = d.items.length > supplierLineItems.length
    // A "mixed" order contains both supplier and manual items: we forward ONLY the
    // supplier items and flag the rest for manual handling.
    const isMixedOrder = hasSupplierItems && hasManualItems
    const mixedNote = isMixedOrder
      ? '⚠ Змішане замовлення: до постачальника передано лише товари з SKU; ручні товари (мед/квіти/інше) потребують окремої обробки.'
      : null
    console.info(
      `[checkout-submit ${trace}] items resolved — supplier=${supplierLineItems.length} manual=${hasManualItems ? d.items.length - supplierLineItems.length : 0} mixed=${isMixedOrder}`,
    )

    // ── Step 3: insert the local order (the customer's order MUST be saved) ────
    const { data: order, error: orderError } = await client
      .from('orders')
      .insert({
        customer_name: customerName,
        phone: d.phone,
        comment: d.comment ?? null,
        delivery_notes: d.warehouseName ?? d.warehouseId,
        status: 'new',
        total_uah: totalUah,
        source: d.source ?? null,
        order_source: 'website',
        // Supplier-specific fields
        receiver_first_name: d.firstName,
        receiver_last_name: d.lastName,
        receiver_patronymic: d.patronymic ?? null,
        method_payment: d.methodPayment,
        nova_poshta_warehouse_id: d.warehouseId,
        nova_poshta_warehouse_name: d.warehouseName ?? null,
        // New order: admin_notes is empty, so it's safe to seed the mixed-order
        // flag here without clobbering anything an admin typed later.
        admin_notes: mixedNote,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      // This is the most important log line: it reveals the EXACT DB cause
      // (missing column, constraint violation, RLS, etc.) instead of hiding it.
      console.error(
        `[checkout-submit ${trace}] orders insert FAILED — ${orderError ? `${orderError.code ?? ''} ${orderError.message} ${orderError.details ?? ''} ${orderError.hint ?? ''}`.trim() : 'no row returned'}`,
      )

      // ── Inquiries fallback — triggered only when `orders` table is missing ──
      // PGRST205 = "Could not find the table in the schema cache."
      // Do NOT fall back for other errors (RLS, constraint, bad value) — those
      // need to be fixed in the DB, not silently bypassed.
      const isMissingTable =
        !!orderError &&
        (orderError.code === 'PGRST205' ||
          (orderError.message ?? '').includes("Could not find the table 'public.orders'"))

      if (!isMissingTable) {
        return { success: false, error: FRIENDLY_ERROR }
      }

      console.info(`[checkout-submit ${trace}] orders table missing — saving checkout order to inquiries`)
      const fallbackId = `FALLBACK-${Date.now().toString(36).toUpperCase()}`

      // ── Fallback A: send supplier order ──────────────────────────────────
      let fbSupplierOrderId: string | undefined
      let fbSupplierMode: string = 'skipped'
      let fbSupplierStatus: string = 'skipped'
      let fbSupplierResponse: Record<string, unknown> | null = null

      if (hasSupplierItems) {
        const configuredMode = getSupplierOrderMode()
        const built = buildPersonalCabOrderPayload({
          receiver_first_name: d.firstName,
          receiver_last_name: d.lastName,
          receiver_patronymic: d.patronymic,
          receiver_phone: d.phone,
          method_payment: d.methodPayment,
          location: d.warehouseId,
          items: supplierLineItems,
          comments: d.comment,
        })

        if (configuredMode === 'disabled') {
          fbSupplierMode = 'disabled'
          fbSupplierStatus = 'not_sent'
          fbSupplierResponse = { reason: 'SUPPLIER_ORDER_MODE=disabled' }
        } else if (!built.ok) {
          fbSupplierMode = configuredMode
          fbSupplierStatus = 'failed'
          fbSupplierResponse = { errors: built.errors }
        } else {
          const result = await sendPersonalCabOrder(built.payload, { mode: configuredMode })
          fbSupplierOrderId = result.order_id
          fbSupplierMode = result.mode
          // sent only when live AND a real order_id came back. Live HTTP 200 with
          // no id is 'sent_unconfirmed' — never silently reported as success.
          fbSupplierStatus = !result.ok
            ? 'failed'
            : result.mode === 'test'
              ? 'test_sent'
              : result.confirmed
                ? 'sent'
                : 'sent_unconfirmed'
          fbSupplierResponse = result.raw_response ?? null
          if (fbSupplierStatus !== 'sent' && fbSupplierStatus !== 'test_sent') {
            console.error(`[checkout-submit ${trace}] supplier fallback result — ${fbSupplierStatus}: ${result.message}`)
          }
        }
        console.info(
          `[checkout-submit ${trace}] supplier fallback result — mode=${fbSupplierMode} status=${fbSupplierStatus}${fbSupplierOrderId ? ` id=${fbSupplierOrderId}` : ''}`,
        )
      }

      // ── Fallback B: save to `inquiries` ──────────────────────────────────
      // `type` must satisfy the existing CHECK constraint — use 'general'.
      // Full order details go into `message` (human-readable) and `notes` (JSON).
      const fbPaymentLabel = d.methodPayment === 'prepayment' ? 'Передоплата' : 'Накладний платіж'
      const fbItemLines = d.items
        .map((i) => `• ${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.quantity} — ${i.price * i.quantity} ₴`)
        .join('\n')

      const fbMessage = [
        `🛒 Замовлення з кошика (${fallbackId})`,
        `Оплата: ${fbPaymentLabel}`,
        `Нова Пошта: ${d.warehouseName ?? d.warehouseId}`,
        '',
        fbItemLines,
        '',
        `Сума: ${totalUah} ₴`,
        mixedNote,
        d.comment ? `Коментар: ${d.comment}` : null,
        '',
        '⚠ Збережено як заявку, бо таблиця orders відсутня.',
      ].filter(Boolean).join('\n')

      const fbNotes = JSON.stringify({
        _type: 'checkout_order_fallback',
        fallback_id: fallbackId,
        payment: d.methodPayment,
        warehouse_id: d.warehouseId,
        warehouse_name: d.warehouseName ?? null,
        items: d.items.map((i) => ({
          name: i.name,
          slug: i.productSlug,
          type: i.productType,
          qty: i.quantity,
          price: i.price,
          variant: i.variant ?? null,
          supplier_sku: slugToSku.get(i.productSlug) ?? null,
        })),
        total_uah: totalUah,
        supplier_mode: fbSupplierMode,
        supplier_status: fbSupplierStatus,
        supplier_order_id: fbSupplierOrderId ?? null,
        supplier_response: fbSupplierResponse,
      })

      const { error: inquiryError } = await client.from('inquiries').insert({
        name: customerName,
        phone: d.phone,
        type: 'general',
        product: 'Замовлення з кошика',
        message: fbMessage,
        notes: fbNotes,
        source: d.source ?? null,
        status: 'new',
      })

      if (inquiryError) {
        console.error(`[checkout-submit ${trace}] inquiry fallback insert failed — ${inquiryError.code ?? ''} ${inquiryError.message}`.trim())
        // Still try to notify via Telegram even if the DB save failed.
      } else {
        console.info(`[checkout-submit ${trace}] inquiry fallback saved`)
      }

      // ── Fallback C: Telegram + webhook notification ───────────────────────
      const fbShortId = fallbackId.slice(-8)
      const fbSupplierLine = supplierNotifyLine(fbSupplierMode, fbSupplierStatus, fbSupplierOrderId)

      const fbSupplierError =
        supplierNeedsDiagnostics(fbSupplierStatus) && fbSupplierResponse
          ? JSON.stringify(fbSupplierResponse)
          : null

      // Single plain-text message for BOTH n8n and direct Telegram. No parse_mode
      // anywhere: product names contain brackets/underscores that break HTML/MD.
      const fbNotifyText = [
        '🛒 НОВЕ ЗАМОВЛЕННЯ З САЙТУ',
        `Замовлення #${fbShortId}`,
        '⚠ Збережено як заявку (таблиця orders відсутня)',
        '',
        `Ім'я: ${customerName}`,
        `Телефон: ${d.phone}`,
        `Оплата: ${fbPaymentLabel}`,
        d.warehouseName ? `Нова Пошта: ${d.warehouseName}` : `Відділення ID: ${d.warehouseId}`,
        '',
        fbItemLines,
        '',
        `Сума: ${totalUah} ₴`,
        fbSupplierLine,
        fbSupplierError ? `Відповідь постачальника: ${fbSupplierError}` : null,
        mixedNote,
        d.comment ? `Коментар: ${d.comment}` : null,
        d.source ? `Сторінка: ${d.source}` : null,
      ].filter(Boolean).join('\n')

      // Always send BOTH Telegram and webhook — never one-or-the-other.
      await notifyProductOrder({
        trace,
        message: fbNotifyText,
        payload: {
          type: 'product_order_fallback',
          order_id: fallbackId,
          name: customerName,
          phone: d.phone,
          product: d.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.quantity}`).join(', '),
          page_url: d.source ?? null,
          total: totalUah,
          payment_method: d.methodPayment,
          warehouse: d.warehouseName ?? d.warehouseId,
          items_text: fbItemLines,
          supplier_status: fbSupplierStatus,
          supplier_mode: fbSupplierMode,
          supplier_order_id: fbSupplierOrderId ?? null,
          supplier_error: fbSupplierError,
          supplier_confirmed: fbSupplierStatus === 'sent' || fbSupplierStatus === 'test_sent',
          comment: d.comment ?? null,
          _warning: 'orders table missing; saved as checkout inquiry',
        },
      })

      return { success: true, orderId: fallbackId }
    }

    const orderId = order.id as string
    console.info(`[checkout-submit ${trace}] order created — id=${orderId}`)

    // ── Step 4: insert order items (non-fatal: order is already saved) ────────
    const { error: itemsError } = await client.from('order_items').insert(
      d.items.map((item) => ({
        order_id: orderId,
        product_type: item.productType,
        product_id: null,
        product_slug: item.productSlug,
        product_name: item.name,
        unit_price_uah: item.price,
        quantity: item.quantity,
        subtotal_uah: item.price * item.quantity,
        variant: item.variant ?? null,
      }))
    )

    if (itemsError) {
      console.error(
        `[checkout-submit ${trace}] order_items insert failed (order ${orderId} kept) — ${itemsError.code ?? ''} ${itemsError.message}`.trim(),
      )
    }

    // Forward supplier items to personal.cab. A supplier API failure must NEVER
    // lose the customer order — it is already saved above; we only annotate the
    // supplier_order_* columns with the outcome.
    //   mode=disabled → not_sent (kill switch)   no supplier items → skipped
    //   sent ok       → test_sent | sent          send failed       → failed
    let supplierOrderId: string | undefined
    let supplierMode: string = 'skipped'
    let supplierStatus: string = 'skipped'
    let supplierResponse: Record<string, unknown> | null = null

    if (hasSupplierItems) {
      const configuredMode = getSupplierOrderMode()
      const built = buildPersonalCabOrderPayload({
        receiver_first_name: d.firstName,
        receiver_last_name: d.lastName,
        receiver_patronymic: d.patronymic,
        receiver_phone: d.phone,
        method_payment: d.methodPayment,
        location: d.warehouseId,
        items: supplierLineItems,
        comments: d.comment,
      })

      if (configuredMode === 'disabled') {
        // Kill switch: do not contact the supplier at all.
        supplierMode = 'disabled'
        supplierStatus = 'not_sent'
        supplierResponse = { reason: 'SUPPLIER_ORDER_MODE=disabled' }
      } else if (!built.ok) {
        // Required data missing — keep the local order, record why it wasn't sent.
        supplierMode = configuredMode
        supplierStatus = 'failed'
        supplierResponse = { errors: built.errors }
      } else {
        // sendPersonalCabOrder never throws — a failure here must not break checkout.
        const result = await sendPersonalCabOrder(built.payload, { mode: configuredMode })
        supplierOrderId = result.order_id
        supplierMode = result.mode
        // sent only when live AND a real order_id came back. Live HTTP 200 with
        // no id is 'sent_unconfirmed' — never silently reported as success.
        supplierStatus = !result.ok
          ? 'failed'
          : result.mode === 'test'
            ? 'test_sent'
            : result.confirmed
              ? 'sent'
              : 'sent_unconfirmed'
        supplierResponse = result.raw_response ?? null
        if (supplierStatus !== 'sent' && supplierStatus !== 'test_sent') {
          console.error(`[checkout-submit ${trace}] supplier send ${supplierStatus} (order ${orderId} kept) — ${result.message}`)
        }
      }

      console.info(`[checkout-submit ${trace}] supplier — mode=${supplierMode} status=${supplierStatus}${supplierOrderId ? ` id=${supplierOrderId}` : ''}`)

      const { error: supUpdateError } = await client.from('orders').update({
        supplier_order_id: supplierOrderId ?? null,
        supplier_order_mode: supplierMode,
        supplier_order_status: supplierStatus,
        supplier_order_response: supplierResponse,
      }).eq('id', orderId)
      if (supUpdateError) {
        console.error(`[checkout-submit ${trace}] supplier_order_* update failed (order ${orderId} kept) — ${supUpdateError.message}`)
      }
    } else {
      // No supplier items — nothing to forward.
      const { error: skipUpdateError } = await client.from('orders').update({
        supplier_order_mode: 'skipped',
        supplier_order_status: 'skipped',
      }).eq('id', orderId)
      if (skipUpdateError) {
        console.error(`[checkout-submit ${trace}] skipped-status update failed (order ${orderId} kept) — ${skipUpdateError.message}`)
      }
    }

    const shortId = orderId.slice(0, 8).toUpperCase()
    const itemLines = d.items
      .map(
        (i) =>
          `• ${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.quantity} — ${i.price * i.quantity} ₴`
      )
      .join('\n')

    const PAYMENT_LABELS: Record<string, string> = {
      cashondelivery: 'Накладний платіж',
      prepayment: 'Передоплата',
    }

    const supplierLine = supplierNotifyLine(supplierMode, supplierStatus, supplierOrderId)
    const supplierError =
      supplierNeedsDiagnostics(supplierStatus) && supplierResponse
        ? JSON.stringify(supplierResponse)
        : null

    // Single plain-text message for BOTH n8n and direct Telegram. No parse_mode
    // anywhere: product names contain brackets/underscores that break HTML/MD.
    const notifyText = [
      '🛒 НОВЕ ЗАМОВЛЕННЯ З САЙТУ',
      `Замовлення #${shortId}`,
      '',
      `Ім'я: ${customerName}`,
      `Телефон: ${d.phone}`,
      `Оплата: ${PAYMENT_LABELS[d.methodPayment] ?? d.methodPayment}`,
      d.warehouseName ? `Нова Пошта: ${d.warehouseName}` : `Відділення ID: ${d.warehouseId}`,
      '',
      itemLines,
      '',
      `Сума: ${totalUah} ₴`,
      supplierLine,
      supplierError ? `Відповідь постачальника: ${supplierError}` : null,
      mixedNote,
      d.comment ? `Коментар: ${d.comment}` : null,
      d.source ? `Сторінка: ${d.source}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    // Always send BOTH Telegram and webhook — never one-or-the-other.
    await notifyProductOrder({
      trace,
      message: notifyText,
      payload: {
        type: 'product_order',
        order_id: orderId,
        name: customerName,
        phone: d.phone,
        product: d.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.quantity}`).join(', '),
        page_url: d.source ?? null,
        total: totalUah,
        payment_method: d.methodPayment,
        warehouse: d.warehouseName ?? d.warehouseId,
        items_text: itemLines,
        supplier_status: supplierStatus,
        supplier_mode: supplierMode,
        supplier_order_id: supplierOrderId ?? null,
        supplier_error: supplierError,
        supplier_confirmed: supplierStatus === 'sent' || supplierStatus === 'test_sent',
        comment: d.comment ?? null,
      },
    })

    console.info(`[checkout-submit ${trace}] success — order ${orderId}`)
    return { success: true, orderId }
  } catch (e) {
    // Anything unexpected (missing Supabase env, network, etc.). Log the full
    // cause server-side; show the customer a friendly message.
    console.error(
      `[checkout-submit ${trace}] unexpected failure — ${e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)}`,
    )
    return { success: false, error: FRIENDLY_ERROR }
  }
}
