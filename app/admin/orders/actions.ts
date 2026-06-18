'use server'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { buildPersonalCabOrderPayload, sendPersonalCabOrder } from '@/lib/supplier/order'
import type { OrderStatus } from '@/types'

export async function adminUpdateOrderStatus(
  id: string,
  status: OrderStatus,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getAdminClient()
    const payload: Record<string, unknown> = { status }
    if (adminNotes !== undefined) payload.admin_notes = adminNotes
    const { error } = await client.from('orders').update(payload).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Admin-only: re-send a single existing order to personal.cab in TEST mode.
// Always forced to mode=test — this action can NEVER create a live supplier
// order, regardless of SUPPLIER_ORDER_MODE. Protected by the /admin proxy
// middleware (admin_session cookie). Reloads the order's stored receiver/
// warehouse fields and resolves supplier SKUs from catalog_products by slug.
export async function adminSendSupplierTestOrder(
  orderId: string
): Promise<{ success: boolean; message: string; status?: string }> {
  try {
    const client = getAdminClient()

    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()
    if (orderErr || !order) return { success: false, message: 'Замовлення не знайдено' }

    const { data: items } = await client
      .from('order_items')
      .select('product_type, product_slug, unit_price_uah, quantity')
      .eq('order_id', orderId)

    // Resolve supplier SKUs for catalog items only.
    const catalogSlugs = (items ?? [])
      .filter((i) => i.product_type === 'catalog')
      .map((i) => i.product_slug as string)

    const slugToSku = new Map<string, string>()
    if (catalogSlugs.length > 0) {
      const { data: skuRows } = await client
        .from('catalog_products')
        .select('slug, supplier_sku')
        .in('slug', catalogSlugs)
      for (const row of skuRows ?? []) {
        if (row.supplier_sku) slugToSku.set(row.slug as string, row.supplier_sku as string)
      }
    }

    const supplierLineItems = (items ?? [])
      .filter((i) => i.product_type === 'catalog' && slugToSku.has(i.product_slug as string))
      .map((i) => ({
        supplier_sku: slugToSku.get(i.product_slug as string)!,
        quantity: i.quantity as number,
        price_uah: i.unit_price_uah as number,
      }))

    const built = buildPersonalCabOrderPayload({
      receiver_first_name: order.receiver_first_name,
      receiver_last_name: order.receiver_last_name,
      receiver_patronymic: order.receiver_patronymic,
      receiver_phone: order.phone,
      method_payment: order.method_payment,
      location: order.nova_poshta_warehouse_id,
      items: supplierLineItems,
      comments: order.comment,
    })

    if (!built.ok) {
      // Record the failure on the order so it is visible in the admin UI.
      await client
        .from('orders')
        .update({
          supplier_order_mode: 'test',
          supplier_order_status: 'failed',
          supplier_order_response: { errors: built.errors },
        })
        .eq('id', orderId)
      revalidatePath(`/admin/orders/${orderId}`)
      return { success: false, message: `Неможливо відправити: ${built.errors.join('; ')}`, status: 'failed' }
    }

    const result = await sendPersonalCabOrder(built.payload, { mode: 'test' })
    const status = result.ok ? 'test_sent' : 'failed'

    await client
      .from('orders')
      .update({
        supplier_order_id: result.order_id ?? null,
        supplier_order_mode: 'test',
        supplier_order_status: status,
        supplier_order_response: result.raw_response ?? null,
      })
      .eq('id', orderId)

    revalidatePath(`/admin/orders/${orderId}`)
    return { success: result.ok, message: result.message, status }
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : String(e) }
  }
}
