'use server'

import { z } from 'zod'
import { getSupabaseClient } from '@/lib/supabase/client'
import { sendTelegramNotification } from '@/lib/notifications/telegram'
import { sendEmailNotification } from '@/lib/notifications/email'
import type { InquiryData, ManualLeadType } from '@/types'

const ukrainianPhone = /^(\+380|0)\d{9}$/

const manualLeadSchema = z.object({
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z.string().regex(ukrainianPhone, 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)'),
  // Which thread the lead is routed to. Comes from the product's lead_type.
  leadType: z.enum(['natural_products', 'metal']),
  product: z.string().min(1).max(200),
  productSlug: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  options: z.string().max(4000).optional(),
  message: z.string().max(500, 'Повідомлення не може перевищувати 500 символів').optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0, 'Відмовлено'),
})

// Parse the product options JSON that the form forwards for n8n routing context.
// Best-effort: malformed input is simply dropped.
function parseOptions(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

type ActionResult = { success: true } | { success: false; error: string; fieldErrors?: Record<string, string[]> }

// Submit a lead/request for a manual catalog product (inquiry-only or
// no-price). Stored in `inquiries` and routed to the correct Telegram thread
// by lead_type (natural_products vs metal). This is intentionally separate from
// the normal cart/checkout flow — inquiry products never create supplier orders.
export async function submitManualLead(formData: FormData): Promise<ActionResult> {
  const raw = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    leadType: formData.get('leadType'),
    product: formData.get('product'),
    productSlug: formData.get('productSlug') ?? undefined,
    category: formData.get('category') ?? undefined,
    options: formData.get('options') ?? undefined,
    message: formData.get('message') ?? undefined,
    source: formData.get('source') ?? undefined,
    _honeypot: formData.get('_honeypot') ?? '',
  }

  const parsed = manualLeadSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[key] = errors ?? []
    }
    return { success: false, error: 'Перевірте правильність введених даних', fieldErrors }
  }

  const data = parsed.data
  const inquiryData: InquiryData = {
    type: data.leadType as ManualLeadType,
    name: data.name,
    phone: data.phone,
    product: data.product,
    product_title: data.product,
    product_slug: data.productSlug,
    category: data.category,
    options: parseOptions(data.options),
    message: data.message,
    source: data.source,
  }

  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('inquiries').insert({
      type: inquiryData.type,
      name: inquiryData.name,
      phone: inquiryData.phone,
      product: inquiryData.product ?? null,
      message: inquiryData.message ?? null,
      source: inquiryData.source ?? null,
    })

    if (error) {
      return { success: false, error: 'Не вдалося надіслати запит. Спробуйте ще раз або зателефонуйте нам.' }
    }
  } catch {
    return { success: false, error: 'Не вдалося надіслати запит. Спробуйте ще раз або зателефонуйте нам.' }
  }

  sendTelegramNotification(inquiryData).catch(() => {})
  sendEmailNotification(inquiryData).catch(() => {})

  return { success: true }
}
