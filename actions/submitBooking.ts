'use server'

import { z } from 'zod'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendTelegramNotification } from '@/lib/notifications/telegram'
import { findActiveHourConflict, type Booking } from '@/lib/bookings/queries'
import {
  LAVENDER_SLUG,
  LAVENDER_INCLUDED_GUESTS,
  LAVENDER_EXTRA_GUEST_PRICE_UAH,
  LAVENDER_MAX_EXTRA_GUESTS,
  LAVENDER_BOUQUET_PRICE_UAH,
  LAVENDER_DAY_PRICE_UAH,
  LAVENDER_EVENING_PRICE_UAH,
  LAVENDER_EVENING_FROM_HOUR,
  LAVENDER_MAX_DURATION_HOURS,
  computeBookingPrice,
  buildBookingCommentWithMeta,
  stripBookingMeta,
  readBookingMeta,
  type HourlyPricingConfig,
} from '@/lib/bookings/pricing'

const ukrainianPhone = /^(\+380|0)\d{9}$/

const BOUQUET_PRICE_UAH = LAVENDER_BOUQUET_PRICE_UAH
const lavenderMaxDate = () => `${new Date().getFullYear()}-07-20`

// Hard cap for any single Supabase round-trip in the booking path. After a heavy
// catalog import Supabase can be slow/overloaded; this guarantees the submit
// action can never hang on the DB — it either completes or falls back fast.
const DB_TIMEOUT_MS = 4500

// Reject after `ms` so a slow/hanging Supabase call can't block a booking
// submit. The caller catches the rejection and degrades (fallback for lavender).
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`db_timeout:${label}`)), ms)
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

// Build the hourly pricing config for a service. Lavender uses the two-tier
// (day/evening) rate; every other hourly service uses its flat price.
function pricingConfig(slug: string, flatPricePerHour: number): HourlyPricingConfig {
  if (slug === LAVENDER_SLUG) {
    return {
      flatPricePerHour: LAVENDER_DAY_PRICE_UAH,
      dayPriceUah: LAVENDER_DAY_PRICE_UAH,
      eveningStartHour: LAVENDER_EVENING_FROM_HOUR,
      eveningPriceUah: LAVENDER_EVENING_PRICE_UAH,
    }
  }
  return { flatPricePerHour }
}

// Public site URL for clean notification links (never a raw internal path).
function publicUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com').replace(/\/+$/, '')
  if (!path) return base
  if (path.startsWith('http')) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

// Detect a "column does not exist" error so a not-yet-migrated optional column
// (e.g. bouquet_qty before migration 056) can be dropped and the insert retried,
// rather than failing the whole booking save.
function isMissingColumn(error: { message?: string; code?: string } | null | undefined, column: string): boolean {
  if (!error) return false
  const msg = (error.message ?? '').toLowerCase()
  return error.code === '42703' || error.code === 'PGRST204' || (msg.includes(column.toLowerCase()) && msg.includes('column'))
}

const hourlyBookingSchema = z.object({
  serviceSlug: z.string().min(1),
  serviceName: z.string().min(1),
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z.string().regex(ukrainianPhone, 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Невірний формат дати'),
  bookingHour: z.coerce.number().int().min(0).max(23),
  durationHours: z.coerce.number().int().min(1).max(24).optional(),
  // Total guests (1 = min/default). Included up to 5; each above 5 is +200 ₴.
  guestCount: z.coerce.number().int().min(1).max(100),
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

type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

function fieldErrors(err: z.ZodError): Record<string, string[]> {
  const flat = err.flatten().fieldErrors as Record<string, string[] | undefined>
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(flat)) out[k] = v ?? []
  return out
}

// Send normalized booking payload to n8n webhook (WEBHOOK_URL).
// Used by non-lavender hourly and daily bookings; lavender uses notifyBooking.
function sendBookingWebhook(payload: Record<string, unknown>): void {
  const webhookUrl = process.env.WEBHOOK_URL
  if (!webhookUrl) return
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'website', ...payload, created_at: new Date().toISOString() }),
  }).catch(() => {})
}

// Fail-safe dual-channel notification for lavender bookings.
// Both channels run concurrently via Promise.allSettled so one failing never
// blocks the other. Caller awaits this before the DB insert so DB failure can
// never silently swallow a booking notification.
async function notifyBooking({
  trace,
  message,
  payload,
}: {
  trace: string
  message: string
  payload: Record<string, unknown>
}): Promise<void> {
  const tasks: Promise<void>[] = []

  // Bound each external call so a slow Telegram/n8n endpoint can't hang the
  // action (the booking path must stay fast even when everything is degraded).
  const NOTIFY_TIMEOUT_MS = 5000

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID_FLOWERS || process.env.TELEGRAM_CHAT_ID
  if (token && chatId) {
    tasks.push(
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
        signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
      })
        .then((r) => { console.log(`[lavender-booking ${trace}] direct telegram sent ok=${r.ok} status=${r.status}`) })
        .catch((e) => { console.error(`[lavender-booking ${trace}] direct telegram failed:`, String(e)) })
    )
  } else {
    console.warn(`[lavender-booking ${trace}] direct telegram skipped (missing ${!token ? 'TELEGRAM_BOT_TOKEN' : 'chat id'})`)
  }

  const webhookUrl = process.env.WEBHOOK_URL
  if (webhookUrl) {
    tasks.push(
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
      })
        .then((r) => { console.log(`[lavender-booking ${trace}] webhook sent ok=${r.ok} status=${r.status}`) })
        .catch((e) => { console.error(`[lavender-booking ${trace}] webhook failed:`, String(e)) })
    )
  } else {
    console.warn(`[lavender-booking ${trace}] webhook skipped (no WEBHOOK_URL)`)
  }

  await Promise.allSettled(tasks)
}

export async function submitHourlyBooking(formData: FormData): Promise<ActionResult> {
  const raw = {
    serviceSlug: formData.get('serviceSlug'),
    serviceName: formData.get('serviceName'),
    name: formData.get('name'),
    phone: formData.get('phone'),
    bookingDate: formData.get('bookingDate'),
    bookingHour: formData.get('bookingHour'),
    durationHours: formData.get('durationHours') ?? '1',
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
  const isLavender = d.serviceSlug === LAVENDER_SLUG
  const trace = Math.random().toString(36).slice(2, 10).toUpperCase()
  if (isLavender) console.log(`[lavender-booking ${trace}] validated`)

  // Lavender-specific server-side rules (mirror the form). Other hourly services
  // are unaffected.
  if (isLavender) {
    if (d.bookingDate > lavenderMaxDate()) {
      return { success: false, error: 'Бронювання лавандового поля доступне лише до 20 липня.', fieldErrors: { bookingDate: ['Дата після 20 липня недоступна'] } }
    }
    if (d.guestCount > LAVENDER_INCLUDED_GUESTS + LAVENDER_MAX_EXTRA_GUESTS) {
      return { success: false, error: `Максимум ${LAVENDER_INCLUDED_GUESTS + LAVENDER_MAX_EXTRA_GUESTS} гостей. Для більших груп зв’яжіться з нами.`, fieldErrors: { guestCount: ['Забагато гостей'] } }
    }
    if (d.rulesAccepted !== 'true') {
      return { success: false, error: 'Підтвердіть, що ознайомлені з правилами відвідування лавандового поля.', fieldErrors: { rulesAccepted: ['Потрібно підтвердити правила'] } }
    }
  }

  // Past-time guard: reject bookings for time slots that are already elapsed.
  // Ukraine uses UTC+3 year-round (since the 2022 timezone law amendment).
  // Checked here — before DB work and before the notification helper — so
  // expired slots never trigger an admin alert.
  {
    const kievNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const todayKyiv = `${kievNow.getUTCFullYear()}-${String(kievNow.getUTCMonth() + 1).padStart(2, '0')}-${String(kievNow.getUTCDate()).padStart(2, '0')}`
    if (d.bookingDate === todayKyiv && d.bookingHour <= kievNow.getUTCHours()) {
      return {
        success: false,
        error: 'Обраний час вже минув. Будь ласка, оберіть пізніший час на сьогодні.',
        fieldErrors: { bookingHour: ['Цей час вже минув'] },
      }
    }
  }

  // ── DB-backed save, every round-trip hard-bounded so an overloaded Supabase
  //    can never hang the submit ────────────────────────────────────────────
  const client = getAdminClient()

  // services config — bounded and tolerant. Lavender has full constant
  // fallbacks; other services fall back to their defaults below. A timeout here
  // never fails the booking, it just uses defaults.
  let svc: {
    id?: string
    price_uah?: number | null
    capacity?: number | null
    extra_guest_price_uah?: number | null
    slot_start_hour?: number | null
    slot_end_hour?: number | null
  } | null = null
  try {
    const r = await withTimeout(
      client
        .from('services')
        .select('id, price_uah, capacity, extra_guest_price_uah, slot_start_hour, slot_end_hour')
        .eq('slug', d.serviceSlug)
        .single(),
      DB_TIMEOUT_MS,
      'services',
    )
    svc = r.data ?? null
  } catch (e) {
    console.error(`[booking ${trace}] services lookup failed/timeout:`, e instanceof Error ? e.message : e)
  }

  // Lavender always includes 5 guests by business rule (do NOT trust the DB
  // capacity column, which can be 0 and caused "Гості: 0 осіб").
  const includedGuests = isLavender ? LAVENDER_INCLUDED_GUESTS : (svc?.capacity ?? 1)
  const extraRate = svc?.extra_guest_price_uah ?? LAVENDER_EXTRA_GUEST_PRICE_UAH
  const slotEnd = svc?.slot_end_hour ?? 21

  // Clamp duration so it never runs past the service's closing hour.
  const maxDuration = Math.max(1, Math.min(LAVENDER_MAX_DURATION_HOURS, slotEnd - d.bookingHour))
  const durationHours = Math.min(Math.max(1, d.durationHours ?? 1), maxDuration)
  const guestCount = Math.max(1, d.guestCount)
  const extraGuests = Math.max(0, guestCount - includedGuests)
  const bouquetQty = d.bouquetQty && d.bouquetQty > 0 ? d.bouquetQty : 0

  // Server-authoritative price (never trust any client-sent total). Base sums
  // each hourly slot's tariff (1000 day / 1200 evening) across the duration.
  const price = computeBookingPrice({
    startHour: d.bookingHour,
    durationHours,
    extraGuests,
    extraGuestPrice: extraRate,
    bouquetQty,
    bouquetPrice: isLavender ? BOUQUET_PRICE_UAH : 0,
    cfg: pricingConfig(d.serviceSlug, svc?.price_uah ?? 1000),
  })
  const total = price.total

  // Notification data — all derived without the DB, so a fallback alert can be
  // sent even when every DB call is unavailable.
  const pageLink = publicUrl(d.source || '/lavender')
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`
  const time = pad(d.bookingHour)
  const timeEnd = pad(d.bookingHour + durationHours)
  const timingText = `${d.bookingDate} · ${time}–${timeEnd} · ${durationHours} год.`
  const guestWord = (n: number) => (n === 1 ? 'особа' : n >= 2 && n <= 4 ? 'особи' : 'осіб')
  const guestsText = extraGuests > 0
    ? `${guestCount} ${guestWord(guestCount)} (включено ${includedGuests}, додатково +${extraGuests})`
    : `${guestCount} ${guestWord(guestCount)}`
  const bouquetLine = bouquetQty > 0
    ? `Букети лаванди: ${bouquetQty} шт × ${BOUQUET_PRICE_UAH} ₴ = ${price.bouquetTotal.toLocaleString('uk-UA')} ₴`
    : ''

  // Reusable normal-path lavender notification (sent only after a successful save).
  const lavenderTgMessage = [
    '🌿 НОВЕ БРОНЮВАННЯ ЛАВАНДИ',
    `Ім'я: ${d.name}`,
    `Телефон: ${d.phone}`,
    `Дата: ${d.bookingDate}`,
    `Час: ${time}–${timeEnd} (${durationHours} год.)`,
    `Гостей: ${guestsText}`,
    ...(bouquetLine ? [bouquetLine] : []),
    `Вартість: ${total.toLocaleString('uk-UA')} ₴`,
    ...(d.comment ? [`Коментар: ${d.comment}`] : []),
    `Сторінка: ${pageLink}`,
  ].join('\n')
  const lavenderPayload: Record<string, unknown> = {
    source: 'website',
    type: 'lavender_booking',
    booking_type: 'lavender',
    name: d.name,
    phone: d.phone,
    date: d.bookingDate,
    time,
    time_end: timeEnd,
    duration_hours: durationHours,
    guests: guestCount,
    guest_count: guestCount,
    included_guests: includedGuests,
    extra_guests: extraGuests,
    extra_guests_total: price.extraTotal,
    bouquet_quantity: bouquetQty,
    bouquet_unit_price: BOUQUET_PRICE_UAH,
    bouquet_total: price.bouquetTotal,
    base_total: price.base,
    total_price: total,
    timing: timingText,
    timing_text: timingText,
    guests_text: guestsText,
    bouquet_line: bouquetLine,
    product: d.serviceName,
    service_name: d.serviceName,
    slug: d.serviceSlug,
    page_url: pageLink,
    message: d.comment ?? null,
    comment: d.comment ?? null,
    created_at: new Date().toISOString(),
  }

  // ── Bounded DB write: conflict check + insert ──────────────────────────────
  // For lavender, a timeout/availability failure here must NOT lose the lead:
  // we send a fallback notification (clearly flagged as UNSTORED) and still tell
  // the visitor we received the request. A genuine slot conflict is a normal
  // business rejection, not a fallback.
  try {
    // Reject immediately if any hour in the requested range overlaps an active
    // (non-cancelled) booking — the slot is taken the moment a request is sent.
    const conflict = await withTimeout(
      findActiveHourConflict(d.serviceSlug, d.bookingDate, d.bookingHour, durationHours),
      DB_TIMEOUT_MS,
      'conflict',
    )
    if (conflict.conflict) {
      return { success: false, error: 'Цей час вже зайнятий. Будь ласка, оберіть інший час.', fieldErrors: { bookingHour: ['Час уже зайнятий'] } }
    }

    // Store the time range redundantly in check_in/check_out (which exist on
    // every schema) so availability still works even if the duration_hours
    // column is missing in production.
    const hh = (h: number) => String(h).padStart(2, '0')
    const checkInTs = `${d.bookingDate}T${hh(d.bookingHour)}:00:00Z`
    const checkOutTs = `${d.bookingDate}T${hh(d.bookingHour + durationHours)}:00:00Z`

    const bookingRow: Record<string, unknown> = {
      service_id: svc?.id ?? null,
      service_slug: d.serviceSlug,
      booking_type: 'hourly',
      name: d.name,
      phone: d.phone,
      booking_date: d.bookingDate,
      booking_hour: d.bookingHour,
      check_in: checkInTs,
      check_out: checkOutTs,
      duration_hours: durationHours,
      guest_count: guestCount,
      extra_guests_count: extraGuests,
      bouquet_qty: bouquetQty,
      total_price_uah: total,
      // DB comment carries a hidden meta block so duration/extras survive even if
      // those columns don't exist. The clean user comment goes to Telegram/n8n.
      comment: buildBookingCommentWithMeta(d.comment, {
        duration_hours: durationHours,
        guest_count: guestCount,
        extra_guests_count: extraGuests,
        bouquet_qty: bouquetQty,
      }),
      source: d.source ?? null,
      status: 'new',
    }

    // Drop any column the DB hasn't migrated yet (058/056) and retry; each
    // insert attempt is itself bounded so a hang can never escape this block.
    let error = (await withTimeout(client.from('bookings').insert(bookingRow), DB_TIMEOUT_MS, 'insert')).error
    for (const col of ['duration_hours', 'extra_guests_count', 'bouquet_qty']) {
      if (error && isMissingColumn(error, col)) {
        console.error(`[booking] bookings.${col} missing — apply migrations 056/058. Saving without it for now.`)
        delete bookingRow[col]
        error = (await withTimeout(client.from('bookings').insert(bookingRow), DB_TIMEOUT_MS, 'insert-retry')).error
      }
    }
    if (error) throw new Error(`insert_failed:${error.message}`)

    // Stored OK → insert, then send the normal notification, then success.
    if (isLavender) {
      await notifyBooking({ trace, message: lavenderTgMessage, payload: lavenderPayload })
      console.log(`[lavender-booking ${trace}] db insert ok + notified — completed`)
    }
    return { success: true }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)

    // Non-lavender hourly services: preserve previous behaviour — ask the
    // visitor to retry (no fallback channel is wired for them).
    if (!isLavender) {
      console.error(`[booking ${trace}] failed to save hourly booking:`, reason)
      return { success: false, error: 'Не вдалося зберегти бронювання. Спробуйте ще раз.' }
    }

    // Lavender FALLBACK — the lead must not be lost. Supabase is unavailable, so
    // the row is NOT stored and the slot is NOT auto-blocked; we send a flagged
    // alert (Telegram + n8n) for manual handling and give the visitor a calm
    // success message. Never surface a technical error to the visitor.
    const temporaryId = `FALLBACK-LAVENDER-${Date.now()}`
    console.error(`[lavender-booking ${trace}] DB unavailable (${reason}) → FALLBACK unstored temporary_id=${temporaryId}`)

    const fallbackWarning = 'Увага: заявка не записана в БД через timeout, перевірити вручну.'
    const fallbackTgMessage = [
      '🌿⚠️ БРОНЮВАННЯ ЛАВАНДИ — РЕЗЕРВНИЙ КАНАЛ',
      `Тимчасовий ID: ${temporaryId}`,
      `Ім'я: ${d.name}`,
      `Телефон: ${d.phone}`,
      `Дата: ${d.bookingDate}`,
      `Час: ${time}–${timeEnd} (${durationHours} год.)`,
      `Гостей: ${guestsText}`,
      ...(bouquetLine ? [bouquetLine] : []),
      `Вартість: ${total.toLocaleString('uk-UA')} ₴`,
      ...(d.comment ? [`Коментар: ${d.comment}`] : []),
      `Сторінка: ${pageLink}`,
      '',
      fallbackWarning,
    ].join('\n')

    await notifyBooking({
      trace,
      message: fallbackTgMessage,
      payload: {
        source: 'website',
        type: 'lavender_booking_fallback',
        status: 'db_timeout_unstored',
        temporary_id: temporaryId,
        booking_type: 'lavender',
        name: d.name,
        phone: d.phone,
        date: d.bookingDate,
        time,
        time_end: timeEnd,
        duration: durationHours,
        duration_hours: durationHours,
        guests: guestCount,
        guest_count: guestCount,
        bouquet: bouquetQty,
        bouquet_quantity: bouquetQty,
        total_price: total,
        source_page: pageLink,
        page_url: pageLink,
        timing_text: timingText,
        guests_text: guestsText,
        warning: fallbackWarning,
        reason,
        created_at: new Date().toISOString(),
      },
    })
    console.log(`[lavender-booking ${trace}] fallback notification dispatched temporary_id=${temporaryId}`)

    return { success: true, message: 'Заявку отримано. Ми підтвердимо час дзвінком.' }
  }
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

    if (error) {
      console.error('[booking] failed to save daily booking:', error)
      return { success: false, error: 'Не вдалося зберегти бронювання. Спробуйте ще раз.' }
    }
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
  } catch (e) {
    console.error('[booking] unexpected error saving daily booking:', e)
    return { success: false, error: 'Не вдалося зберегти бронювання. Спробуйте ще раз.' }
  }

  return { success: true }
}

// Update status / notes. Confirming runs a server-side conflict check so two
// confirmed bookings can never occupy the same slot. Cancelling never deletes
// the row (history is preserved) and releases the slot for others.
export async function adminUpdateBookingStatus(
  id: string,
  status: Booking['status'],
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getAdminClient()

    if (status === 'confirmed') {
      const { data: b } = await client
        .from('bookings')
        .select('service_slug, booking_type, booking_date, booking_hour, duration_hours')
        .eq('id', id)
        .single()
      if (b?.booking_type === 'hourly' && b.booking_date && b.booking_hour != null) {
        const res = await findActiveHourConflict(b.service_slug, b.booking_date, b.booking_hour, b.duration_hours ?? 1, id)
        if (res.conflict) {
          return { success: false, error: 'Цей час уже зайнятий іншим підтвердженим бронюванням. Підтвердження скасовано.' }
        }
      }
    }

    const payload: Record<string, unknown> = { status }
    if (adminNotes !== undefined) payload.admin_notes = adminNotes
    const { error } = await client.from('bookings').update(payload).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Edit an hourly booking's date / start hour / duration. Recalculates the price
// for the new schedule and re-runs the conflict check when the booking is (or is
// being) confirmed.
export async function adminUpdateBookingSchedule(
  id: string,
  input: { bookingDate: string; bookingHour: number; durationHours: number },
  alsoConfirm = false,
): Promise<{ success: boolean; error?: string; total?: number; durationHours?: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.bookingDate)) return { success: false, error: 'Невірний формат дати' }
  const bookingHour = Math.min(23, Math.max(0, Math.floor(input.bookingHour)))
  let durationHours = Math.min(LAVENDER_MAX_DURATION_HOURS, Math.max(1, Math.floor(input.durationHours || 1)))

  try {
    const client = getAdminClient()
    // select('*') so the query never fails when extra_guests_count / bouquet_qty
    // columns are missing on an un-migrated DB; extras fall back to comment meta.
    const { data: b } = await client
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single()
    if (!b) return { success: false, error: 'Бронювання не знайдено' }
    const meta = readBookingMeta(b.comment)

    const willBeConfirmed = alsoConfirm || b.status === 'confirmed'
    if (willBeConfirmed) {
      const res = await findActiveHourConflict(b.service_slug, input.bookingDate, bookingHour, durationHours, id)
      if (res.conflict) {
        return { success: false, error: 'Цей час уже зайнятий іншим підтвердженим бронюванням.' }
      }
    }

    const { data: svc } = await client
      .from('services')
      .select('price_uah, capacity, extra_guest_price_uah, slot_end_hour')
      .eq('slug', b.service_slug)
      .single()
    const slotEnd = svc?.slot_end_hour ?? 21
    durationHours = Math.min(durationHours, Math.max(1, slotEnd - bookingHour))
    const extraGuests = Math.max(0, Number(b.extra_guests_count ?? meta?.extra_guests_count ?? 0))
    const bouquetQty = Math.max(0, Number(b.bouquet_qty ?? meta?.bouquet_qty ?? 0))
    const guestCount = Number(b.guest_count ?? meta?.guest_count) || undefined

    const price = computeBookingPrice({
      startHour: bookingHour,
      durationHours,
      extraGuests,
      extraGuestPrice: svc?.extra_guest_price_uah ?? LAVENDER_EXTRA_GUEST_PRICE_UAH,
      bouquetQty,
      bouquetPrice: b.service_slug === LAVENDER_SLUG ? BOUQUET_PRICE_UAH : 0,
      cfg: pricingConfig(b.service_slug, svc?.price_uah ?? 1000),
    })

    const payload: Record<string, unknown> = {
      booking_date: input.bookingDate,
      booking_hour: bookingHour,
      duration_hours: durationHours,
      total_price_uah: price.total,
      // Refresh the comment meta so the new duration survives even without the
      // duration_hours column; keep the user's real comment intact.
      comment: buildBookingCommentWithMeta(stripBookingMeta(b.comment), {
        duration_hours: durationHours,
        guest_count: guestCount,
        extra_guests_count: extraGuests,
        bouquet_qty: bouquetQty,
      }),
    }
    if (alsoConfirm) payload.status = 'confirmed'

    let error = (await client.from('bookings').update(payload).eq('id', id)).error
    if (error && isMissingColumn(error, 'duration_hours')) {
      delete payload.duration_hours
      error = (await client.from('bookings').update(payload).eq('id', id)).error
    }
    if (error) return { success: false, error: error.message }
    return { success: true, total: price.total, durationHours }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
