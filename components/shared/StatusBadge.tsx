import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: {
    label: 'Нова',
    className: 'bg-honey-100 text-honey-800 border-honey-300',
  },
  contacted: {
    label: 'Зателефонований',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  completed: {
    label: 'Виконано',
    className: 'bg-forest-100 text-forest-800 border-forest-300',
  },
  cancelled: {
    label: 'Скасовано',
    className: 'bg-gray-100 text-gray-600 border-gray-300',
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-600 border-gray-300',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
