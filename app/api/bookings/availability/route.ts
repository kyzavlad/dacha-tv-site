import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase/client'
import { bookingOccupiedHours, ACTIVE_BOOKING_STATUSES, LAVENDER_SLUG, type BookingHourRow } from '@/lib/bookings/pricing'

// Map a friendly ?type= to the actual service slug, so callers can use either
// ?slug=orenda-lavandovoho-polia or ?type=lavender.
const TYPE_TO_SLUG: Record<string, string> = {
  lavender: LAVENDER_SLUG,
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')
  const slug = searchParams.get('slug') || (type ? TYPE_TO_SLUG[type] : undefined)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!slug) return NextResponse.json({ error: 'slug or known type required' }, { status: 400 })

  const client = getSupabaseClient()
  if (!client) return NextResponse.json({ error: 'unavailable' }, { status: 503 })

  // Hourly: return booked hours for a specific date. All active (new/confirmed)
  // bookings block the slot immediately; each occupies its full range. We select
  // '*' so the query never fails when the duration_hours column is missing on an
  // un-migrated database — occupied hours are derived from check_in/check_out or
  // booking_hour + duration_hours, whichever is available.
  if (date) {
    const [bookings, blocks] = await Promise.all([
      client.from('bookings').select('*').eq('service_slug', slug).eq('booking_date', date).in('status', [...ACTIVE_BOOKING_STATUSES]),
      client.from('booking_blocks').select('block_hour').eq('service_slug', slug).eq('block_date', date),
    ])
    const hours = new Set<number>()
    for (const r of (bookings.data ?? []) as BookingHourRow[]) {
      for (const h of bookingOccupiedHours(r)) hours.add(h)
    }
    for (const r of (blocks.data ?? []) as { block_hour: number | null }[]) {
      if (r.block_hour != null) hours.add(r.block_hour)
    }
    return NextResponse.json({ bookedHours: [...hours] })
  }

  // Daily: return booked date ranges
  if (from && to) {
    const [bookings, blocks] = await Promise.all([
      client.from('bookings').select('check_in, check_out').eq('service_slug', slug).in('status', [...ACTIVE_BOOKING_STATUSES]).gte('check_out', from).lte('check_in', to),
      client.from('booking_blocks').select('block_date').eq('service_slug', slug).gte('block_date', from).lte('block_date', to).is('block_hour', null),
    ])
    const dates: Set<string> = new Set()
    for (const b of bookings.data ?? []) {
      if (!b.check_in || !b.check_out) continue
      const d = new Date(b.check_in)
      const end = new Date(b.check_out)
      while (d < end) {
        dates.add(d.toISOString().slice(0, 10))
        d.setDate(d.getDate() + 1)
      }
    }
    for (const b of blocks.data ?? []) {
      if (b.block_date) dates.add(b.block_date)
    }
    return NextResponse.json({ bookedDates: Array.from(dates) })
  }

  return NextResponse.json({ error: 'date or from+to required' }, { status: 400 })
}
