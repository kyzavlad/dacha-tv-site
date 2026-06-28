import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase/client'
import { bookingOccupiedHours, ACTIVE_BOOKING_STATUSES, LAVENDER_SLUG, type BookingHourRow } from '@/lib/bookings/pricing'

// This endpoint is on the public booking path (ads → /lavender → calendar). It
// must NEVER hang the site: every DB query is bounded by a hard timeout and any
// timeout/error degrades to an empty-but-successful response so the calendar
// stays usable and the booking form still works.
export const dynamic = 'force-dynamic'

// Hard cap for the Supabase round-trip. Comfortably under the client's 4s fetch
// timeout so the client gets a real (degraded) JSON answer rather than aborting.
const QUERY_TIMEOUT_MS = 3000

// Never cache availability — it changes constantly and a stale 200 must not pin.
const NO_STORE = { 'Cache-Control': 'no-store' } as const

// Friendly ?type= → real service slug, so callers can use either
// ?slug=orenda-lavandovoho-polia or ?type=lavender.
const TYPE_TO_SLUG: Record<string, string> = {
  lavender: LAVENDER_SLUG,
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Reject a promise after `ms` so a slow/hanging Supabase call can't block the
// request. The caller catches and returns a degraded 200.
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('availability_timeout')), ms)
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')
  const slug = searchParams.get('slug') || (type ? TYPE_TO_SLUG[type] : undefined)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!slug) return NextResponse.json({ error: 'slug or known type required' }, { status: 400, headers: NO_STORE })

  // Validate shapes up front (cheap) so malformed input fails fast, never the DB.
  if (date && !DATE_RE.test(date)) return NextResponse.json({ error: 'invalid date' }, { status: 400, headers: NO_STORE })
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    return NextResponse.json({ error: 'invalid from/to' }, { status: 400, headers: NO_STORE })
  }

  const client = getSupabaseClient()
  // Degrade rather than 503 — the calendar shows its fallback notice and the
  // booking form still works.
  if (!client) {
    return NextResponse.json(
      { bookedHours: [], bookedDates: [], degraded: true, message: 'availability_unavailable' },
      { headers: NO_STORE },
    )
  }

  // Hourly: return booked hours for a specific date. All active (new/confirmed)
  // bookings block the slot immediately; each occupies its full range. We select
  // '*' so the query never fails when the duration_hours column is missing on an
  // un-migrated database — occupied hours are derived from check_in/check_out or
  // booking_hour + duration_hours, whichever is available.
  if (date) {
    try {
      // Tightly filtered by indexed slug + date + status (a handful of rows).
      // We keep select('*') on bookings ONLY because the duration resolver may
      // read comment-meta / check_in / check_out and duration_hours can be
      // absent on un-migrated DBs — naming columns there would either error or
      // drop the multi-hour fallback. block_hour is the single needed block col.
      const [bookings, blocks] = await withTimeout(
        Promise.all([
          client.from('bookings').select('*').eq('service_slug', slug).eq('booking_date', date).in('status', [...ACTIVE_BOOKING_STATUSES]),
          client.from('booking_blocks').select('block_hour').eq('service_slug', slug).eq('block_date', date),
        ]),
        QUERY_TIMEOUT_MS,
      )

      const hours = new Set<number>()
      for (const r of (bookings.data ?? []) as BookingHourRow[]) {
        for (const h of bookingOccupiedHours(r)) hours.add(h)
      }
      for (const r of (blocks.data ?? []) as { block_hour: number | null }[]) {
        if (r.block_hour != null) hours.add(r.block_hour)
      }

      // Block all elapsed hours when querying today (Kyiv time = UTC+3).
      // Ukraine uses UTC+3 year-round so a fixed offset is safe.
      const kievNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
      const todayKyiv = `${kievNow.getUTCFullYear()}-${String(kievNow.getUTCMonth() + 1).padStart(2, '0')}-${String(kievNow.getUTCDate()).padStart(2, '0')}`
      if (date === todayKyiv) {
        const nowHour = kievNow.getUTCHours()
        for (let h = 0; h <= nowHour; h++) hours.add(h)
      }

      return NextResponse.json({ bookedHours: [...hours] }, { headers: NO_STORE })
    } catch (e) {
      console.error('[availability] hourly query failed/timed out:', e instanceof Error ? e.message : e)
      return NextResponse.json({ bookedHours: [], degraded: true, message: 'availability_timeout' }, { headers: NO_STORE })
    }
  }

  // Daily: return booked date ranges
  if (from && to) {
    try {
      const [bookings, blocks] = await withTimeout(
        Promise.all([
          client.from('bookings').select('check_in, check_out').eq('service_slug', slug).in('status', [...ACTIVE_BOOKING_STATUSES]).gte('check_out', from).lte('check_in', to),
          client.from('booking_blocks').select('block_date').eq('service_slug', slug).gte('block_date', from).lte('block_date', to).is('block_hour', null),
        ]),
        QUERY_TIMEOUT_MS,
      )

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
      return NextResponse.json({ bookedDates: Array.from(dates) }, { headers: NO_STORE })
    } catch (e) {
      console.error('[availability] daily query failed/timed out:', e instanceof Error ? e.message : e)
      return NextResponse.json({ bookedDates: [], degraded: true, message: 'availability_timeout' }, { headers: NO_STORE })
    }
  }

  return NextResponse.json({ error: 'date or from+to required' }, { status: 400, headers: NO_STORE })
}
