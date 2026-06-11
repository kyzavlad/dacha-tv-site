'use client'

import { useState, useRef } from 'react'
import { formatDate } from '@/lib/utils'
import { formatPhoneTel, formatPhoneDisplay } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { StatusToggle } from './StatusToggle'
import type { Inquiry } from '@/types'

interface InquiryCardProps {
  inquiry: Inquiry
}

export function InquiryCard({ inquiry }: InquiryCardProps) {
  const [notes, setNotes] = useState(inquiry.notes ?? '')
  const [saving, setSaving] = useState(false)
  const lastSaved = useRef(inquiry.notes ?? '')

  async function saveNotes() {
    if (notes === lastSaved.current) return
    setSaving(true)
    try {
      await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inquiry.id, notes }),
      })
      lastSaved.current = notes
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="bg-white rounded-2xl border border-honey-100 shadow-sm p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={inquiry.status} />
          </div>
          <h3 className="font-semibold text-bark text-lg mt-1">{inquiry.name}</h3>
        </div>
        <time
          dateTime={inquiry.created_at}
          className="text-xs text-bark/50 whitespace-nowrap flex-shrink-0"
        >
          {formatDate(inquiry.created_at)}
        </time>
      </div>

      {/* Phone — large and tappable */}
      <div>
        <a
          href={`tel:${formatPhoneTel(inquiry.phone)}`}
          className="inline-flex items-center gap-2 text-honey-700 font-bold text-xl hover:text-honey-900 transition-colors min-h-[44px]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {formatPhoneDisplay(inquiry.phone)}
        </a>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-sm text-bark/80">
        {inquiry.product && (
          <div>
            <span className="font-medium text-bark/50">Продукт:</span>{' '}
            {inquiry.product}
          </div>
        )}
        {inquiry.source && (
          <div>
            <span className="font-medium text-bark/50">Джерело:</span>{' '}
            {inquiry.source}
          </div>
        )}
        {inquiry.message && (
          <div className="mt-2 p-3 bg-honey-50 rounded-lg">
            <span className="font-medium text-bark/50">Повідомлення:</span>
            <p className="mt-1 text-bark/80">{inquiry.message}</p>
          </div>
        )}
      </div>

      {/* Internal notes */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-bark/50 flex items-center justify-between">
          <span>Нотатки</span>
          {saving && <span className="text-honey-600">збереження…</span>}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Результат дзвінка, домовленості, деталі…"
          className="w-full text-sm rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-bark placeholder:text-bark/30 focus:outline-none focus:ring-2 focus:ring-honey-300 focus:border-honey-300 resize-none"
        />
      </div>

      {/* Status toggle */}
      <StatusToggle inquiryId={inquiry.id} currentStatus={inquiry.status as 'new' | 'contacted' | 'completed' | 'cancelled'} />
    </article>
  )
}
