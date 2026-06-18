// Shared, pure booking-pricing logic — imported by BOTH the client calendar and
// the server action so the displayed total and the stored/charged total are
// always computed the same way. The server is authoritative; the client only
// previews. No server-only imports here.

export const LAVENDER_SLUG = 'orenda-lavandovoho-polia'

// Booking statuses that block a slot on the public calendar. Only the
// migration-safe statuses from the original schema are used here (new +
// confirmed), so availability never depends on statuses (pending/declined/
// expired) that require migration 059 to be applied. Everything else
// (cancelled / completed / …) RELEASES the slot.
export const ACTIVE_BOOKING_STATUSES: readonly string[] = ['new', 'confirmed']

// Two-tier lavender hourly pricing: 06:00–15:00 = 1000 ₴, 15:00–21:00 = 1200 ₴.
export const LAVENDER_DAY_PRICE_UAH = 1000
export const LAVENDER_EVENING_PRICE_UAH = 1200
export const LAVENDER_EVENING_FROM_HOUR = 15

// Lavender guest rules: 5 included, each extra +200 ₴.
export const LAVENDER_INCLUDED_GUESTS = 5
export const LAVENDER_EXTRA_GUEST_PRICE_UAH = 200
export const LAVENDER_MAX_EXTRA_GUESTS = 20
export const LAVENDER_BOUQUET_PRICE_UAH = 100
export const LAVENDER_MAX_DURATION_HOURS = 12

export interface HourlyPricingConfig {
  flatPricePerHour: number      // base hourly rate for non-tiered services
  eveningStartHour?: number     // tier boundary (lavender)
  eveningPriceUah?: number      // evening price (lavender)
  dayPriceUah?: number          // day price (lavender); defaults to flatPricePerHour
}

// Price of a single hour-slot starting at `hour`.
export function hourPrice(hour: number, cfg: HourlyPricingConfig): number {
  if (cfg.eveningStartHour != null && cfg.eveningPriceUah != null) {
    return hour >= cfg.eveningStartHour ? cfg.eveningPriceUah : (cfg.dayPriceUah ?? cfg.flatPricePerHour)
  }
  return cfg.flatPricePerHour
}

export interface BookingPriceInput {
  startHour: number
  durationHours: number
  extraGuests: number
  extraGuestPrice: number
  bouquetQty: number
  bouquetPrice: number
  cfg: HourlyPricingConfig
}

export interface BookingPriceBreakdown {
  base: number          // rental for the whole selected duration
  durationHours: number
  extraGuests: number
  extraGuestPrice: number
  extraTotal: number
  bouquetQty: number
  bouquetPrice: number
  bouquetTotal: number
  total: number
}

// Authoritative price calculation. Base = sum of each hour's tier price across
// the chosen duration, plus extra guests and bouquets.
export function computeBookingPrice(i: BookingPriceInput): BookingPriceBreakdown {
  const durationHours = Math.max(1, Math.floor(i.durationHours || 1))
  let base = 0
  for (let h = i.startHour; h < i.startHour + durationHours; h++) base += hourPrice(h, i.cfg)

  const extraGuests = Math.max(0, Math.floor(i.extraGuests || 0))
  const extraGuestPrice = Math.max(0, Math.floor(i.extraGuestPrice || 0))
  const extraTotal = extraGuests * extraGuestPrice

  const bouquetQty = Math.max(0, Math.floor(i.bouquetQty || 0))
  const bouquetPrice = Math.max(0, Math.floor(i.bouquetPrice || 0))
  const bouquetTotal = bouquetQty * bouquetPrice

  return {
    base,
    durationHours,
    extraGuests,
    extraGuestPrice,
    extraTotal,
    bouquetQty,
    bouquetPrice,
    bouquetTotal,
    total: base + extraTotal + bouquetTotal,
  }
}

// The hours a booking occupies, given a start hour and a duration.
export function occupiedHours(startHour: number, durationHours: number): number[] {
  const dur = Math.max(1, Math.floor(durationHours || 1))
  const out: number[] = []
  for (let h = startHour; h < startHour + dur; h++) out.push(h)
  return out
}

// ─── Comment-embedded booking metadata ──────────────────────────────────────
// On old production DBs the duration_hours column may not exist and check_in/
// check_out are date-only (hours truncated). To preserve duration/extras without
// a migration we stash a small JSON blob inside the always-present `comment`
// text column, wrapped in markers so it can be stripped before display.

const META_RE = /\s*\*\*BOOKING_META\*\*([\s\S]*?)\*\*END_BOOKING_META\*\*\s*/

export interface BookingMeta {
  duration_hours?: number
  guest_count?: number
  extra_guests_count?: number
  bouquet_qty?: number
}

// Append the meta block to the (optional) user comment, preserving the user text.
export function buildBookingCommentWithMeta(userComment: string | null | undefined, meta: BookingMeta): string {
  const clean = (userComment ?? '').trim()
  const metaStr = `**BOOKING_META**${JSON.stringify(meta)}**END_BOOKING_META**`
  return clean ? `${clean}\n${metaStr}` : metaStr
}

// Return the human comment with the meta block removed (null when nothing left).
export function stripBookingMeta(comment: string | null | undefined): string | null {
  if (!comment) return null
  const cleaned = comment.replace(META_RE, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

// Parse the embedded meta JSON, or null when absent/invalid.
export function readBookingMeta(comment: string | null | undefined): BookingMeta | null {
  if (!comment) return null
  const m = comment.match(META_RE)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1].trim())
    return parsed && typeof parsed === 'object' ? (parsed as BookingMeta) : null
  } catch {
    return null
  }
}

export interface BookingHourRow {
  booking_hour?: number | null
  check_in?: string | null
  check_out?: string | null
  duration_hours?: number | null
  comment?: string | null
}

// Resolve a booking's duration (hours) without depending on the duration_hours
// column. Preference order:
//   1) duration_hours column (when present)
//   2) duration_hours parsed from the comment meta block
//   3) check_in/check_out span (only meaningful on timestamp columns)
//   4) 1 hour
export function bookingDurationHours(row: BookingHourRow): number {
  if (row.duration_hours && row.duration_hours > 0) return Math.floor(row.duration_hours)

  const meta = readBookingMeta(row.comment)
  if (meta && Number(meta.duration_hours) > 0) return Math.floor(Number(meta.duration_hours))

  if (row.check_in && row.check_out) {
    const ci = new Date(row.check_in)
    const co = new Date(row.check_out)
    if (!Number.isNaN(ci.getTime()) && !Number.isNaN(co.getTime())) {
      const h = Math.round((co.getTime() - ci.getTime()) / 3_600_000)
      if (h > 0 && h <= 24) return h
    }
  }
  return 1
}

// Resilient occupied-hours for a booking ROW. The start is the always-present
// booking_hour; the duration comes from bookingDurationHours() (column → comment
// meta → check_in/out → 1), so multi-hour bookings block every hour even on an
// un-migrated database. 18:00 for 3h → [18,19,20].
export function bookingOccupiedHours(row: BookingHourRow): number[] {
  if (row.booking_hour == null) return []
  return occupiedHours(row.booking_hour, bookingDurationHours(row))
}

// True when two [start, start+duration) hour ranges overlap.
export function rangesOverlap(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  const aEnd = aStart + Math.max(1, aDur)
  const bEnd = bStart + Math.max(1, bDur)
  return aStart < bEnd && bStart < aEnd
}
