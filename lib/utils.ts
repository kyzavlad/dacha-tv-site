import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('uk-UA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Kiev',
  }).format(date)
}

export function formatPhoneDisplay(phone: string): string {
  // Format +380XXXXXXXXX as +380 XX XXX XX XX
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('380') && cleaned.length === 12) {
    return `+380 ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8, 10)} ${cleaned.slice(10)}`
  }
  return phone
}

export function formatPhoneTel(phone: string): string {
  // Ensure phone is in tel: href format
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('380')) {
    return `+${cleaned}`
  }
  if (cleaned.startsWith('0')) {
    return `+38${cleaned}`
  }
  return phone
}

// Canonical Ukrainian mobile: +380XXXXXXXXX (12 digits after +).
// Accepts 0XXXXXXXXX, +380XXXXXXXXX, 380XXXXXXXXX, and spaced/dashed variants.
// Returns null for anything that can't be a valid Ukrainian number.
export function normalizeUkrainianPhone(input: string | null | undefined): string | null {
  if (!input) return null
  const digits = input.replace(/\D/g, '')
  let national: string
  if (digits.length === 12 && digits.startsWith('380')) {
    national = digits.slice(2) // "380951..." → "0951..."
  } else if (digits.length === 10 && digits.startsWith('0')) {
    national = digits
  } else {
    return null
  }
  if (!/^0\d{9}$/.test(national)) return null
  return `+38${national}`
}

export function isValidUkrainianPhone(input: string | null | undefined): boolean {
  return normalizeUkrainianPhone(input) !== null
}
