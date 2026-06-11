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
