export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import { createHoneyProduct } from './actions'
import { MediaManager } from '@/components/admin/MediaManager'
import type { HoneyProduct } from '@/types'

export const metadata: Metadata = {
  title: 'Адмін — Мед',
  robots: 'noindex, nofollow',
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent'
const LABEL = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'
const VARIETIES = ['Акація', 'Липа', 'Сонях', "Різнотрав'я", 'Сади', 'Ліс']

export default async function AdminHoneyPage() {
  let products: HoneyProduct[] = []
  try {
    const client = getAdminClient()
    const { data } = await client.from('honey_products').select('*').order('name', { ascending: true })
    products = (data ?? []) as HoneyProduct[]
  } catch { /* env not configured */ }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Мед</h1>
        {products.length > 0 && (
          <p className="text-sm text-gray-500 mt-0.5">{products.length} позицій</p>
        )}
      </div>

      {products.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm text-center py-12 px-6 mb-8">
          <p className="text-gray-900 font-semibold mb-1">Продуктів ще немає</p>
          <p className="text-sm text-gray-500">Додайте перший продукт за допомогою форми нижче</p>
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
                    {product.price_plastic_uah ? `${product.price_plastic_uah} грн` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${product.status === 'available' ? 'bg-green-500' : product.status === 'preorder' ? 'bg-amber-400' : 'bg-gray-300'}`} title={product.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/admin/honey/${product.id}`}
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

      {/* Inline create form */}
      <div id="create" className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 max-w-2xl">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Додати мед</h2>
        <form action={createHoneyProduct} className="space-y-4">
          <div>
            <label className={LABEL}>Назва</label>
            <input name="name" type="text" required className={INPUT} />
          </div>

          <div>
            <label className={LABEL}>Сорт</label>
            <select name="variety" className={INPUT}>
              {VARIETIES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Ціна пластик (грн)</label>
              <input name="price_plastic_uah" type="number" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Ціна скло (грн)</label>
              <input name="price_glass_uah" type="number" className={INPUT} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Упаковка (через кому)</label>
            <input name="packaging" type="text" placeholder="1 л пластик, 1 л скло" className={INPUT} />
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

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="is_featured" className="w-4 h-4 rounded accent-gray-900" />
            <span className="text-sm font-medium text-gray-700">Топ-продукт</span>
          </label>

          <MediaManager initialMedia={[]} />

          <button type="submit"
            className="h-10 px-5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors text-sm">
            Додати
          </button>
        </form>
      </div>
    </div>
  )
}
