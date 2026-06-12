'use server'

import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendTelegramNotification } from '@/lib/notifications/telegram'

const ukrainianPhone = /^(\+380|0)\d{9}$/

// Lavender field rental — special rules: season ends 20 July, max 5 guests, a
// rules-confirmation checkbox is required, and an optional bouquet upsell.
const LAVENDER_SLUG = 'orenda-lavandovoho-polia'
const LAVENDER_MAX_GUESTS = 5
const BOUQUET_PRICE_UAH = 100
const lavenderMaxDate = () => `${new Date().getFullYear()}-07-20`

// Two-tier lavender hourly pricing: 06:00–15:00 = 1000 ₴, 15:00–21:00 = 1200 ₴.
const LAVENDER_DAY_PRICE_UAH = 1000
const LAVENDER_EVENING_PRICE_UAH = 1200
const LAVENDER_EVENING_FROM_HOUR = 15

function lavenderHourPrice(hour: number): number {
  return hour >= LAVENDER_EVENING_FROM_HOUR ? LAVENDER_EVENING_PRICE_UAH : LAVENDER_DAY_PRICE_UAH
}

// Public site URL for clean notification links (never a raw internal path).
function publicUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://dachatv.co').replace(/\/+$/, '')
  if (!path) return base
  if (path.startsWith('http')) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

const hourlyBookingSchema = z.object({
  serviceSlug: z.string().min(1),
  serviceName: z.string().min(1),
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z.string().regex(ukrainianPhone, 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Невірний формат дати'),
  bookingHour: z.coerce.number().int().min(0).max(23),
  guestCount: z.coerce.number().int().min(1).max(50),
  bouquetQty: z.coerce.number().int().min(0).max(99).optional(),
  rulesAccepted: z.string().optional(),
  comment: z.string().max(500).optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0, 'Відмовлено'),
})

const dailyBookingSchema = z.object({
  serviceSlug: z.string().min(1),
  serviceName: z.string().min(1),
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z.string().regex(ukrainianPhone, 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)'),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Невірний формат дати'),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Невірний формат дати'),
  guestCount: z.coerce.number().int().min(1).max(50),
  comment: z.string().max(500).optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0, 'Відмовлено'),
})

type ActionResult = { success: true } | { success: false; error: string; fieldErrors?: Record<string, string[]> }

function fieldErrors(err: z.ZodError): Record<string, string[]> {
  const flat = err.flatten().fieldErrors as Record<string, string[] | undefined>
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(flat)) out[k] = v ?? []
  return out
}

// Send normalized booking payload to n8n webhook (WEBHOOK_URL).
// Called after the DB insert so booking_id is available.
function sendBookingWebhook(payload: Record<string, unknown>): void {
  const webhookUrl = process.env.WEBHOOK_URL
  if (!webhookUrl) return
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'website', ...payload, created_at: new Date().toISOString() }),
  }).catch(() => {})
}

export async function submitHourlyBooking(formData: FormData): Promise<ActionResult> {
  const raw = {
    serviceSlug: formData.get('serviceSlug'),
    serviceName: formData.get('serviceName'),
    name: formData.get('name'),
    phone: formData.get('phone'),
    bookingDate: formData.get('bookingDate'),
    bookingHour: formData.get('bookingHour'),
    guestCount: formData.get('guestCount') ?? '1',
    bouquetQty: formData.get('bouquetQty') ?? '0',
    rulesAccepted: formData.get('rulesAccepted') ?? undefined,
    comment: formData.get('comment') ?? undefined,
    source: formData.get('source') ?? undefined,
    _honeypot: formData.get('_honeypot') ?? '',
  }

  const parsed = hourlyBookingSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Перевірте правильність введених даних', fieldErrors: fieldErrors(parsed.error) }

  const d = parsed.data

  // Lavender-specific server-side rules (mirror the form). Other hourly services
  // are unaffected.
  if (d.serviceSlug === LAVENDER_SLUG) {
    if (d.bookingDate > lavenderMaxDate()) {
      return { success: false, error: 'Бронювання лавандового поля доступне лише до 20 липня.', fieldErrors: { bookingDate: ['Дата після 20 липня недоступна'] } }
    }
    if (d.guestCount > LAVENDER_MAX_GUESTS) {
      return { success: false, error: `Максимум ${LAVENDER_MAX_GUESTS} гостей на бронювання.`, fieldErrors: { guestCount: [`Максимум ${LAVENDER_MAX_GUESTS} гостей`] } }
    }
    if (d.rulesAccepted !== 'true') {
      return { success: false, error: 'Підтвердіть, що ознайомлені з правилами відвідування лавандового поля.', fieldErrors: { rulesAccepted: ['Потрібно підтвердити правила'] } }
    }
  }

  const bouquetQty = d.bouquetQty && d.bouquetQty > 0 ? d.bouquetQty : 0
  const bouquetTotal = bouquetQty * BOUQUET_PRICE_UAH

  try {
    const client = getAdminClient()
    const { data: svc } = await client
      .from('services')
      .select('id, price_uah, capacity, extra_guest_price_uah')
      .eq('slug', d.serviceSlug)
      .single()

    // Lavender uses a two-tier hourly rate by start hour; other hourly services
    // use the flat service price.
    const basePrice = d.serviceSlug === LAVENDER_SLUG
      ? lavenderHourPrice(d.bookingHour)
      : (svc?.price_uah ?? 1000)
    const capacity = svc?.capacity ?? 5
    const extraRate = svc?.extra_guest_price_uah ?? 200
    const extra = Math.max(0, d.guestCount - capacity) * extraRate
    const total = basePrice + extra + bouquetTotal

    const { error } = await client.from('bookings').insert({
      service_id: svc?.id ?? null,
      service_slug: d.serviceSlug,
      booking_type: 'hourly',
      name: d.name,
      phone: d.phone,
      booking_date: d.bookingDate,
      booking_hour: d.bookingHour,
      guest_count: d.guestCount,
      bouquet_qty: bouquetQty,
      total_price_uah: total,
      comment: d.comment ?? null,
      source: d.source ?? null,
      status: 'new',
    })

    if (error) return { success: false, error: 'Не вдалося зберегти бронювання. Спробуйте ще раз.' }

    const pageLink = publicUrl(d.source || '/lavender')

    // Telegram — clean, readable message (no internal ID, public page link).
    sendTelegramNotification({
      type: 'lavender_booking',
      name: d.name,
      phone: d.phone,
      product: d.serviceName,
      timing: `${d.bookingDate} о ${String(d.bookingHour).padStart(2, '0')}:00`,
      quantity: String(d.guestCount),
      bouquet_qty: bouquetQty || undefined,
      bouquet_unit_price: BOUQUET_PRICE_UAH,
      total_price_uah: total,
      message: d.comment,
      source: pageLink,
    }, { skipWebhook: true }).catch(() => {})

    // n8n webhook — normalized payload (no booking_id, public page_url).
    sendBookingWebhook({
      type: 'lavender_booking',
      name: d.name,
      phone: d.phone,
      service_name: d.serviceName,
      slug: d.serviceSlug,
      page_url: pageLink,
      date: d.bookingDate,
      time: `${String(d.bookingHour).padStart(2, '0')}:00`,
      guests: d.guestCount,
      bouquet_qty: bouquetQty,
      bouquet_unit_price: bouquetQty > 0 ? BOUQUET_PRICE_UAH : 0,
      bouquet_total: bouquetTotal,
      total_price: total,
      message: d.comment ?? null,
    })
  } catch {
    return { success: false, error: 'Не вдалося зберегти бронювання. Спробуйте ще раз.' }
  }

  return { success: true }
}

export async function submitDailyBooking(formData: FormData): Promise<ActionResult> {
  const raw = {
    serviceSlug: formData.get('serviceSlug'),
    serviceName: formData.get('serviceName'),
    name: formData.get('name'),
    phone: formData.get('phone'),
    checkIn: formData.get('checkIn'),
    checkOut: formData.get('checkOut'),
    guestCount: formData.get('guestCount') ?? '1',
    comment: formData.get('comment') ?? undefined,
    source: formData.get('source') ?? undefined,
    _honeypot: formData.get('_honeypot') ?? '',
  }

  const parsed = dailyBookingSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Перевірте правильність введених даних', fieldErrors: fieldErrors(parsed.error) }

  const d = parsed.data
  const nights = Math.max(1, Math.round((new Date(d.checkOut).getTime() - new Date(d.checkIn).getTime()) / 86400000))
  let bookingId: string | null = null

  try {
    const client = getAdminClient()
    const { data: svc } = await client
      .from('services')
      .select('id, price_uah')
      .eq('slug', d.serviceSlug)
      .single()

    const dailyRate = svc?.price_uah ?? 3000
    const total = dailyRate * nights

    const { data: booking, error } = await client.from('bookings').insert({
      service_id: svc?.id ?? null,
      service_slug: d.serviceSlug,
      booking_type: 'daily',
      name: d.name,
      phone: d.phone,
      check_in: d.checkIn,
      check_out: d.checkOut,
      guest_count: d.guestCount,
      total_price_uah: total,
      comment: d.comment ?? null,
      source: d.source ?? null,
      status: 'new',
    }).select('id').single()

    if (error) return { success: false, error: 'Не вдалося зберегти бронювання. Спробуйте ще раз.' }
    bookingId = booking?.id ?? null

    const nightsLabel = `${nights} ніч${nights === 1 ? '' : nights < 5 ? 'і' : 'ей'}`

    // Telegram — direct, skipWebhook: webhook sent separately with normalized payload
    sendTelegramNotification({
      type: 'water_house_booking',
      name: d.name,
      phone: d.phone,
      product: d.serviceName,
      timing: `${d.checkIn} → ${d.checkOut} (${nightsLabel})`,
      quantity: String(d.guestCount),
      message: d.comment,
      source: d.source,
    }, { skipWebhook: true }).catch(() => {})

    // n8n webhook — normalized payload with structured booking fields
    sendBookingWebhook({
      type: 'water_house_booking',
      name: d.name,
      phone: d.phone,
      service_name: d.serviceName,
      slug: d.serviceSlug,
      page_url: d.source ?? `/services/${d.serviceSlug}`,
      check_in: d.checkIn,
      check_out: d.checkOut,
      nights,
      guests: d.guestCount,
      total_price: total,
      message: d.comment ?? null,
      booking_id: bookingId,
    })
  } catch {
    return { success: false, error: 'Не вдалося зберегти бронювання. Спробуйте ще раз.' }
  }

  return { success: true }
}

export async function adminUpdateBookingStatus(
  id: string,
  status: 'new' | 'confirmed' | 'cancelled' | 'completed' | 'blocked',
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getAdminClient()
    const payload: Record<string, unknown> = { status }
    if (adminNotes !== undefined) payload.admin_notes = adminNotes
    const { error } = await client.from('bookings').update(payload).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
