export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import { createFlowerProduct } from './actions'
import { MediaManager } from '@/components/admin/MediaManager'
import type { FlowerProduct } from '@/types'

export const metadata: Metadata = {
  title: 'Адмін — Квіти',
  robots: 'noindex, nofollow',
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent'
const LABEL = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'

export default async function AdminFlowersPage() {
  let products: FlowerProduct[] = []
  let dbError: string | null = null

  try {
    const client = getAdminClient()
    const { data, error } = await client
      .from('flower_products')
      .select('*')
      .order('variety', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (error) dbError = error.message
    else products = (data ?? []) as FlowerProduct[]
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'Помилка підключення'
  }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Квіти</h1>
        {products.length > 0 && (
          <p className="text-sm text-gray-500 mt-0.5">{products.length} позицій</p>
        )}
      </div>

      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-red-700">Помилка бази даних</p>
          <p className="text-xs text-red-600 mt-1 font-mono break-all">{dbError}</p>
        </div>
      )}

      {!dbError && products.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm text-center py-12 px-6 mb-8">
          <p className="text-gray-900 font-semibold mb-1">Квітів ще немає в базі</p>
          <p className="text-sm text-gray-500">Додайте першу квітку за допомогою форми нижче</p>
        </div>
      )}

      {products.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Назва</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Ціна</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Статус</th>
                <th className="px-5 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{product.name}</td>
                  <td className="px-5 py-3.5 text-gray-500 hidden sm:table-cell">
                    {product.price_uah != null ? `${product.price_uah} грн` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${product.status === 'available' ? 'bg-green-500' : product.status === 'preorder' ? 'bg-amber-400' : 'bg-gray-300'}`} title={product.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/admin/flowers/${product.id}`}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                      Змін.
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!dbError && (
        <div id="create" className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 max-w-2xl">
          <h2 className="text-base font-semibold text-gray-900 mb-5">Додати квітку</h2>
          <form action={createFlowerProduct} className="space-y-4">
            <div>
              <label className={LABEL}>Назва</label>
              <input name="name" type="text" required className={INPUT} />
            </div>

            <div>
              <label className={LABEL}>Категорія</label>
              <select name="category" defaultValue="chrysanthemum" className={INPUT}>
                <option value="chrysanthemum">Хризантема</option>
                <option value="other">Інше</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Сорт</label>
                <input name="variety" type="text" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Колір</label>
                <input name="color" type="text" className={INPUT} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Ціна (грн)</label>
                <input name="price_uah" type="number" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Сезон цвітіння</label>
                <input name="bloom_season" type="text" className={INPUT} />
              </div>
            </div>

            <div>
              <label className={LABEL}>Статус</label>
              <select name="status" defaultValue="available" className={INPUT}>
                <option value="available">В наявності</option>
                <option value="preorder">Передзамовлення</option>
                <option value="out_of_stock">Немає в наявності</option>
                <option value="archived">Архів</option>
              </select>
            </div>

            <div>
              <label className={LABEL}>Короткий опис</label>
              <textarea name="short_description" rows={2} className={INPUT} />
            </div>

            <div>
              <label className={LABEL}>Повний опис</label>
              <textarea name="full_description" rows={3} className={INPUT} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Висота (см)</label>
                <input name="height_cm" type="number" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Освітлення</label>
                <input name="lighting" type="text" className={INPUT} />
              </div>
            </div>

            <div>
              <label className={LABEL}>Упаковка / примітка</label>
              <input name="packaging_note" type="text" className={INPUT} />
            </div>

            <MediaManager initialMedia={[]} />

            <button type="submit"
              className="h-10 px-5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors text-sm">
              Додати
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
