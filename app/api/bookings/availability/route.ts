import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase/client'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const slug = searchParams.get('slug')
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const client = getSupabaseClient()
  if (!client) return NextResponse.json({ error: 'unavailable' }, { status: 503 })

  // Hourly: return booked hours for a specific date
  if (date) {
    const [bookings, blocks] = await Promise.all([
      client.from('bookings').select('booking_hour').eq('service_slug', slug).eq('booking_date', date).in('status', ['new', 'confirmed']),
      client.from('booking_blocks').select('block_hour').eq('service_slug', slug).eq('block_date', date),
    ])
    const bookedHours = [
      ...(bookings.data ?? []).map((r: { booking_hour: number | null }) => r.booking_hour).filter((h): h is number => h !== null),
      ...(blocks.data ?? []).map((r: { block_hour: number | null }) => r.block_hour).filter((h): h is number => h !== null),
    ]
    return NextResponse.json({ bookedHours })
  }

  // Daily: return booked date ranges
  if (from && to) {
    const [bookings, blocks] = await Promise.all([
      client.from('bookings').select('check_in, check_out').eq('service_slug', slug).in('status', ['new', 'confirmed']).gte('check_out', from).lte('check_in', to),
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
