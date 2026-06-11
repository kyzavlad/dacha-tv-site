'use client'

import { useTransition, useState } from 'react'
import { syncCategoriesAction, syncProductsAction, syncPricesAction } from './actions'
import type { SyncResult } from '@/lib/supplier/sync'

export interface PersistedResult {
  ok: boolean
  syncType: string
  message: string
}

interface SyncPanelProps {
  apiConfigured: boolean
  runningType: string | null
  persistedResult?: PersistedResult | null
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function SyncPanel({ apiConfigured, runningType, persistedResult }: SyncPanelProps) {
  const [pendingCat, startCat] = useTransition()
  const [pendingProd, startProd] = useTransition()
  const [pendingPrice, startPrice] = useTransition()
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)

  const anyPending = pendingCat || pendingProd || pendingPrice
  const serverRunning = runningType !== null && !anyPending

  function run(
    start: (fn: () => void) => void,
    action: () => Promise<SyncResult>,
  ) {
    setLastResult(null)
    start(async () => {
      try {
        const r = await action()
        setLastResult(r)
      } catch (e) {
        setLastResult({ ok: false, synced: 0, errors: 0, message: e instanceof Error ? e.message : 'Невідома помилка' })
      }
    })
  }

  return (
    <div>
      {(anyPending || serverRunning) && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4">
          <Spinner />
          <span>
            {anyPending
              ? 'Синхронізація виконується — не закривайте сторінку…'
              : `Синхронізація «${runningType}» виконується на сервері…`}
          </span>
        </div>
      )}

      {(lastResult || (!anyPending && persistedResult)) && (() => {
        const r = lastResult ?? persistedResult!
        const ok = lastResult ? lastResult.ok : persistedResult!.ok
        const alreadyRunning = lastResult?.alreadyRunning
        return (
          <div className={`text-sm rounded-lg px-4 py-2.5 mb-4 border ${
            alreadyRunning
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : ok
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {lastResult ? lastResult.message : `[Останній результат] ${r.message}`}
          </div>
        )
      })()}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!apiConfigured || anyPending || serverRunning}
          onClick={() => run(startCat, syncCategoriesAction)}
          className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pendingCat && <Spinner />}
          Синхронізувати категорії
        </button>

        <button
          type="button"
          disabled={!apiConfigured || anyPending || serverRunning}
          onClick={() => run(startProd, syncProductsAction)}
          className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pendingProd && <Spinner />}
          Синхронізувати продукти
        </button>

        <button
          type="button"
          disabled={!apiConfigured || anyPending || serverRunning}
          onClick={() => run(startPrice, syncPricesAction)}
          className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pendingPrice && <Spinner />}
          Оновити ціни / залишки
        </button>
      </div>

      {!apiConfigured && (
        <p className="text-xs text-gray-400 mt-3">Синхронізація недоступна — налаштуйте API ключі.</p>
      )}
    </div>
  )
}
