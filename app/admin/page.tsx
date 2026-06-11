export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { getAdminClient } from '@/lib/supabase/admin'
import { InquiryCard } from '@/components/admin/InquiryCard'
import type { Inquiry, InquiryStatus } from '@/types'

export const metadata: Metadata = {
  title: 'Адмін — Заявки',
  robots: 'noindex, nofollow',
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Всі' },
  { value: 'new', label: 'Нові' },
  { value: 'contacted', label: 'Зателефонований' },
  { value: 'completed', label: 'Виконано' },
  { value: 'cancelled', label: 'Скасовано' },
]

const VALID_STATUSES = ['new', 'contacted', 'completed', 'cancelled']

interface AdminPageProps {
  searchParams: Promise<{ status?: string }>
}

function normalizeInquiry(row: Record<string, unknown>): Inquiry {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    product: (row.product as string) ?? null,
    message: (row.message as string) ?? null,
    source: (row.source as string) ?? null,
    status: String(row.status ?? 'new'),
    notes: (row.notes as string) ?? null,
    created_at: String(row.created_at ?? ''),
  }
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { status = 'all' } = await searchParams
  const safeStatus = VALID_STATUSES.includes(status) ? status : 'all'

  let inquiries: Inquiry[] = []
  let error: string | null = null
  let errorDetail: string | null = null
  let missingEnv = false

  try {
    const supabase = getAdminClient()
    // Use select('*') — returns only columns that exist, no column-missing errors
    let query = supabase
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false })

    if (safeStatus !== 'all') {
      query = query.eq('status', safeStatus as InquiryStatus)
    }

    const { data, error: dbError } = await query

    if (dbError) {
      error = 'Не вдалося завантажити заявки'
      errorDetail = dbError.message
    } else {
      inquiries = (data ?? []).map(normalizeInquiry)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Missing Supabase') || msg.includes('credentials') || msg.includes('not configured')) {
      missingEnv = true
      error = 'Supabase не налаштовано'
      errorDetail = 'Встановіть NEXT_PUBLIC_SUPABASE_URL та SUPABASE_SERVICE_ROLE_KEY у Vercel.'
    } else {
      error = 'Помилка з\'єднання з базою даних'
      errorDetail = msg
    }
  }

  const newCount = inquiries.filter((i) => i.status === 'new').length

  return (
    <div className="px-4 sm:px-6 py-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Заявки</h1>
        {newCount > 0 && (
          <p className="text-sm text-gray-500 mt-0.5">{newCount} нових</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map(({ value, label }) => (
          <a
            key={value}
            href={`/admin${value !== 'all' ? `?status=${value}` : ''}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] flex items-center ${
              safeStatus === value || (value === 'all' && safeStatus === 'all')
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6 space-y-2">
          <p className="text-red-700 font-semibold">{error}</p>
          {errorDetail && (
            <p className="text-red-600 text-sm font-mono break-all">{errorDetail}</p>
          )}
          {missingEnv && (
            <p className="text-red-600 text-sm">
              Потрібні:{' '}
              <code className="bg-red-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
              <code className="bg-red-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>
            </p>
          )}
          {errorDetail?.includes('does not exist') && (
            <p className="text-red-600 text-sm">
              Таблиця не знайдена. Виконайте початкову міграцію в Supabase SQL editor.
            </p>
          )}
        </div>
      )}

      {!error && inquiries.length === 0 && (
        <div className="text-center py-16">
          <p className="text-bark/50 text-lg">Заявок немає</p>
        </div>
      )}

      {inquiries.length > 0 && (
        <div className="space-y-4">
          {inquiries.map((inquiry) => (
            <InquiryCard key={inquiry.id} inquiry={inquiry} />
          ))}
        </div>
      )}
    </div>
  )
}
