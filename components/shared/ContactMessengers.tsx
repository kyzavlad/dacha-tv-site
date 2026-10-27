import { LAUNCH_TELEGRAM_URL, LAUNCH_WHATSAPP_URL } from '@/lib/launch-defaults'
import { cn } from '@/lib/utils'
import type { Locale } from '@/lib/i18n'

const LABELS = {
  uk: { group: 'Швидкий зв’язок', telegram: 'Написати в Telegram', whatsapp: 'Написати у WhatsApp' },
  ru: { group: 'Быстрая связь', telegram: 'Написать в Telegram', whatsapp: 'Написать в WhatsApp' },
  en: { group: 'Quick contact', telegram: 'Message on Telegram', whatsapp: 'Message on WhatsApp' },
}

export function ContactMessengers({
  locale = 'uk',
  iconOnly = false,
  className,
}: {
  locale?: Locale
  iconOnly?: boolean
  className?: string
}) {
  const labels = LABELS[locale]
  const linkClass = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2'

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="group" aria-label={labels.group}>
      <a href={LAUNCH_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label={labels.telegram} title={labels.telegram}
        className={cn(linkClass, 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 focus-visible:outline-sky-700')}>
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21.9 3.1 18.4 20c-.3 1.2-1 1.5-2 1l-5.3-3.9-2.6 2.5c-.3.3-.5.5-1 .5l.4-5.4 9.8-8.8c.4-.4-.1-.6-.6-.3L5 13.2-.2 11.6c-1.1-.3-1.1-1.1.2-1.6L20.4 2c1-.4 1.9.2 1.5 1.1Z" transform="translate(1 0) scale(.95)" />
        </svg>
        <span className={iconOnly ? 'sr-only' : undefined}>Telegram</span>
      </a>
      <a href={LAUNCH_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label={labels.whatsapp} title={labels.whatsapp}
        className={cn(linkClass, 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 focus-visible:outline-emerald-700')}>
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.5 3.5A11.9 11.9 0 0 0 1.8 17.8L.2 23.6l6-1.6A11.9 11.9 0 0 0 24 11.9c0-3.2-1.2-6.2-3.5-8.4Zm-8.4 18.3a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.6.9.9-3.5-.2-.4A9.9 9.9 0 1 1 22 11.9c0 5.5-4.4 9.9-9.9 9.9Zm5.4-7.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1a8.1 8.1 0 0 1-2.4-1.5 9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.6l-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.1 1.1-1.1 2.6 1.1 3 1.3 3.2c.2.2 2.2 3.4 5.4 4.8.8.3 1.3.5 1.8.6.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4Z" />
        </svg>
        <span className={iconOnly ? 'sr-only' : undefined}>WhatsApp</span>
      </a>
    </div>
  )
}
