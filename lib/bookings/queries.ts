import { getAdminClient } from '@/lib/supabase/admin'
import { getSupabaseClient } from '@/lib/supabase/client'

export interface BookingService {
  id: string
  slug: string
  name: string
  booking_type: 'hourly' | 'daily'
  price_uah: number
  capacity: number
  extra_guest_price_uah: number | null
  slot_start_hour: number | null
  slot_end_hour: number | null
  check_in_time: string | null
  check_out_time: string | null
}

export interface Booking {
  id: string
  service_id: string | null
  service_slug: string
  booking_type: 'hourly' | 'daily'
  name: string
  phone: string
  booking_date: string | null
  booking_hour: number | null
  check_in: string | null
  check_out: string | null
  guest_count: number
  bouquet_qty: number | null
  total_price_uah: number | null
  comment: string | null
  status: 'new' | 'confirmed' | 'cancelled' | 'completed' | 'blocked'
  admin_notes: string | null
  source: string | null
  created_at: string
  updated_at: string
}

export interface BookingBlock {
  id: string
  service_slug: string
  block_date: string
  block_hour: number | null
  reason: string | null
  created_at: string
}

export async function getBookingService(slug: string): Promise<BookingService | null> {
  const client = getSupabaseClient()
  if (!client) return null
  const { data } = await client
    .from('services')
    .select('id, slug, name, booking_type, price_uah, capacity, extra_guest_price_uah, slot_start_hour, slot_end_hour, check_in_time, check_out_time')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()
  if (!data?.booking_type) return null
  return data as BookingService
}

export async function getBookedHours(serviceSlug: string, date: string): Promise<number[]> {
  const client = getSupabaseClient()
  if (!client) return []
  const { data } = await client
    .from('bookings')
    .select('booking_hour')
    .eq('service_slug', serviceSlug)
    .eq('booking_date', date)
    .in('status', ['new', 'confirmed'])
  return (data ?? []).map((r: { booking_hour: number | null }) => r.booking_hour).filter((h): h is number => h !== null)
}

export async function getBlockedHours(serviceSlug: string, date: string): Promise<number[]> {
  const client = getSupabaseClient()
  if (!client) return []
  const { data } = await client
    .from('booking_blocks')
    .select('block_hour')
    .eq('service_slug', serviceSlug)
    .eq('block_date', date)
  return (data ?? []).map((r: { block_hour: number | null }) => r.block_hour).filter((h): h is number => h !== null)
}

export async function getBookedDates(serviceSlug: string, fromDate: string, toDate: string): Promise<string[]> {
  const client = getSupabaseClient()
  if (!client) return []
  const { data } = await client
    .from('bookings')
    .select('check_in, check_out')
    .eq('service_slug', serviceSlug)
    .in('status', ['new', 'confirmed'])
    .gte('check_out', fromDate)
    .lte('check_in', toDate)
  const dates: Set<string> = new Set()
  for (const b of data ?? []) {
    if (!b.check_in || !b.check_out) continue
    const d = new Date(b.check_in)
    const end = new Date(b.check_out)
    while (d < end) {
      dates.add(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
  }
  return Array.from(dates)
}

export async function getAllBookings(): Promise<Booking[]> {
  const client = getAdminClient()
  const { data } = await client
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as Booking[]
}

export async function updateBookingStatus(
  id: string,
  status: Booking['status'],
  adminNotes?: string
): Promise<{ ok: boolean; message: string }> {
  const client = getAdminClient()
  const payload: Record<string, unknown> = { status }
  if (adminNotes !== undefined) payload.admin_notes = adminNotes
  const { error } = await client.from('bookings').update(payload).eq('id', id)
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Статус оновлено' }
}
