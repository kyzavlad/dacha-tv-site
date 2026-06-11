'use client'

import { useState, useTransition } from 'react'
import { updateInquiryStatus } from '@/actions/submitInquiry'
import { cn } from '@/lib/utils'
import type { InquiryStatus } from '@/types'

interface StatusToggleProps {
  inquiryId: string
  currentStatus: InquiryStatus
}

const STATUSES: Array<{ value: InquiryStatus; label: string; className: string }> = [
  { value: 'new', label: 'Нова', className: 'bg-honey-100 text-honey-800 border-honey-300 hover:bg-honey-200' },
  { value: 'contacted', label: 'Зателефонований', className: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200' },
  { value: 'completed', label: 'Виконано', className: 'bg-forest-100 text-forest-800 border-forest-300 hover:bg-forest-200' },
  { value: 'cancelled', label: 'Скасовано', className: 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200' },
]

export function StatusToggle({ inquiryId, currentStatus }: StatusToggleProps) {
  const [status, setStatus] = useState<InquiryStatus>(currentStatus)
  const [isPending, startTransition] = useTransition()

  function handleStatusChange(newStatus: InquiryStatus) {
    if (newStatus === status) return

    startTransition(async () => {
      const result = await updateInquiryStatus(inquiryId, newStatus)
      if (result.success) {
        setStatus(newStatus)
      }
    })
  }

  return (
    <div>
      <p className="text-xs text-bark/50 font-medium mb-2 uppercase tracking-wide">
        Статус
      </p>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map(({ value, label, className }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleStatusChange(value)}
            disabled={isPending}
            className={cn(
              'px-3 py-2 rounded-lg text-sm font-semibold border transition-all',
              'min-h-[44px] min-w-[44px]',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              status === value
                ? cn(className, 'ring-2 ring-offset-1 ring-current')
                : cn(className, 'opacity-60')
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
