import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase/client'
import { occupiedHours } from '@/lib/bookings/pricing'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const slug = searchParams.get('slug')
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const client = getSupabaseClient()
  if (!client) return NextResponse.json({ error: 'unavailable' }, { status: 503 })

  // Hourly: return booked hours for a specific date. Only CONFIRMED bookings
  // block the slot (new/pending do not); each occupies its full duration.
  if (date) {
    const [bookings, blocks] = await Promise.all([
      client.from('bookings').select('booking_hour, duration_hours').eq('service_slug', slug).eq('booking_date', date).eq('status', 'confirmed'),
      client.from('booking_blocks').select('block_hour').eq('service_slug', slug).eq('block_date', date),
    ])
    const hours = new Set<number>()
    for (const r of (bookings.data ?? []) as { booking_hour: number | null; duration_hours: number | null }[]) {
      if (r.booking_hour == null) continue
      for (const h of occupiedHours(r.booking_hour, r.duration_hours ?? 1)) hours.add(h)
    }
    for (const r of (blocks.data ?? []) as { block_hour: number | null }[]) {
      if (r.block_hour != null) hours.add(r.block_hour)
    }
    return NextResponse.json({ bookedHours: [...hours] })
  }

  // Daily: return booked date ranges
  if (from && to) {
    const [bookings, blocks] = await Promise.all([
      client.from('bookings').select('check_in, check_out').eq('service_slug', slug).eq('status', 'confirmed').gte('check_out', from).lte('check_in', to),
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
