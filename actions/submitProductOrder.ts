'use server'

import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { submitOrder } from '@/lib/supplier/order'

const ukrainianPhone = /^(\+380|0)\d{9}$/

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
  phone: z.string().regex(ukrainianPhone, 'Введіть коректний номер телефону'),
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

  const parsed = submitOrderSchema.safeParse(raw)
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>
    const fieldErrors: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(flat)) fieldErrors[k] = v ?? []
    return { success: false, error: 'Перевірте правильність введених даних', fieldErrors }
  }

  const d = parsed.data
  const customerName = `${d.lastName} ${d.firstName}${d.patronymic ? ` ${d.patronymic}` : ''}`
  const totalUah = d.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const client = getAdminClient()

  // Look up supplier SKUs for catalog items
  const catalogSlugs = d.items
    .filter((i) => i.productType === 'catalog')
    .map((i) => i.productSlug)

  const slugToSku: Map<string, string> = new Map()
  if (catalogSlugs.length > 0) {
    const { data: skuRows } = await client
      .from('catalog_products')
      .select('slug, supplier_sku')
      .in('slug', catalogSlugs)
    for (const row of skuRows ?? []) {
      if (row.supplier_sku) slugToSku.set(row.slug as string, row.supplier_sku as string)
    }
  }

  // Build supplier products list (only catalog items with a known SKU)
  const supplierProducts = d.items
    .filter((i) => i.productType === 'catalog' && slugToSku.has(i.productSlug))
    .map((i) => ({ sku: slugToSku.get(i.productSlug)!, qty: i.quantity, price: i.price }))

  try {
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
      })
      .select('id')
      .single()

    if (orderError || !order) {
      return { success: false, error: 'Не вдалося оформити замовлення. Спробуйте ще раз.' }
    }

    const orderId = order.id as string

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
      console.error('[submitProductOrder] order_items insert failed:', itemsError.message)
    }

    // Forward to supplier API if we have catalog items with SKUs
    let supplierOrderId: string | undefined
    let supplierMode: string = 'skipped'
    let supplierStatus: string = 'skipped'
    let supplierResponse: Record<string, unknown> | null = null

    if (supplierProducts.length > 0) {
      const result = await submitOrder({
        receiver_first_name: d.firstName,
        receiver_last_name: d.lastName,
        receiver_patronymic: d.patronymic,
        receiver_phone: d.phone,
        method_payment: d.methodPayment,
        location: d.warehouseId,
        products: supplierProducts,
        comments: d.comment,
      })

      supplierOrderId = result.order_id
      supplierMode = result.mode
      supplierStatus = result.ok ? 'ok' : 'error'
      supplierResponse = result.raw_response ?? null

      await client.from('orders').update({
        supplier_order_id: supplierOrderId ?? null,
        supplier_order_mode: supplierMode,
        supplier_order_status: supplierStatus,
        supplier_order_response: supplierResponse,
      }).eq('id', orderId)
    } else {
      // No catalog items — mark as skipped
      await client.from('orders').update({
        supplier_order_mode: 'skipped',
        supplier_order_status: 'skipped',
      }).eq('id', orderId)
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
        ? `Постачальник: ${supplierMode === 'test' ? '🧪 тест' : '✅ live'} — ${supplierStatus}${supplierOrderId ? ` #${supplierOrderId}` : ''}`
        : null,
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

    return { success: true, orderId }
  } catch {
    return { success: false, error: 'Не вдалося оформити замовлення. Спробуйте ще раз.' }
  }
}
