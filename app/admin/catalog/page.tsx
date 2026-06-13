export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import { publishProductAction, unpublishProductAction, bulkApproveFirstN } from './actions'
import type { CatalogProduct, SupplierProduct } from '@/types'

export const metadata: Metadata = {
  title: 'Адмін: Каталог',
  robots: 'noindex, nofollow',
}

const STATUS_LABEL: Record<string, string> = {
  published: 'Опублікований',
  draft: 'Чернетка',
  archived: 'Архів',
}

const PAGE_SIZE = 50

interface PageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function AdminCatalogPage({ searchParams }: PageProps) {
  const { page: pageRaw } = await searchParams
  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let catalogProducts: CatalogProduct[] = []
  let pendingApproval: SupplierProduct[] = []
  let publishedCount = 0   // real total across the whole table
  let draftCount = 0       // real total across the whole table
  let totalCount = 0       // published + draft + archived
  let pendingCount = 0
  let tablesMissing = false

  try {
    const client = getAdminClient()
    const [catalog, pending, publishedHead, draftHead, totalHead] = await Promise.all([
      client
        .from('catalog_products')
        .select('*')
        .order('status', { ascending: true })
        .order('display_order', { ascending: true })
        .range(from, to),
      client
        .from('supplier_products')
        .select('*')
        .eq('is_approved', false)
        .eq('is_in_stock', true)
        .not('main_image_url', 'is', null)
        .order('publish_priority', { ascending: false })
        .limit(50),
      client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      client.from('catalog_products').select('id', { count: 'exact', head: true }),
    ])

    if (catalog.error?.message.includes('does not exist') || catalog.error?.message.includes('relation')) {
      tablesMissing = true
    } else {
      catalogProducts = (catalog.data ?? []) as CatalogProduct[]
      pendingApproval = (pending.data ?? []) as SupplierProduct[]
      publishedCount = publishedHead.count ?? 0
      draftCount = draftHead.count ?? 0
      totalCount = totalHead.count ?? 0
      pendingCount = pendingApproval.length
    }
  } catch { /* env not set */ }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const bulkApprove100 = bulkApproveFirstN.bind(null, 100)

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Публічний каталог</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {publishedCount} опублікованих · {draftCount} у чернетці · {totalCount} всього
          </p>
        </div>
        {pendingCount > 0 && !tablesMissing && (
          <form action={bulkApprove100}>
            <button
              type="submit"
              className="bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Затвердити перші 100 товарів
            </button>
          </form>
        )}
      </div>

      {tablesMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
          <p className="font-semibold text-amber-800">Таблиці каталогу не існують</p>
          <p className="text-sm text-amber-700">Запустіть міграцію 037 у Supabase SQL Editor.</p>
        </div>
      )}

      {/* Pending approval */}
      {pendingCount > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-8">
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              Готові до затвердження ({pendingCount})
            </h2>
            <span className="text-xs text-amber-600">в наявності · є фото · не затверджені</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400">Назва</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400">Ціна</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400">Залишок</th>
                  <th className="px-5 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pendingApproval.map((sp) => {
                  const approveAction = async () => {
                    'use server'
                    const { approveProductAction } = await import('./actions')
                    await approveProductAction(sp.id)
                  }
                  return (
                    <tr key={sp.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">
                        {sp.name_ua ?? sp.name}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-500">
                        {sp.price_uah != null ? `${sp.price_uah} грн` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-500">{sp.stock_quantity}</td>
                      <td className="px-5 py-3 text-right">
                        <form action={approveAction}>
                          <button type="submit" className="text-xs text-honey-700 hover:text-honey-900 font-medium transition-colors">
                            Затвердити
                          </button>
                        </form>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Catalog products */}
      {catalogProducts.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Каталог — рядки {from + 1}–{from + catalogProducts.length} з {totalCount}
            </h2>
            <span className="text-xs text-gray-400">стор. {page} / {totalPages}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400">Назва</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400">Ціна</th>
                  <th className="text-center px-5 py-2.5 text-xs font-medium text-gray-400">Статус</th>
                  <th className="px-5 py-2.5 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {catalogProducts.map((cp) => {
                  const publishAction = publishProductAction.bind(null, cp.id)
                  const unpublishAction = unpublishProductAction.bind(null, cp.id)
                  return (
                    <tr key={cp.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">{cp.name_ua}</td>
                      <td className="px-5 py-3 text-right text-gray-500">{cp.price_uah} грн</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          cp.status === 'published' ? 'bg-green-100 text-green-700' :
                          cp.status === 'archived'  ? 'bg-gray-100 text-gray-500'  :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {STATUS_LABEL[cp.status] ?? cp.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {cp.status === 'published' ? (
                          <form action={unpublishAction}>
                            <button type="submit" className="text-xs text-gray-500 hover:text-gray-800 font-medium transition-colors">
                              Зняти
                            </button>
                          </form>
                        ) : (
                          <form action={publishAction}>
                            <button type="submit" className="text-xs text-green-700 hover:text-green-900 font-medium transition-colors">
                              Опублікувати
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              {page > 1 ? (
                <Link
                  href={`/admin/catalog?page=${page - 1}`}
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  ← Попередня
                </Link>
              ) : <span className="text-sm text-gray-300">← Попередня</span>}
              <span className="text-xs text-gray-400">Сторінка {page} з {totalPages}</span>
              {page < totalPages ? (
                <Link
                  href={`/admin/catalog?page=${page + 1}`}
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  Наступна →
                </Link>
              ) : <span className="text-sm text-gray-300">Наступна →</span>}
            </div>
          )}
        </div>
      )}

      {!tablesMissing && catalogProducts.length === 0 && pendingCount === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm text-center py-12 px-6">
          <p className="text-gray-900 font-semibold mb-1">Каталог порожній</p>
          <p className="text-sm text-gray-500">Спочатку синхронізуйте продукти у розділі «Постачальник», потім затверджуйте їх тут.</p>
        </div>
      )}
    </div>
  )
}
