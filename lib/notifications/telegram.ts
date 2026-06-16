import type { InquiryData } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  honey_order: 'Замовлення меду',
  beekeeper_inquiry: 'Заявка пасічника',
  general: 'Загальна заявка',
  flower_inquiry: '🌸 Замовлення квітів',
  lavender_booking: '💜 Бронювання лаванди',
  water_house_booking: '🏠 Бронювання будиночка',
  natural_products: '🌿 Натуральні продукти',
  metal: '🏗️ Металопрофіль / будматеріали',
}

function formatTelegramMessage(inquiry: InquiryData): string {
  const typeLabel = TYPE_LABELS[inquiry.type] || inquiry.type
  const timestamp = new Intl.DateTimeFormat('uk-UA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Kiev',
  }).format(new Date())

  const lines = [
    `🆕 Нова заявка — ${typeLabel}`,
    '',
    `Ім'я: ${inquiry.name}`,
    `Телефон: <a href="tel:${inquiry.phone}">${inquiry.phone}</a>`,
  ]

  if (inquiry.product) lines.push(`Послуга: ${inquiry.product}`)
  if (inquiry.packaging) lines.push(`Упаковка: ${inquiry.packaging}`)
  if (inquiry.breed) lines.push(`Порода: ${inquiry.breed}`)
  if (inquiry.timing) lines.push(`Дата/час: ${inquiry.timing}`)
  if (inquiry.duration_hours && inquiry.duration_hours > 0) {
    lines.push(`Тривалість: ${inquiry.duration_hours} год`)
  }
  // For bookings `quantity` carries the included guests (e.g. 5). For other
  // inquiry types it is a generic quantity.
  if (inquiry.quantity) lines.push(`Гості: ${inquiry.quantity} осіб`)
  if (inquiry.extra_guests && inquiry.extra_guests > 0) {
    const extraSum = inquiry.extra_guests_price != null ? ` (+${inquiry.extra_guests_price.toLocaleString('uk-UA')} ₴)` : ''
    lines.push(`Додатково людей: +${inquiry.extra_guests}${extraSum}`)
  }
  if (inquiry.bouquet_qty && inquiry.bouquet_qty > 0) {
    const unit = inquiry.bouquet_unit_price ?? 100
    lines.push(`Букет лаванди: так — ${inquiry.bouquet_qty} шт × ${unit} ₴ = ${(inquiry.bouquet_qty * unit).toLocaleString('uk-UA')} ₴`)
  }
  if (inquiry.total_price_uah != null) lines.push(`Вартість: ${inquiry.total_price_uah.toLocaleString('uk-UA')} ₴`)
  if (inquiry.message) lines.push(`Коментар: ${inquiry.message}`)
  if (inquiry.source) lines.push(`Сторінка: ${inquiry.source}`)

  lines.push(`⏰ ${timestamp}`)

  return lines.join('\n')
}

interface TelegramOptions {
  // When true, skip the WEBHOOK_URL call (used for bookings that send their own normalized payload)
  skipWebhook?: boolean
}

// High-level product group used by n8n to pick a routing branch. Derived from
// the inquiry type so EVERY webhook call carries it, even legacy callers.
function resolveProductGroup(type: string): 'natural' | 'metal' | 'catalog' {
  if (type === 'natural_products') return 'natural'
  if (type === 'metal') return 'metal'
  return 'catalog'
}

export async function sendTelegramNotification(
  inquiry: InquiryData,
  options: TelegramOptions = {}
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const isFlower = inquiry.type === 'flower_inquiry' || inquiry.type === 'lavender_booking'
  const isWaterHouse = inquiry.type === 'water_house_booking'
  const isNatural = inquiry.type === 'natural_products'
  const isMetal = inquiry.type === 'metal'

  // Optional forum/topic thread id, sent as message_thread_id when configured.
  let topicId: string | undefined
  let chatId: string | undefined
  if (isFlower) {
    chatId = process.env.TELEGRAM_CHAT_ID_FLOWERS || process.env.TELEGRAM_CHAT_ID
  } else if (isWaterHouse) {
    // Fall back to main chat id if TELEGRAM_CHAT_ID_DAD is not yet set
    chatId = process.env.TELEGRAM_CHAT_ID_DAD || process.env.TELEGRAM_CHAT_ID
    if (!chatId) {
      console.warn('[telegram] No chat id configured for water_house_booking — set TELEGRAM_CHAT_ID_DAD or TELEGRAM_CHAT_ID')
    }
  } else if (isNatural) {
    // Natural products / beekeeping thread
    chatId = process.env.TELEGRAM_CHAT_ID_NATURAL || process.env.TELEGRAM_CHAT_ID
    topicId = process.env.TELEGRAM_TOPIC_NATURAL || undefined
  } else if (isMetal) {
    // Metal / profnastil / building materials thread
    chatId = process.env.TELEGRAM_CHAT_ID_METAL || process.env.TELEGRAM_CHAT_ID
    topicId = process.env.TELEGRAM_TOPIC_METAL || undefined
  } else {
    chatId = process.env.TELEGRAM_CHAT_ID
  }

  if (!chatId) return

  const text = formatTelegramMessage(inquiry)

  const messagePayload: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (topicId) {
    const threadId = Number(topicId)
    if (Number.isFinite(threadId)) messagePayload.message_thread_id = threadId
  }

  const tasks: Promise<void>[] = []

  tasks.push(
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messagePayload),
    }).then(() => {}).catch(() => {})
  )

  // n8n webhook — only for non-booking types; bookings send their own normalized payload
  if (!options.skipWebhook) {
    const webhookUrl = process.env.WEBHOOK_URL
    if (webhookUrl) {
      tasks.push(
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Routing fields for n8n — enough to branch without env-only config.
            type: inquiry.type,
            intent: inquiry.type,
            lead_type: inquiry.type,
            product_group: resolveProductGroup(inquiry.type),
            source: 'website',
            name: inquiry.name,
            customer_name: inquiry.name,
            phone: inquiry.phone,
            // Product / category context.
            category: inquiry.category ?? null,
            product: inquiry.product ?? null,
            product_title: inquiry.product_title ?? inquiry.product ?? null,
            product_slug: inquiry.product_slug ?? null,
            selected_options: inquiry.options ?? null,
            // Free-text customer note (both keys for workflow compatibility).
            comment: inquiry.message ?? null,
            message: inquiry.message ?? null,
            // Extra structured fields used by some flows.
            packaging: inquiry.packaging ?? null,
            breed: inquiry.breed ?? null,
            quantity: inquiry.quantity ?? null,
            timing: inquiry.timing ?? null,
            // Where the lead came from.
            source_page: inquiry.source ?? null,
            page_url: inquiry.source ?? null,
            submitted_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          }),
        }).then(() => {}).catch(() => {})
      )
    }
  }

  await Promise.allSettled(tasks)
}
