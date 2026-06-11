export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import { updateService, deleteService } from '../actions'
import type { Service } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: 'Адмін — Редагувати послугу',
  robots: 'noindex, nofollow',
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent'
const LABEL = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'

export default async function AdminServiceEditPage({ params }: Props) {
  const { id } = await params

  let service: Service | null = null
  let loadError: string | null = null

  try {
    const client = getAdminClient()
    const { data, error } = await client.from('services').select('*').eq('id', id).single()
    if (error) loadError = error.message
    else service = data as Service
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Помилка підключення'
  }

  if (!loadError && !service) notFound()

  if (loadError) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl">
        <Link href="/admin/services" className="text-sm text-gray-500 hover:text-gray-900 mb-4 inline-block">← Назад</Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="font-semibold text-red-700">Помилка завантаження</p>
          <p className="text-sm text-red-600 mt-1 font-mono">{loadError}</p>
        </div>
      </div>
    )
  }

  const s = service!
  const updateWithId = updateService.bind(null, id)
  const deleteWithId = deleteService.bind(null, id)

  return (
    <div className="px-4 sm:px-6 py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/services" className="text-sm text-gray-500 hover:text-gray-900">← Назад</Link>
        <h1 className="text-xl font-bold text-gray-900">{s.name}</h1>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 mb-6">
        <form action={updateWithId} className="space-y-4">
          <div>
            <label className={LABEL}>Назва *</label>
            <input name="name" type="text" required defaultValue={s.name} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Короткий опис</label>
            <textarea name="short_description" rows={2} defaultValue={s.short_description ?? ''} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Повний опис</label>
            <textarea name="description" rows={5} defaultValue={s.description ?? ''} className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Ціна (грн)</label>
              <input name="price_uah" type="number" step="0.01" defaultValue={s.price_uah ?? ''} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Примітка до ціни</label>
              <input name="price_note" type="text" defaultValue={s.price_note ?? ''} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Тривалість</label>
              <input name="duration_note" type="text" defaultValue={s.duration_note ?? ''} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Порядок відображення</label>
              <input name="display_order" type="number" defaultValue={s.display_order} className={INPUT} />
            </div>
          </div>
          <div>
            <label className={LABEL}>URL зображення</label>
            <input name="image_url" type="url" defaultValue={s.image_url ?? ''} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Статус</label>
            <select name="status" defaultValue={s.status} className={INPUT}>
              <option value="active">Активна</option>
              <option value="inactive">Прихована</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="is_featured" name="is_featured" type="checkbox" defaultChecked={s.is_featured} className="rounded border-gray-300" />
            <label htmlFor="is_featured" className="text-sm text-gray-700">Виділена послуга</label>
          </div>
          <button type="submit" className="mt-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors">
            Зберегти
          </button>
        </form>
      </div>

      <div className="bg-white border border-red-100 rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-red-700 mb-3">Небезпечна зона</h2>
        <form action={deleteWithId}>
          <button type="submit" className="bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-red-700 transition-colors">
            Видалити послугу
          </button>
        </form>
      </div>
    </div>
  )
}
