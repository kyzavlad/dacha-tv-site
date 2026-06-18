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

function sendOrderWebhook(payload: Record<string, unknown>): void {
  const webhookUrl = process.env.WEBHOOK_URL
  if (!webhookUrl) return
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'website', ...payload, created_at: new Date().toISOString() }),
  }).catch(() => {})
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
      return { success: false, error: FRIENDLY_ERROR }
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
        supplierStatus = result.ok ? (result.mode === 'test' ? 'test_sent' : 'sent') : 'failed'
        supplierResponse = result.raw_response ?? null
        if (!result.ok) {
          console.error(`[checkout-submit ${trace}] supplier send failed (order ${orderId} kept) — ${result.message}`)
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

    const SUPPLIER_MODE_ICON: Record<string, string> = {
      test: '🧪 тест',
      live: '✅ live',
      disabled: '⛔ вимкнено',
    }

    const telegramText = [
      `🛒 Нове замовлення #${shortId}`,
      '',
      `Ім'я: ${customerName}`,
      `Телефон: <a href="tel:${d.phone}">${d.phone}</a>`,
      `Оплата: ${PAYMENT_LABELS[d.methodPayment] ?? d.methodPayment}`,
      d.warehouseName ? `Нова Пошта: ${d.warehouseName}` : `Відділення ID: ${d.warehouseId}`,
      '',
      itemLines,
      '',
      `Сума: ${totalUah} ₴`,
      supplierMode !== 'skipped'
        ? `Постачальник: ${SUPPLIER_MODE_ICON[supplierMode] ?? supplierMode} — ${supplierStatus}${supplierOrderId ? ` #${supplierOrderId}` : ''}`
        : null,
      mixedNote,
      d.comment ? `Коментар: ${d.comment}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (token && chatId) {
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: telegramText, parse_mode: 'HTML' }),
      }).catch(() => {})
    }

    sendOrderWebhook({
      type: 'product_order',
      order_id: orderId,
      customer_name: customerName,
      phone: d.phone,
      method_payment: d.methodPayment,
      warehouse_id: d.warehouseId,
      warehouse_name: d.warehouseName ?? null,
      items: d.items.map((i) => ({
        product_slug: i.productSlug,
        product_name: i.name,
        quantity: i.quantity,
        unit_price_uah: i.price,
        subtotal_uah: i.price * i.quantity,
        variant: i.variant ?? null,
      })),
      total_uah: totalUah,
      supplier_mode: supplierMode,
      supplier_status: supplierStatus,
      supplier_order_id: supplierOrderId ?? null,
      comment: d.comment ?? null,
      source_page: d.source ?? null,
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
