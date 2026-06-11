export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import { createService } from './actions'
import { seedServicesAction } from '@/app/admin/actions/seed'
import type { Service } from '@/types'

export const metadata: Metadata = {
  title: 'Адмін — Послуги',
  robots: 'noindex, nofollow',
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent'
const LABEL = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'

export default async function AdminServicesPage() {
  let services: Service[] = []
  let tableError: string | null = null

  try {
    const client = getAdminClient()
    const { data, error } = await client.from('services').select('*').order('display_order', { ascending: true })
    if (error) {
      const isMissing = error.message.includes('does not exist') || error.message.includes('relation') || error.message.includes('schema cache')
      tableError = isMissing
        ? 'missing_table'
        : error.message
    } else {
      services = (data ?? []) as Service[]
    }
  } catch { /* env not configured */ }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Послуги</h1>
          {services.length > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">{services.length} позицій</p>
          )}
        </div>
        <form action={seedServicesAction}>
          <button type="submit" className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
            Синхронізувати дані
          </button>
        </form>
      </div>

      {tableError === 'missing_table' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
          <p className="font-semibold text-amber-800 mb-1">Таблиця services не існує в базі даних</p>
          <p className="text-sm text-amber-700 mb-3">
            Запустіть міграцію в Supabase SQL Editor, потім натисніть «Синхронізувати дані» вище.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-amber-700 font-medium mb-2">Показати SQL для запуску в Supabase</summary>
            <pre className="bg-amber-100 rounded p-3 overflow-x-auto text-amber-900 whitespace-pre-wrap">
{`create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  price_uah numeric,
  price_note text,
  duration_note text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  is_featured boolean not null default false,
  display_order integer not null default 0,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);`}
            </pre>
          </details>
        </div>
      )}

      {tableError && tableError !== 'missing_table' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-8">
          <p className="font-semibold text-red-700">Помилка підключення</p>
          <p className="text-sm text-red-600 mt-1 font-mono">{tableError}</p>
        </div>
      )}

      {!tableError && services.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm text-center py-10 px-6 mb-8">
          <p className="text-gray-900 font-semibold mb-1">Послуг ще немає</p>
          <p className="text-sm text-gray-500 mb-4">Натисніть «Синхронізувати дані» щоб додати стандартні послуги, або додайте вручну нижче.</p>
        </div>
      )}

      {services.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Назва</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Вартість</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Статус</th>
                <th className="px-5 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {services.map((service) => (
                <tr key={service.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{service.name}</td>
                  <td className="px-5 py-3.5 text-gray-500 hidden sm:table-cell">
                    {service.price_note ?? (service.price_uah != null ? `${service.price_uah} грн` : '—')}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${service.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`}
                      title={service.status}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/admin/services/${service.id}`} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                      Змін.
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div id="create" className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 max-w-2xl">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Додати послугу</h2>
        <form action={createService} className="space-y-4">
          <div>
            <label className={LABEL}>Назва *</label>
            <input name="name" type="text" required className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Короткий опис</label>
            <textarea name="short_description" rows={2} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Повний опис</label>
            <textarea name="description" rows={4} className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Ціна (грн)</label>
              <input name="price_uah" type="number" step="0.01" className={INPUT} placeholder="1000" />
            </div>
            <div>
              <label className={LABEL}>Примітка до ціни</label>
              <input name="price_note" type="text" className={INPUT} placeholder="₴1000 / година" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Тривалість</label>
              <input name="duration_note" type="text" className={INPUT} placeholder="Від 1 години" />
            </div>
            <div>
              <label className={LABEL}>Порядок відображення</label>
              <input name="display_order" type="number" className={INPUT} defaultValue="0" />
            </div>
          </div>
          <div>
            <label className={LABEL}>URL зображення</label>
            <input name="image_url" type="url" className={INPUT} placeholder="https://..." />
          </div>
          <div>
            <label className={LABEL}>Статус</label>
            <select name="status" className={INPUT}>
              <option value="active">Активна</option>
              <option value="inactive">Прихована</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="is_featured" name="is_featured" type="checkbox" className="rounded border-gray-300" />
            <label htmlFor="is_featured" className="text-sm text-gray-700">Виділена послуга</label>
          </div>
          <button type="submit" className="mt-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors">
            Додати послугу
          </button>
        </form>
      </div>
    </div>
  )
}
