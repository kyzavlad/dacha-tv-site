export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import type { CatalogCategory } from '@/types'
import { createCatalogCategoryAction, publishCategoryAction, unpublishCategoryAction, deleteCategoryAction, bulkActivateFromSupplierAction, fixNumericCategoryNamesAction } from './actions'

export const metadata: Metadata = { title: 'Адмін: Категорії каталогу', robots: 'noindex, nofollow' }

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400'

export default async function CatalogCategoriesPage() {
  let categories: CatalogCategory[] = []
  let errorMsg: string | null = null
  let tablesMissing = false
  let supplierCategoryCount = 0

  try {
    const client = getAdminClient()
    const [cats, scCount] = await Promise.all([
      client
        .from('catalog_categories')
        .select('*')
        .order('is_published', { ascending: false })
        .order('display_order', { ascending: true })
        .order('name_ua', { ascending: true }),
      client.from('supplier_categories').select('id', { count: 'exact', head: true }),
    ])

    if (cats.error) {
      if (cats.error.message.includes('does not exist') || cats.error.message.includes('relation')) {
        tablesMissing = true
      } else {
        errorMsg = cats.error.message
      }
    } else {
      categories = (cats.data ?? []) as CatalogCategory[]
      supplierCategoryCount = scCount.count ?? 0
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : 'Помилка завантаження'
  }

  const publishedCount = categories.filter((c) => c.is_published).length

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Категорії каталогу</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {publishedCount} опублікованих · {categories.length - publishedCount} прихованих
            {supplierCategoryCount > 0 && ` · ${supplierCategoryCount} у постачальника`}
          </p>
        </div>
        <Link
          href="/admin/catalog/pipeline"
          className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 px-3 py-2 rounded-lg transition-colors"
        >
          → Пайплайн імпорту
        </Link>
      </div>

      {categories.filter((c) => /^\d+$/.test(c.name_ua)).length > 0 && !tablesMissing && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
          <p className="font-semibold text-orange-800">
            {categories.filter((c) => /^\d+$/.test(c.name_ua)).length} категорій з числовою назвою
          </p>
          <p className="text-sm text-orange-700 mt-1 mb-3">
            Назви збереглись як числові ID замість реальних. Натисніть щоб виправити з даних постачальника.
          </p>
          <form action={fixNumericCategoryNamesAction}>
            <button type="submit" className="text-sm font-medium bg-orange-700 text-white px-4 py-2 rounded-lg hover:bg-orange-800 transition-colors">
              Виправити числові назви
            </button>
          </form>
        </div>
      )}

      {tablesMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <p className="font-semibold text-amber-800">Таблиця catalog_categories не існує</p>
          <p className="text-sm text-amber-700 mt-1">Запустіть міграції 037–040 у Supabase SQL Editor.</p>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
          <p className="font-semibold text-red-700">Помилка</p>
          <p className="text-sm text-red-600 font-mono mt-1">{errorMsg}</p>
        </div>
      )}

      {!tablesMissing && supplierCategoryCount > 0 && categories.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <p className="font-semibold text-blue-800 mb-2">Є {supplierCategoryCount} категорій постачальника</p>
          <p className="text-sm text-blue-700 mb-3">
            Активуйте перші N категорій автоматично, або скористайтесь{' '}
            <Link href="/admin/catalog/pipeline" className="underline">Пайплайном (Кроки 1→3)</Link>.
          </p>
          <form action={bulkActivateFromSupplierAction} className="flex items-center gap-3">
            <input
              name="limit"
              type="number"
              min="1"
              max="50"
              defaultValue="10"
              className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm w-20"
            />
            <button
              type="submit"
              className="bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors"
            >
              Активувати перші N
            </button>
          </form>
        </div>
      )}

      {categories.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400">Назва</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400 hidden sm:table-cell">Slug</th>
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400 hidden md:table-cell">Опис</th>
                  <th className="text-center px-5 py-2.5 text-xs font-medium text-gray-400">Статус</th>
                  <th className="px-5 py-2.5 w-36"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categories.map((cat) => {
                  const pub = publishCategoryAction.bind(null, cat.id)
                  const unpub = unpublishCategoryAction.bind(null, cat.id)
                  const del = deleteCategoryAction.bind(null, cat.id)
                  return (
                    <tr key={cat.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-900">{cat.name_ua}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500 hidden sm:table-cell">{cat.slug}</td>
                      <td className="px-5 py-3 text-xs text-gray-400 max-w-[200px] truncate hidden md:table-cell" title={cat.description ?? ''}>
                        {cat.description || '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cat.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {cat.is_published ? 'Публічна' : 'Чернетка'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {cat.is_published ? (
                            <form action={unpub}>
                              <button type="submit" className="text-xs text-gray-500 hover:text-gray-800 font-medium transition-colors">Сховати</button>
                            </form>
                          ) : (
                            <form action={pub}>
                              <button type="submit" className="text-xs text-green-700 hover:text-green-900 font-medium transition-colors">Опублікувати</button>
                            </form>
                          )}
                          <form action={del}>
                            <button type="submit" className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">Видалити</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!tablesMissing && !errorMsg && categories.length === 0 && supplierCategoryCount === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
          <p className="text-gray-900 font-semibold mb-1">Категорій ще немає</p>
          <p className="text-sm text-gray-500 mb-4">Спочатку синхронізуйте категорії у Пайплайні (Кроки 1 → 3).</p>
          <Link href="/admin/catalog/pipeline" className="text-sm font-medium text-bark hover:underline">Відкрити Пайплайн →</Link>
        </div>
      )}

      {!tablesMissing && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Додати категорію вручну</h2>
          <form action={createCatalogCategoryAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Назва (UA) *</label>
              <input name="name_ua" required className={INPUT} placeholder="Садовий інвентар" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Slug (URL)</label>
              <input name="slug" className={INPUT} placeholder="sadovyi-inventar (авто якщо порожньо)" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Опис</label>
              <textarea name="description" rows={2} className={INPUT} placeholder="Короткий опис категорії для публічної сторінки" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Meta Title</label>
              <input name="meta_title" className={INPUT} placeholder="SEO заголовок" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Meta Description</label>
              <input name="meta_description" className={INPUT} placeholder="SEO опис" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">ID категорії постачальника</label>
              <input name="supplier_category_id" className={INPUT} placeholder="напр. 42 (з таблиці supplier_categories)" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">URL зображення</label>
              <input name="image_url" type="url" className={INPUT} placeholder="https://..." />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Зберегти категорію
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
