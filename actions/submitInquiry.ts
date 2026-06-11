'use server'

import { z } from 'zod'
import { getSupabaseClient } from '@/lib/supabase/client'
import { sendTelegramNotification } from '@/lib/notifications/telegram'
import { sendEmailNotification } from '@/lib/notifications/email'
import type { InquiryData } from '@/types'

const ukrainianPhone = /^(\+380|0)\d{9}$/

const honeyOrderSchema = z.object({
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z
    .string()
    .regex(ukrainianPhone, 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)'),
  product: z.string().min(1, 'Оберіть продукт'),
  packaging: z.string().optional(),
  quantity: z.string().optional(),
  message: z.string().max(500, 'Повідомлення не може перевищувати 500 символів').optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0, 'Відмовлено'),
})

const beekeeperInquirySchema = z.object({
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z
    .string()
    .regex(ukrainianPhone, 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)'),
  productType: z.string().min(1, 'Оберіть тип продукту'),
  breed: z.string().optional(),
  quantity: z.string().optional(),
  timing: z.string().optional(),
  message: z.string().max(500, 'Повідомлення не може перевищувати 500 символів').optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0, 'Відмовлено'),
})

const generalContactSchema = z.object({
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z
    .string()
    .regex(ukrainianPhone, 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)'),
  message: z.string().max(500, 'Повідомлення не може перевищувати 500 символів').optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0, 'Відмовлено'),
})

type ActionResult = { success: true } | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function submitHoneyOrder(formData: FormData): Promise<ActionResult> {
  const raw = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    product: formData.get('product'),
    packaging: formData.get('packaging'),
    quantity: formData.get('quantity'),
    message: formData.get('message'),
    source: formData.get('source'),
    _honeypot: formData.get('_honeypot') ?? '',
  }

  const parsed = honeyOrderSchema.safeParse(raw)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[key] = errors ?? []
    }
    return { success: false, error: 'Перевірте правильність введених даних', fieldErrors }
  }

  const data = parsed.data
  const inquiryData: InquiryData = {
    type: 'honey_order',
    name: data.name,
    phone: data.phone,
    product: data.product,
    packaging: data.packaging,
    quantity: data.quantity,
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
      packaging: inquiryData.packaging ?? null,
      quantity: inquiryData.quantity ?? null,
      message: inquiryData.message ?? null,
      source: inquiryData.source ?? null,
    })

    if (error) {
      return { success: false, error: 'Не вдалося зберегти заявку. Будь ласка, спробуйте ще раз або зателефонуйте нам.' }
    }
  } catch {
    return { success: false, error: 'Не вдалося зберегти заявку. Будь ласка, спробуйте ще раз або зателефонуйте нам.' }
  }

  sendTelegramNotification(inquiryData).catch(() => {})
  sendEmailNotification(inquiryData).catch(() => {})

  return { success: true }
}

export async function submitBeekeeperInquiry(formData: FormData): Promise<ActionResult> {
  const raw = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    productType: formData.get('productType'),
    breed: formData.get('breed'),
    quantity: formData.get('quantity'),
    timing: formData.get('timing'),
    message: formData.get('message'),
    source: formData.get('source'),
    _honeypot: formData.get('_honeypot') ?? '',
  }

  const parsed = beekeeperInquirySchema.safeParse(raw)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[key] = errors ?? []
    }
    return { success: false, error: 'Перевірте правильність введених даних', fieldErrors }
  }

  const data = parsed.data
  const inquiryData: InquiryData = {
    type: 'beekeeper_inquiry',
    name: data.name,
    phone: data.phone,
    product: data.productType,
    breed: data.breed,
    quantity: data.quantity,
    timing: data.timing,
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
      breed: inquiryData.breed ?? null,
      quantity: inquiryData.quantity ?? null,
      timing: inquiryData.timing ?? null,
      message: inquiryData.message ?? null,
      source: inquiryData.source ?? null,
    })

    if (error) {
      return { success: false, error: 'Не вдалося зберегти заявку. Будь ласка, спробуйте ще раз або зателефонуйте нам.' }
    }
  } catch {
    return { success: false, error: 'Не вдалося зберегти заявку. Будь ласка, спробуйте ще раз або зателефонуйте нам.' }
  }

  sendTelegramNotification(inquiryData).catch(() => {})
  sendEmailNotification(inquiryData).catch(() => {})

  return { success: true }
}

export async function submitGeneralContact(formData: FormData): Promise<ActionResult> {
  const raw = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    message: formData.get('message'),
    source: formData.get('source'),
    _honeypot: formData.get('_honeypot') ?? '',
  }

  const parsed = generalContactSchema.safeParse(raw)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[key] = errors ?? []
    }
    return { success: false, error: 'Перевірте правильність введених даних', fieldErrors }
  }

  const data = parsed.data
  const inquiryData: InquiryData = {
    type: 'general',
    name: data.name,
    phone: data.phone,
    message: data.message,
    source: data.source,
  }

  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('inquiries').insert({
      type: inquiryData.type,
      name: inquiryData.name,
      phone: inquiryData.phone,
      message: inquiryData.message ?? null,
      source: inquiryData.source ?? null,
    })

    if (error) {
      return { success: false, error: 'Не вдалося зберегти заявку. Будь ласка, спробуйте ще раз або зателефонуйте нам.' }
    }
  } catch {
    return { success: false, error: 'Не вдалося зберегти заявку. Будь ласка, спробуйте ще раз або зателефонуйте нам.' }
  }

  sendTelegramNotification(inquiryData).catch(() => {})
  sendEmailNotification(inquiryData).catch(() => {})

  return { success: true }
}

const flowerInquirySchema = z.object({
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z
    .string()
    .regex(ukrainianPhone, 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)'),
  product: z.string().optional(),
  message: z.string().max(500, 'Повідомлення не може перевищувати 500 символів').optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0, 'Відмовлено'),
})

export async function submitFlowerInquiry(formData: FormData): Promise<ActionResult> {
  const raw = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    product: formData.get('product'),
    message: formData.get('message'),
    source: formData.get('source'),
    _honeypot: formData.get('_honeypot') ?? '',
  }

  const parsed = flowerInquirySchema.safeParse(raw)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const [key, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[key] = errors ?? []
    }
    return { success: false, error: 'Перевірте правильність введених даних', fieldErrors }
  }

  const data = parsed.data
  const inquiryData: InquiryData = {
    type: 'flower_inquiry',
    name: data.name,
    phone: data.phone,
    product: data.product,
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
      return { success: false, error: 'Не вдалося зберегти заявку. Спробуйте ще раз або зв\'яжіться з нами.' }
    }
  } catch {
    return { success: false, error: 'Не вдалося зберегти заявку. Спробуйте ще раз або зв\'яжіться з нами.' }
  }

  sendTelegramNotification(inquiryData).catch(() => {})
  sendEmailNotification(inquiryData).catch(() => {})

  return { success: true }
}

export async function updateInquiryStatus(
  id: string,
  status: 'new' | 'contacted' | 'completed' | 'cancelled'
): Promise<ActionResult> {
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('inquiries')
      .update({ status })
      .eq('id', id)

    if (error) {
      return { success: false, error: 'Не вдалося оновити статус' }
    }

    return { success: true }
  } catch {
    return { success: false, error: 'Не вдалося оновити статус' }
  }
}
