export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'
import { publishProductAction, unpublishProductAction } from './actions'
import { getSupplierImportDiagnostics } from '@/lib/catalog/supplier-diagnostics'
import type { CatalogProduct } from '@/types'

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

// Only the columns the list actually renders — never select('*') here (Part G).
const LIST_COLUMNS = 'id, name_ua, slug, price_uah, status, source, category_slug'

type ListRow = Pick<CatalogProduct, 'id' | 'name_ua' | 'slug' | 'price_uah' | 'status' | 'source' | 'category_slug'>

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  return new Date(t).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
}

function cycleStatusLabel(status: string | null): string {
  switch (status) {
    case 'running': return 'у процесі'
    case 'completed': return 'завершено'
    case 'failed': return 'помилка'
    case 'idle': return 'очікує'
    default: return 'ще не запускався'
  }
}

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function AdminCatalogPage({ searchParams }: PageProps) {
  const { page: pageRaw, q: qRaw } = await searchParams
  const query = (qRaw ?? '').trim()
  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const pageQs = query ? `&q=${encodeURIComponent(query)}` : ''

  let catalogProducts: ListRow[] = []
  let publishedCount = 0
  let draftCount = 0
  let totalCount = 0
  let listCount = 0
  let tablesMissing = false

  const diag = await getSupplierImportDiagnostics()

  try {
    const client = getAdminClient()
    let catalogQuery = client
      .from('catalog_products')
      .select(LIST_COLUMNS, { count: 'exact' })
      .order('status', { ascending: true })
      .order('display_order', { ascending: true })
    if (query) {
      catalogQuery = catalogQuery.ilike('name_ua', `%${query.replace(/[%_,()]/g, ' ').trim()}%`)
    }
    const [catalog, publishedHead, draftHead, totalHead] = await Promise.all([
      catalogQuery.range(from, to),
      client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      client.from('catalog_products').select('id', { count: 'exact', head: true }),
    ])

    if (catalog.error?.message.includes('does not exist') || catalog.error?.message.includes('relation')) {
      tablesMissing = true
    } else {
      catalogProducts = (catalog.data ?? []) as ListRow[]
      publishedCount = publishedHead.count ?? 0
      draftCount = draftHead.count ?? 0
      totalCount = totalHead.count ?? 0
      listCount = catalog.count ?? 0
    }
  } catch { /* env not set */ }

  const totalPages = Math.max(1, Math.ceil((query ? listCount : totalCount) / PAGE_SIZE))

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">Публічний каталог</h1>
            <Link href="/admin/catalog/categories" className="text-xs font-medium text-honey-700 hover:underline">
              🗂 Категорії →
            </Link>
            <Link href="/admin/catalog/search-insights" className="text-xs font-medium text-honey-700 hover:underline">
              🔍 Пошукові запити →
            </Link>
            <Link href="/admin/catalog/pipeline" className="text-xs font-medium text-gray-400 hover:text-gray-700 hover:underline">
              🛠 Технічне обслуговування →
            </Link>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {publishedCount} опублікованих · {draftCount} у чернетці · {totalCount} всього
            {query && <> · знайдено {listCount} за «{query}»</>}
          </p>
          <form action="/admin/catalog" method="get" role="search" className="mt-3 flex gap-2 max-w-md">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Пошук товарів за назвою…"
              aria-label="Пошук товарів"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
            />
            <button type="submit" className="rounded-lg bg-gray-900 text-white text-sm font-medium px-4 py-2 hover:bg-gray-700 transition-colors">
              Знайти
            </button>
            {query && (
              <Link href="/admin/catalog" className="rounded-lg border border-gray-300 text-sm text-gray-600 px-4 py-2 hover:bg-gray-50 transition-colors flex items-center">
                Скинути
              </Link>
            )}
          </form>
        </div>
      </div>

      {/* Supplier import diagnostic — replaces the misleading manual-approval panel.
          Products flow supplier_products → catalog_products automatically via the
          daily import pipeline; nothing needs per-item approval here. */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm mb-8">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Стан імпорту постачальника</h2>
          <Link href="/admin/catalog/pipeline" className="text-xs font-medium text-honey-700 hover:underline">
            Керувати пайплайном →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
          <Stat label="Нові у постачальника" value={diag.newSupplierProducts.toLocaleString('uk-UA')} hint="ще не в каталозі" />
          <Stat label="Готові до імпорту" value={diag.importable.toLocaleString('uk-UA')} hint="з назвою та ціною" />
          <Stat label="Остання синхр. фіду" value={fmtDate(diag.lastSupplierSync.at)} hint={diag.lastSupplierSync.status ?? '—'} />
          <Stat label="Останній імпорт" value={fmtDate(diag.lastCatalogImport.at)} hint={diag.lastCatalogImport.status ?? '—'} />
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-4 flex-wrap text-xs">
          <span className="text-gray-500">
            Цикл фіду: <span className="font-medium text-gray-700">{cycleStatusLabel(diag.cycle.status)}</span>
          </span>
          {diag.cycle.feedTotal > 0 && (
            <span className="text-gray-400">
              прогрес: {diag.cycle.processed.toLocaleString('uk-UA')} / {diag.cycle.feedTotal.toLocaleString('uk-UA')}
              {diag.cycle.nextOffset != null && <> · далі з {diag.cycle.nextOffset.toLocaleString('uk-UA')}</>}
            </span>
          )}
          <span className="text-gray-400">останній повний цикл: {fmtDate(diag.cycle.lastCompletedAt)}</span>
          {diag.cycle.lastError && <span className="text-red-600 font-medium truncate max-w-xs" title={diag.cycle.lastError}>помилка: {diag.cycle.lastError}</span>}
          {diag.recentErrors > 0 && !diag.cycle.lastError && <span className="text-red-600 font-medium">помилок: {diag.recentErrors}</span>}
        </div>
      </div>

      {tablesMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
          <p className="font-semibold text-amber-800">Таблиці каталогу не існують</p>
          <p className="text-sm text-amber-700">Застосуйте базові міграції у Supabase SQL Editor.</p>
        </div>
      )}

      {/* Catalog products */}
      {catalogProducts.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Каталог: рядки {from + 1}–{from + catalogProducts.length} з {totalCount}
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
                  <th className="px-5 py-2.5 w-44"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {catalogProducts.map((cp) => {
                  const publishAction = publishProductAction.bind(null, cp.id)
                  const unpublishAction = unpublishProductAction.bind(null, cp.id)
                  return (
                    <tr key={cp.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">
                        {cp.name_ua}
                        {cp.source === 'manual' && <span className="ml-2 text-[10px] font-semibold text-honey-700 uppercase">ручний</span>}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-500">{cp.price_uah != null ? `${cp.price_uah} грн` : '—'}</td>
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
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/admin/catalog/${cp.id}`} className="text-xs text-honey-700 hover:text-honey-900 font-medium transition-colors">
                            Редагувати
                          </Link>
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
                        </div>
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
                  href={`/admin/catalog?page=${page - 1}${pageQs}`}
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  ← Попередня
                </Link>
              ) : <span className="text-sm text-gray-300">← Попередня</span>}
              <span className="text-xs text-gray-400">Сторінка {page} з {totalPages}</span>
              {page < totalPages ? (
                <Link
                  href={`/admin/catalog?page=${page + 1}${pageQs}`}
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  Наступна →
                </Link>
              ) : <span className="text-sm text-gray-300">Наступна →</span>}
            </div>
          )}
        </div>
      )}

      {!tablesMissing && catalogProducts.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm text-center py-12 px-6">
          <p className="text-gray-900 font-semibold mb-1">{query ? 'Нічого не знайдено' : 'Каталог порожній'}</p>
          <p className="text-sm text-gray-500">
            {query ? 'Спробуйте інший запит.' : 'Товари зʼявляться автоматично після щоденного імпорту постачальника.'}
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5 truncate">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{hint}</p>}
    </div>
  )
}
