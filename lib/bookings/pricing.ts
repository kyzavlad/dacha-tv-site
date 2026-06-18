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

// Resilient occupied-hours for a booking ROW, using only columns that always
// exist on old schemas (booking_hour, check_in, check_out) plus duration_hours
// when present. Order of preference:
//   1) check_in/check_out range when they carry an hour (same-day timestamps)
//   2) booking_hour + duration_hours
//   3) booking_hour for a single hour
// This means availability never depends on the duration_hours column existing.
export function bookingOccupiedHours(row: {
  booking_hour?: number | null
  check_in?: string | null
  check_out?: string | null
  duration_hours?: number | null
}): number[] {
  if (row.check_in && row.check_out) {
    const ci = new Date(row.check_in)
    const co = new Date(row.check_out)
    if (!Number.isNaN(ci.getTime()) && !Number.isNaN(co.getTime())) {
      const sh = ci.getUTCHours()
      const eh = co.getUTCHours()
      const spanMs = co.getTime() - ci.getTime()
      // Same calendar day and a positive hour span → trust the stored range.
      if (spanMs > 0 && spanMs <= 24 * 3600 * 1000 && eh > sh) {
        const out: number[] = []
        for (let h = sh; h < eh; h++) out.push(h)
        if (out.length > 0) return out
      }
    }
  }
  if (row.booking_hour != null) {
    const dur = Math.max(1, Math.floor(Number(row.duration_hours) || 1))
    return occupiedHours(row.booking_hour, dur)
  }
  return []
}

// True when two [start, start+duration) hour ranges overlap.
export function rangesOverlap(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  const aEnd = aStart + Math.max(1, aDur)
  const bEnd = bStart + Math.max(1, bDur)
  return aStart < bEnd && bStart < aEnd
}
