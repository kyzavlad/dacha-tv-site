export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import { getProductMedia } from '@/lib/supabase/product-media'
import { MediaManager } from '@/components/admin/MediaManager'
import { updateHoneyProduct, deleteHoneyProduct } from '../actions'

interface Props {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: 'Адмін — Редагувати мед',
  robots: 'noindex, nofollow',
}

const VARIETIES = ['Акація', 'Липа', 'Сонях', "Різнотрав'я", 'Сади', 'Ліс']
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent'
const LABEL = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'

export default async function AdminHoneyEditPage({ params }: Props) {
  const { id } = await params

  let product: Record<string, unknown> | null = null
  let loadError: string | null = null
  let productMedia: Awaited<ReturnType<typeof getProductMedia>> = []

  try {
    const client = getAdminClient()
    const { data, error } = await client.from('honey_products').select('*').eq('id', id).single()
    if (error) loadError = error.message
    else {
      product = data as Record<string, unknown>
      productMedia = await getProductMedia('honey', id, client).catch(() => [])
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Помилка підключення'
  }

  if (!loadError && !product) notFound()

  if (loadError) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl">
        <Link href="/admin/honey" className="text-sm text-gray-500 hover:text-gray-900 mb-4 inline-block">← Назад</Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="font-semibold text-red-700">Помилка завантаження</p>
          <p className="text-sm text-red-600 mt-1 font-mono">{loadError}</p>
        </div>
      </div>
    )
  }

  const p = product!
  const updateWithId = updateHoneyProduct.bind(null, id)
  const deleteWithId = deleteHoneyProduct.bind(null, id)

  return (
    <div className="px-4 sm:px-6 py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/honey" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Мед</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium truncate">{String(p.name)}</span>
      </div>

      <form action={updateWithId} className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 space-y-5">
        <h1 className="text-base font-semibold text-gray-900">Редагувати мед</h1>

        <div>
          <label className={LABEL}>Назва</label>
          <input name="name" type="text" required defaultValue={String(p.name ?? '')} className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Сорт</label>
          <select name="variety" defaultValue={String(p.variety ?? "Різнотрав'я")} className={INPUT}>
            {VARIETIES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Ціна пластик (грн)</label>
            <input name="price_plastic_uah" type="number" defaultValue={String(p.price_plastic_uah ?? '')} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Ціна скло (грн)</label>
            <input name="price_glass_uah" type="number" defaultValue={String(p.price_glass_uah ?? '')} className={INPUT} />
          </div>
        </div>

        <div>
          <label className={LABEL}>Упаковка (через кому)</label>
          <input name="packaging" type="text" defaultValue={Array.isArray(p.packaging) ? (p.packaging as string[]).join(', ') : String(p.packaging ?? '')} className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Статус</label>
          <select name="status" defaultValue={String(p.status ?? 'available')} className={INPUT}>
            <option value="available">В наявності</option>
            <option value="preorder">Передзамовлення</option>
            <option value="out_of_stock">Немає в наявності</option>
            <option value="archived">Архів</option>
          </select>
        </div>

        <div>
          <label className={LABEL}>Короткий опис</label>
          <textarea name="short_description" rows={2} defaultValue={String(p.short_description ?? '')} className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Основний опис</label>
          <textarea name="description" rows={3} defaultValue={String(p.description ?? '')} className={INPUT} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Аромат</label>
            <input name="aroma_notes" type="text" defaultValue={String(p.aroma_notes ?? '')} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Смак</label>
            <input name="taste_notes" type="text" defaultValue={String(p.taste_notes ?? '')} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Колір</label>
            <input name="color_note" type="text" defaultValue={String(p.color_note ?? '')} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Кристалізація</label>
            <input name="crystallization_note" type="text" defaultValue={String(p.crystallization_note ?? '')} className={INPUT} />
          </div>
        </div>

        <div>
          <label className={LABEL}>Рекомендовано для</label>
          <input name="recommended_use" type="text" defaultValue={String(p.recommended_use ?? '')} className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Нотатка про упаковку</label>
          <input name="packaging_note" type="text" defaultValue={String(p.packaging_note ?? '')} className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Повний опис</label>
          <textarea name="full_description" rows={5} defaultValue={String(p.full_description ?? '')} className={INPUT} />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="is_featured" defaultChecked={Boolean(p.is_featured)} className="w-4 h-4 rounded accent-gray-900" />
          <span className="text-sm font-medium text-gray-700">Топ-продукт</span>
        </label>

        <MediaManager initialMedia={productMedia} productName={String(p.name ?? '')} />

        <button type="submit"
          className="w-full h-11 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors text-sm">
          Зберегти зміни
        </button>
      </form>

      <form action={deleteWithId} className="mt-3">
        <button type="submit"
          className="w-full h-10 bg-white text-red-600 border border-red-200 font-medium rounded-lg hover:bg-red-50 transition-colors text-sm">
          Видалити продукт
        </button>
      </form>
    </div>
  )
}
