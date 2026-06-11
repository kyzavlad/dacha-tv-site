import { Resend } from 'resend'
import type { InquiryData } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  honey_order: 'Замовлення меду',
  beekeeper_inquiry: 'Заявка пасічника',
  general: 'Загальна заявка',
  natural_products: 'Натуральні продукти',
  metal: 'Металопрофіль / будматеріали',
}

function formatEmailHtml(inquiry: InquiryData): string {
  const typeLabel = TYPE_LABELS[inquiry.type] || inquiry.type
  const timestamp = new Intl.DateTimeFormat('uk-UA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Kiev',
  }).format(new Date())

  const fields: Array<{ label: string; value: string }> = [
    { label: "Ім'я", value: inquiry.name },
    { label: 'Телефон', value: inquiry.phone },
  ]

  if (inquiry.product) fields.push({ label: 'Продукт', value: inquiry.product })
  if (inquiry.packaging) fields.push({ label: 'Упаковка', value: inquiry.packaging })
  if (inquiry.breed) fields.push({ label: 'Порода', value: inquiry.breed })
  if (inquiry.quantity) fields.push({ label: 'Кількість', value: inquiry.quantity })
  if (inquiry.timing) fields.push({ label: 'Час', value: inquiry.timing })
  if (inquiry.message) fields.push({ label: 'Повідомлення', value: inquiry.message })

  const rows = fields
    .map(
      ({ label, value }) =>
        `<tr>
          <td style="padding: 8px 16px; font-weight: 600; white-space: nowrap; color: #92400e; background: #fef3c7; border-bottom: 1px solid #fde68a;">${label}</td>
          <td style="padding: 8px 16px; color: #1c1209; border-bottom: 1px solid #fde68a;">${value}</td>
        </tr>`
    )
    .join('')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'

  return `
    <!DOCTYPE html>
    <html lang="uk">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#fdf8f0;">
      <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <div style="background:#b45309;padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🍯 Дача TV — Нова заявка</h1>
          <p style="margin:8px 0 0;color:#fde68a;font-size:14px;">${typeLabel} · ${timestamp}</p>
        </div>
        <div style="padding:24px 32px;">
          <table style="width:100%;border-collapse:collapse;border:1px solid #fde68a;border-radius:8px;overflow:hidden;">
            ${rows}
          </table>
          <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
            <p style="margin:0;color:#166534;font-size:14px;">
              📱 <strong>Зателефонуйте клієнту якомога швидше</strong><br>
              <a href="tel:${inquiry.phone}" style="color:#15803d;font-size:18px;font-weight:700;">${inquiry.phone}</a>
            </p>
          </div>
          <div style="margin-top:16px;text-align:center;">
            <a href="${siteUrl}/admin" style="display:inline-block;padding:12px 24px;background:#b45309;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
              Відкрити дашборд
            </a>
          </div>
        </div>
        <div style="padding:16px 32px;background:#fef3c7;text-align:center;">
          <p style="margin:0;color:#92400e;font-size:12px;">© 2024 Дача TV — Натуральний мед від сімейної пасіки на Харківщині</p>
        </div>
      </div>
    </body>
    </html>
  `
}

export async function sendEmailNotification(inquiry: InquiryData): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const ownerEmail = process.env.OWNER_EMAIL

  if (!apiKey || !ownerEmail) {
    return
  }

  const resend = new Resend(apiKey)

  try {
    await resend.emails.send({
      from: 'Дача TV <notifications@dachatv.com>',
      to: ownerEmail,
      subject: `Нова заявка від ${inquiry.name} — Дача TV`,
      html: formatEmailHtml(inquiry),
    })
  } catch {
    // Non-blocking — do not propagate
  }
}
