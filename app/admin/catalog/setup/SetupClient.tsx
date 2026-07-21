'use client'

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  syncApiCategoriesAction,
  syncCatalogCategoriesAction,
  applyCategorySeoAction,
  publishCategoriesAction,
} from '@/app/admin/catalog/pipeline/actions'
import type { PipelineStats } from '@/lib/catalog/pipeline'

function usePersistedResult(key: string) {
  const [result, setResultState] = useState<StepResult | null>(null)
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    // Deferred to a microtask (not called synchronously in the effect body)
    // since this reads from an external system (localStorage), not derived
    // props/state.
    Promise.resolve().then(() => {
      try {
        const raw = localStorage.getItem(key)
        if (raw) setResultState(JSON.parse(raw) as StepResult)
      } catch { /* ignore */ }
    })
  }, [key])
  const set = useCallback((r: StepResult) => {
    setResultState(r)
    try { localStorage.setItem(key, JSON.stringify(r)) } catch { /* ignore */ }
  }, [key])
  return [result, set] as const
}

interface StepResult {
  ok: boolean
  message: string
  partial?: boolean
  csvUrl?: string
  unmatchedSample?: string[]
  matchSources?: Record<string, number>
  sheetWarning?: string
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 inline mr-1.5 flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function Banner({ result }: { result: StepResult }) {
  const base = 'mt-2 text-xs px-3 py-2 rounded-lg border'
  if (result.partial) {
    return (
      <div className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
        <div>⚠ {result.message}</div>
        {result.sheetWarning && <div className="mt-1">{result.sheetWarning}</div>}
        {result.unmatchedSample && result.unmatchedSample.length > 0 && (
          <div className="mt-1">Не знайдено: {result.unmatchedSample.slice(0, 5).join(', ')}</div>
        )}
        {result.matchSources && Object.keys(result.matchSources).length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer select-none font-semibold">Метод збігу</summary>
            {Object.entries(result.matchSources).map(([k, n]) => <div key={k} className="font-mono">{k}: {n}</div>)}
          </details>
        )}
      </div>
    )
  }
  if (result.ok) return (
    <div className={`${base} bg-green-50 border-green-100 text-green-800`}>
      <div>✓ {result.message}</div>
      {result.sheetWarning && <div className="mt-1 text-amber-700">{result.sheetWarning}</div>}
      {result.matchSources && Object.keys(result.matchSources).length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none font-semibold">Метод збігу</summary>
          {Object.entries(result.matchSources).map(([k, n]) => <div key={k} className="font-mono">{k}: {n}</div>)}
        </details>
      )}
    </div>
  )
  return (
    <div className={`${base} bg-red-50 border-red-100 text-red-700`}>
      <div>✗ {result.message}</div>
      {result.csvUrl && <div className="mt-1 font-mono text-xs break-all">CSV: {result.csvUrl}</div>}
    </div>
  )
}

function StepCard({ number, title, badge, description, running, result, children }: {
  number: number; title: string; badge?: string; description: string
  running: boolean; result: StepResult | null; children: React.ReactNode
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 transition-colors ${running ? 'border-amber-300 shadow-sm' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${running ? 'bg-amber-500' : 'bg-bark'}`}>
          {running ? '…' : number}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="font-semibold text-bark text-sm">{title}</h3>
            {badge && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{badge}</span>}
          </div>
          <p className="text-xs text-gray-500 mb-2">{description}</p>
          {children}
          {result && <Banner result={result} />}
        </div>
      </div>
    </div>
  )
}

const BTN_API = 'inline-flex items-center px-4 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-full hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const BTN_SEO = 'inline-flex items-center px-4 py-1.5 text-xs font-semibold bg-blue-700 text-white rounded-full hover:bg-blue-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const BTN_PUB = 'inline-flex items-center px-4 py-1.5 text-xs font-semibold bg-green-700 text-white rounded-full hover:bg-green-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

function EnvUrlDisplay({ url, envVar }: { url: string; envVar: string }) {
  if (!url) {
    return <p className="text-xs text-amber-600 mt-1">⚠ <code>{envVar}</code> не встановлено в env vars — встановіть перед запуском.</p>
  }
  const short = url.length > 80 ? `${url.slice(0, 40)}…${url.slice(-20)}` : url
  return (
    <p className="text-xs text-gray-400 mt-1 font-mono break-all" title={url}>{short}</p>
  )
}

export function SetupClient({
  initialStats,
  categorySeoUrl,
  productSeoUrl,
}: {
  initialStats: PipelineStats
  categorySeoUrl: string
  productSeoUrl: string
}) {
  const stats = initialStats
  const router = useRouter()

  const [r1, setR1] = usePersistedResult('setup_r1')
  const [r3, setR3] = usePersistedResult('setup_r3')
  const [r4, setR4] = usePersistedResult('setup_r4')
  const [r7, setR7] = usePersistedResult('setup_r7')
  const [p1, s1] = useTransition()
  const [p3, s3] = useTransition()
  const [p4, s4] = useTransition()
  const [p7, s7] = useTransition()

  const anyPending = p1 || p3 || p4 || p7

  function run(
    start: (fn: () => Promise<void>) => void,
    action: () => Promise<{ ok: boolean; message: string; details?: Record<string, unknown> }>,
    setResult: (r: StepResult) => void,
  ) {
    start(async () => {
      try {
        const r = await action()
        const d = r.details ?? {}
        const errors = d.errors
        const partial = r.ok && typeof errors === 'number' && errors > 0
        setResult({
          ok: r.ok, message: r.message, partial: partial || undefined,
          csvUrl: typeof d.csvUrl === 'string' ? d.csvUrl : undefined,
          unmatchedSample: Array.isArray(d.unmatchedSample) ? (d.unmatchedSample as string[]) : undefined,
          matchSources: d.matchSources as Record<string, number> | undefined,
          sheetWarning: typeof d.sheetWarning === 'string' ? d.sheetWarning : undefined,
        })
      } catch (e) {
        setResult({ ok: false, message: e instanceof Error ? e.message : 'Помилка' })
      }
      try { router.refresh() } catch { /* ignore */ }
    })
  }

  return (
    <div className="space-y-3">

      <StepCard number={1} title="Синхронізація категорій API" badge="API → supplier_categories" running={p1}
        description="Завантажує список категорій з personal.cab. Потрібно запустити один раз при першому розгортанні."
        result={r1}>
        <button disabled={anyPending} onClick={() => run(s1, syncApiCategoriesAction, setR1)} className={BTN_API}>
          {p1 && <Spinner />}{p1 ? 'Синхронізую…' : 'Запустити синхронізацію категорій'}
        </button>
      </StepCard>

      <StepCard number={2} title="Створити категорії каталогу" badge="supplier_categories → catalog_categories" running={p3}
        description="Переносить нові категорії у catalog_categories. Числові назви виправляються автоматично. Існуючі SEO не змінюються."
        result={r3}>
        <div className="text-xs text-gray-400 mb-2">
          {stats.supplierCategories} у постачальника → {stats.catalogCategories} у каталозі
        </div>
        <button disabled={anyPending} onClick={() => run(s3, syncCatalogCategoriesAction, setR3)} className={BTN_API}>
          {p3 && <Spinner />}{p3 ? 'Синхронізую…' : 'Створити категорії каталогу'}
        </button>
      </StepCard>

      <StepCard number={3} title="SEO категорій" badge="Google Sheets → catalog_categories" running={p4}
        description="Оновлює опис і мета-теги категорій. Ніколи не змінює slug або стан публікації. URL читається з env."
        result={r4}>
        <EnvUrlDisplay url={categorySeoUrl} envVar="CATEGORY_SEO_CSV_URL" />
        <div className="mt-2">
          <button
            disabled={anyPending || !categorySeoUrl}
            onClick={() => run(s4, applyCategorySeoAction, setR4)}
            className={BTN_SEO}
          >
            {p4 && <Spinner />}{p4 ? 'Застосовую…' : 'Застосувати SEO категорій'}
          </button>
        </div>
      </StepCard>

      <StepCard number={4} title="Опублікувати категорії" badge="is_published = true" running={p7}
        description={`${stats.catalogCategories - stats.catalogCategoriesPublished} категорій ще не видно публічно.`}
        result={r7}>
        <button
          disabled={anyPending || stats.catalogCategories === 0}
          onClick={() => run(s7, publishCategoriesAction, setR7)}
          className={BTN_PUB}
        >
          {p7 && <Spinner />}{p7 ? 'Публікую…' : `Опублікувати всі категорії (${stats.catalogCategories})`}
        </button>
      </StepCard>

      {/* Env vars reference */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <div className="font-semibold text-gray-700 mb-1">Env vars (лише для читання)</div>
        <div><code className="text-gray-800">CATEGORY_SEO_CSV_URL</code>{' '}
          {categorySeoUrl ? <span className="text-green-600">✓ встановлено</span> : <span className="text-amber-600">✗ не встановлено</span>}
        </div>
        <div><code className="text-gray-800">PRODUCT_SEO_CSV_URL</code>{' '}
          {productSeoUrl ? <span className="text-green-600">✓ встановлено</span> : <span className="text-amber-600">✗ не встановлено</span>}
        </div>
        <div className="mt-2 text-gray-400">
          Змінювати URL потрібно через Vercel Dashboard → Settings → Environment Variables.
        </div>
      </div>

    </div>
  )
}
