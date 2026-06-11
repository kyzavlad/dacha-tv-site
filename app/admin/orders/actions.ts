'use server'

import { getAdminClient } from '@/lib/supabase/admin'
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
