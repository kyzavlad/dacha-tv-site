export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { getAdminClient } from '@/lib/supabase/admin'
import { SyncPanel, type PersistedResult } from './SyncPanel'
import { SyncPoller } from './SyncPoller'
import type { SupplierSyncLog } from '@/types'

export const metadata: Metadata = {
  title: 'Адмін — Постачальник',
  robots: 'noindex, nofollow',
}

export default async function AdminSupplierPage() {
  let totalProducts = 0
  let totalCategories = 0
  let pendingApproval = 0
  let inStock = 0
  let recentLogs: SupplierSyncLog[] = []
  let tablesMissing = false
  const apiConfigured = !!(process.env.SUPPLIER_API_URL && process.env.SUPPLIER_API_KEY)

  try {
    const client = getAdminClient()
    const [prodCount, catCount, pendingCount, stockCount, logs] = await Promise.all([
      client.from('supplier_products').select('id', { count: 'exact', head: true }),
      client.from('supplier_categories').select('id', { count: 'exact', head: true }),
      client.from('supplier_products').select('id', { count: 'exact', head: true }).eq('is_approved', false),
      client.from('supplier_products').select('id', { count: 'exact', head: true }).eq('is_in_stock', true),
      client.from('supplier_sync_log').select('*').order('started_at', { ascending: false }).limit(10),
    ])

    if (prodCount.error?.message.includes('does not exist') || prodCount.error?.message.includes('relation')) {
      tablesMissing = true
    } else {
      totalProducts = prodCount.count ?? 0
      totalCategories = catCount.count ?? 0
      pendingApproval = pendingCount.count ?? 0
      inStock = stockCount.count ?? 0
      recentLogs = (logs.data ?? []) as SupplierSyncLog[]
    }
  } catch { /* env not set */ }

  // Detect any fresh running sync (< 10 min) to drive SyncPoller
  const now = Date.now()
  const runningLog = recentLogs.find(
    (l) => l.status === 'running' && now - new Date(l.started_at).getTime() < 10 * 60 * 1000
  )
  const runningType = runningLog?.sync_type ?? null

  const lastCompletedLog = recentLogs.find((l) => l.status === 'completed' || l.status === 'failed')
  const persistedResult: PersistedResult | null = lastCompletedLog
    ? {
        ok: lastCompletedLog.status === 'completed',
        syncType: lastCompletedLog.sync_type,
        message: lastCompletedLog.status === 'completed'
          ? `«${lastCompletedLog.sync_type}» завершено: ${
              lastCompletedLog.sync_type === 'categories'
                ? lastCompletedLog.categories_total
                : lastCompletedLog.products_total
            } записів`
          : `«${lastCompletedLog.sync_type}» завершився з помилкою`,
      }
    : null

  function formatDuration(log: SupplierSyncLog): string {
    const details = log.error_details as Record<string, unknown> | null
    const ms = details?.duration_ms as number | undefined
    if (ms == null) return '—'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Постачальник</h1>
        <p className="text-sm text-gray-500 mt-0.5">Синхронізація сирого каталогу. Публікація управляється окремо у розділі «Каталог».</p>
      </div>

      {/* Auto-refresh while sync active */}
      <SyncPoller active={runningType !== null} />

      {tablesMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
          <p className="font-semibold text-amber-800 mb-1">Таблиці постачальника не існують</p>
          <p className="text-sm text-amber-700">Запустіть міграцію 037 у Supabase SQL Editor.</p>
        </div>
      )}

      {!apiConfigured && !tablesMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
          <p className="font-semibold text-amber-800 mb-1">API не налаштовано</p>
          <p className="text-sm text-amber-700 mb-2">
            Додайте у Vercel Environment Variables:
          </p>
          <code className="text-xs bg-amber-100 rounded px-2 py-1 block w-fit">
            SUPPLIER_API_URL=https://api.example.com/v2<br />
            SUPPLIER_API_KEY=your-api-key
          </code>
        </div>
      )}

      {/* Stats */}
      {!tablesMissing && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Продуктів у DB', value: totalProducts },
            { label: 'Категорій', value: totalCategories },
            { label: 'На схваленні', value: pendingApproval },
            { label: 'В наявності', value: inStock },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sync controls */}
      {!tablesMissing && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Синхронізація</h2>
          <SyncPanel apiConfigured={apiConfigured} runningType={runningType} persistedResult={persistedResult} />
        </div>
      )}

      {/* Recent sync log */}
      {recentLogs.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Останні синхронізації</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400">Тип</th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400">Статус</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400">Збережено</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400">У відповіді</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400 hidden sm:table-cell">Тривалість</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400 hidden sm:table-cell">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentLogs.map((log) => {
                const details = log.error_details as Record<string, unknown> | null
                const responseCount = details?.response_count as number | undefined
                const errorMsg = log.status === 'failed' ? (details?.message as string | undefined) : undefined
                const saved = log.sync_type === 'categories' ? log.categories_total : log.products_total
                const isStale = log.status === 'stale'
                const isRunning = log.status === 'running'
                return (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-gray-700 font-mono text-xs">{log.sync_type}</td>
                    <td className="px-5 py-3">
                      <div>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          log.status === 'completed' ? 'text-green-700' :
                          log.status === 'failed'    ? 'text-red-600'   :
                          isStale                    ? 'text-gray-500'  :
                          isRunning                  ? 'text-amber-600' :
                          'text-gray-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            log.status === 'completed' ? 'bg-green-500' :
                            log.status === 'failed'    ? 'bg-red-500'   :
                            isStale                    ? 'bg-gray-400'  :
                            isRunning                  ? 'bg-amber-400 animate-pulse' :
                            'bg-gray-400'
                          }`} />
                          {log.status === 'completed' ? 'OK' :
                           log.status === 'failed'    ? 'Помилка' :
                           isStale                    ? 'Застаріла' :
                           isRunning                  ? 'Виконується' : log.status}
                        </span>
                        {errorMsg && (
                          <p className="text-xs text-red-500 mt-0.5 font-mono max-w-xs truncate" title={errorMsg}>{errorMsg}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">{saved ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-gray-400">
                      {responseCount != null ? responseCount : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400 text-xs hidden sm:table-cell">
                      {formatDuration(log)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400 text-xs hidden sm:table-cell">
                      {new Date(log.started_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
