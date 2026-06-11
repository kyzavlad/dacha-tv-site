export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import { createBeekeeperProduct } from './actions'
import { MediaManager } from '@/components/admin/MediaManager'

export const metadata: Metadata = {
  title: 'Адмін — Пасічникам',
  robots: 'noindex, nofollow',
}

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent'
const LABEL = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'

interface BKProduct { id: string; name: string; product_type: string; status: string; price_uah: number | null }

export default async function AdminBeekeeperPage() {
  let products: BKProduct[] = []
  try {
    const client = getAdminClient()
    const { data } = await client.from('beekeeper_products').select('*').order('product_type', { ascending: true }).order('name', { ascending: true })
    products = (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? ''),
      product_type: String(r.product_type ?? ''),
      status: String(r.status ?? 'available'),
      price_uah: r.price_uah != null ? Number(r.price_uah) : null,
    }))
  } catch { /* env not configured */ }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Пасічникам</h1>
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
                  <td className="px-5 py-3.5 text-gray-500 hidden sm:table-cell">{product.price_uah != null ? `${product.price_uah} грн` : '—'}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${product.status === 'available' ? 'bg-green-500' : product.status === 'preorder' ? 'bg-amber-400' : 'bg-gray-300'}`} title={product.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/admin/beekeeper/${product.id}`}
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

      <div id="create" className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 max-w-2xl">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Додати продукт</h2>
        <form action={createBeekeeperProduct} className="space-y-4">
          <div>
            <label className={LABEL}>Назва</label>
            <input name="name" type="text" required className={INPUT} />
          </div>

          <div>
            <label className={LABEL}>Тип продукту</label>
            <select name="product_type" defaultValue="bee_packages" className={INPUT}>
              <option value="bee_packages">Бджолопакети</option>
              <option value="bee_colonies">Бджолосім'ї</option>
              <option value="empty_hives">Порожні вулики</option>
              <option value="hives_with_bees">Вулики з бджолами</option>
              <option value="apiary_supply">Товари пасічника</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Породи (через кому)</label>
              <input name="breeds" type="text" placeholder="Buckfast, Карніка" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Примітка про сезон</label>
              <input name="season_note" type="text" placeholder="Доступні з квітня по серпень" className={INPUT} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Ціна (грн)</label>
              <input name="price_uah" type="number" step="1" min="0" placeholder="0" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Примітка до ціни</label>
              <input name="price_note" type="text" placeholder="від / за сім'ю / тощо" className={INPUT} />
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
            <label className={LABEL}>Опис</label>
            <textarea name="description" rows={3} className={INPUT} />
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
