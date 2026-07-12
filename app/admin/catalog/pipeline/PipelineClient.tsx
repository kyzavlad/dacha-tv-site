'use client'

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  syncApiProductsAction,
  runProductSeoAction,
  getAutomationStatusAction,
  importBatchAction,
  publishBatchAction,
  dryRunImportBatchAction,
  fullImportBatchAction,
  backfillCategorySlugsAction,
  repairCategoryNamesAction,
  normalizeAndFinalizeCategoriesAction,
  seedManualCatalogAction,
  inspectSupplierFeedsAction,
  getCatalogDiagnosticsAction,
  getSeoCountsAction,
  generateCategorySeoBatchAction,
  generateProductSeoBatchAction,
  previewProductSeoTemplateAction,
  generateProductSeoTemplateAction,
  backfillSeoDescriptionFallbackAction,
  previewProductSeoSheetAction,
  importProductSeoSheetAction,
  previewCategorySeoSheetAction,
  importCategorySeoSheetAction,
  findOrphanedAction,
  recoverOrphanedAction,
  extractSupplierImagesDryRunAction,
  extractSupplierImagesAction,
  seoSheetPriorityDryRunAction,
  seoSheetPriorityImportAction,
} from './actions'
import type { ActionResult, FeedDiagResult, CatalogDiagnostics, SeoCounts } from './actions'
import type { PipelineStats } from '@/lib/catalog/pipeline'
import type { AutomationStatus, AutomationLastRun } from '@/lib/catalog/automation'
import { AUTOMATION_MAX_PUBLISHED, AUTOMATION_BATCH_SIZE } from '@/lib/catalog/automation-config'
import type { EnvStatus } from './page'

function usePersistedResult(key: string) {
  const [result, setResultState] = useState<StepResult | null>(null)
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    try {
      const raw = localStorage.getItem(key)
      if (raw) setResultState(JSON.parse(raw) as StepResult)
    } catch { /* ignore */ }
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
  errorGroups?: Record<string, number>
  priceSample?: Array<{ sku: string; rawFields: Record<string, unknown>; computedUah: number | null }>
  priceWarning?: string
  sheetWarning?: string
  matchSources?: Record<string, number>
  httpStatus?: number
  contentType?: string
  bodyPreview?: string
  finalUrl?: string
}

// Map a server ActionResult → the StepResult the Banner renders. All extras live
// under `details`; we copy only the known, display-relevant fields. Everything is
// already JSON-plain (the action deep-clones it), so this never throws.
function toStepResult(r: ActionResult): StepResult {
  const d = r.details ?? {}
  const errors = typeof d.errors === 'number' ? d.errors : 0
  return {
    ok: r.ok,
    message: r.message,
    partial: r.ok && errors > 0 ? true : undefined,
    csvUrl: typeof d.csvUrl === 'string' ? d.csvUrl : undefined,
    unmatchedSample: Array.isArray(d.unmatchedSample) ? (d.unmatchedSample as string[]) : undefined,
    errorGroups: d.errorGroups as Record<string, number> | undefined,
    priceSample: d.priceSample as StepResult['priceSample'],
    priceWarning: typeof d.priceWarning === 'string' ? d.priceWarning : undefined,
    sheetWarning: typeof d.sheetWarning === 'string' ? d.sheetWarning : undefined,
    matchSources: d.matchSources as Record<string, number> | undefined,
    httpStatus: typeof d.httpStatus === 'number' ? d.httpStatus : undefined,
    contentType: typeof d.contentType === 'string' ? d.contentType : undefined,
    bodyPreview: typeof d.bodyPreview === 'string' ? d.bodyPreview : undefined,
    finalUrl: typeof d.finalUrl === 'string' ? d.finalUrl : undefined,
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtNextRun(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffH = Math.floor((d.getTime() - now.getTime()) / 3_600_000)
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
  if (diffH < 1) return `скоро · ${time}`
  if (diffH < 24) return `за ${diffH} год · ${time}`
  return `завтра ${time}`
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 inline mr-1.5 flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function ErrorGroupsBlock({ errorGroups }: { errorGroups: Record<string, number> }) {
  const entries = Object.entries(errorGroups)
  if (!entries.length) return null
  return (
    <details className="mt-1">
      <summary className="cursor-pointer font-semibold select-none text-xs">Групи помилок ({entries.length})</summary>
      <div className="mt-0.5 space-y-0.5 text-xs">
        {entries.map(([msg, n]) => <div key={msg} className="font-mono break-all">{msg} ({n})</div>)}
      </div>
    </details>
  )
}

function PriceSampleBlock({ priceSample }: { priceSample: Array<{ sku: string; rawFields: Record<string, unknown>; computedUah: number | null }> }) {
  if (!priceSample.length) return null
  const fields = ['price', 'retail_price', 'price_uah', 'price_usd', 'rate', 'rootCurrency', 'winField', 'stockSrc'] as const
  return (
    <details className="mt-2">
      <summary className="cursor-pointer font-semibold select-none text-xs">Цінові поля з API ({priceSample.length} зразки)</summary>
      <div className="mt-1 overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="border border-current px-1 py-0.5 text-left">SKU</th>
              {fields.map((f) => <th key={f} className="border border-current px-1 py-0.5">{f}</th>)}
              <th className="border border-current px-1 py-0.5">UAH</th>
            </tr>
          </thead>
          <tbody>
            {priceSample.map((row) => (
              <tr key={row.sku}>
                <td className="border border-current px-1 py-0.5 font-mono">{row.sku}</td>
                {fields.map((f) => (
                  <td key={f} className="border border-current px-1 py-0.5 text-center font-mono">
                    {row.rawFields[f] != null ? String(row.rawFields[f]) : '—'}
                  </td>
                ))}
                <td className="border border-current px-1 py-0.5 text-center font-mono">
                  {row.computedUah ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function FetchDiagBlock({ result }: { result: StepResult }) {
  if (!result.httpStatus && !result.contentType && !result.bodyPreview) return null
  return (
    <details className="mt-2">
      <summary className="cursor-pointer select-none font-semibold text-xs">HTTP діагностика</summary>
      <div className="mt-1 space-y-0.5 text-xs font-mono">
        {result.finalUrl && <div className="break-all">URL: {result.finalUrl}</div>}
        {result.httpStatus !== undefined && <div>Status: {result.httpStatus}</div>}
        {result.contentType && <div>Content-Type: {result.contentType}</div>}
        {result.bodyPreview && <div className="break-all text-gray-500">Preview: {result.bodyPreview}</div>}
      </div>
    </details>
  )
}

function Banner({ result }: { result: StepResult }) {
  const base = 'mt-3 text-xs px-3 py-2 rounded-lg border'
  const warnings = (
    <>
      {result.sheetWarning && <div className="mt-1 font-medium text-amber-700">{result.sheetWarning}</div>}
      {result.priceWarning && <div className="mt-1 font-medium">{result.priceWarning}</div>}
    </>
  )
  if (result.partial) return (
    <div className={`${base} bg-amber-50 border-amber-200 text-amber-800`}>
      <div className="whitespace-pre-wrap">⚠ {result.message}</div>
      {warnings}
      {result.unmatchedSample && result.unmatchedSample.length > 0 && (
        <div className="mt-1">Не знайдено: {result.unmatchedSample.slice(0, 5).join(', ')}</div>
      )}
      {result.errorGroups && <ErrorGroupsBlock errorGroups={result.errorGroups} />}
      {result.priceSample && result.priceSample.length > 0 && <PriceSampleBlock priceSample={result.priceSample} />}
    </div>
  )
  if (result.ok) return (
    <div className={`${base} bg-green-50 border-green-100 text-green-800`}>
      <div className="whitespace-pre-wrap">✓ {result.message}</div>
      {warnings}
      {result.unmatchedSample && result.unmatchedSample.length > 0 && (
        <div className="mt-1">Не знайдено: {result.unmatchedSample.slice(0, 5).join(', ')}</div>
      )}
      {result.errorGroups && <ErrorGroupsBlock errorGroups={result.errorGroups} />}
      {result.matchSources && Object.keys(result.matchSources).length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none font-semibold">Метод збігу</summary>
          {Object.entries(result.matchSources).map(([k, n]) => <div key={k} className="font-mono">{k}: {n}</div>)}
        </details>
      )}
      {result.priceSample && result.priceSample.length > 0 && <PriceSampleBlock priceSample={result.priceSample} />}
    </div>
  )
  return (
    <div className={`${base} bg-red-50 border-red-100 text-red-700`}>
      <div className="whitespace-pre-wrap">✗ {result.message}</div>
      {warnings}
      {result.csvUrl && <div className="mt-1 font-mono text-xs break-all">CSV: {result.csvUrl}</div>}
      <FetchDiagBlock result={result} />
      {result.errorGroups && <ErrorGroupsBlock errorGroups={result.errorGroups} />}
    </div>
  )
}

const CRON_SCHEDULE = [
  { path: '/api/admin/cron/sync-categories',  time: '01:00', label: 'Синхр. категорій + каталог + публікація' },
  { path: '/api/admin/cron/category-seo',     time: '02:00', label: 'SEO категорій' },
  { path: '/api/admin/cron/sync-products',    time: '03:00', label: 'Синхр. товарів (API)' },
  { path: '/api/admin/cron/import-products',  time: '04:00', label: 'Імпорт у каталог' },
  { path: '/api/admin/cron/publish-products', time: '05:00', label: 'Публікація draft' },
  { path: '/api/admin/cron/product-seo',      time: '06:00', label: 'SEO товарів' },
]

const ENV_VARS: Array<{ key: keyof EnvStatus; label: string }> = [
  { key: 'supplierUrl',    label: 'SUPPLIER_API_URL' },
  { key: 'supplierKey',    label: 'SUPPLIER_API_KEY' },
  { key: 'cronSecret',     label: 'CRON_SECRET' },
  { key: 'productSeoUrl',  label: 'PRODUCT_SEO_CSV_URL' },
  { key: 'categorySeoUrl', label: 'CATEGORY_SEO_CSV_URL' },
  { key: 'supabaseUrl',    label: 'NEXT_PUBLIC_SUPABASE_URL' },
  { key: 'supabaseKey',    label: 'SUPABASE_SERVICE_ROLE_KEY' },
]

function HealthBlock({ envStatus, lastRuns }: { envStatus: EnvStatus; lastRuns: AutomationLastRun[] }) {
  const [open, setOpen] = useState(false)
  const missingEnv = ENV_VARS.filter((v) => !envStatus[v.key])
  const allEnvOk = missingEnv.length === 0
  const runMap = new Map(lastRuns.map((r) => [r.sync_type, r]))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen((o) => !o)}>
        <span className="font-semibold text-gray-700">
          Конфігурація та розклад
          {allEnvOk
            ? <span className="ml-2 text-green-600 font-normal">✓ всі env vars</span>
            : <span className="ml-2 text-red-500 font-normal">✗ {missingEnv.length} env vars відсутні</span>}
        </span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <div className="font-semibold text-gray-600 mb-1">Environment variables</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {ENV_VARS.map((v) => (
                <div key={v.key} className="flex items-center gap-1.5">
                  <span className={envStatus[v.key] ? 'text-green-600' : 'text-red-500'}>
                    {envStatus[v.key] ? '✓' : '✗'}
                  </span>
                  <code className="text-gray-700">{v.label}</code>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="font-semibold text-gray-600 mb-1">Щоденний розклад (UTC)</div>
            <div className="space-y-0.5">
              {CRON_SCHEDULE.map((c) => {
                const syncType = c.path.split('/').pop()!.replace(/-/g, '_')
                  .replace('sync_categories', 'categories').replace('sync_products', 'products')
                  .replace('import_products', 'import_batch').replace('publish_products', 'publish_batch')
                const run = runMap.get(syncType)
                const statusDot = !run ? '○' : run.status === 'completed' ? '●' : run.status === 'failed' ? '✗' : '○'
                const statusColor = !run ? 'text-gray-300' : run.status === 'completed' ? 'text-green-500' : run.status === 'failed' ? 'text-red-500' : 'text-gray-400'
                return (
                  <div key={c.path} className="flex items-baseline gap-2">
                    <span className="text-gray-400 tabular-nums w-10 shrink-0">{c.time}</span>
                    <span className={`${statusDot === '✗' ? 'text-red-500' : statusColor} shrink-0`}>{statusDot}</span>
                    <span className="text-gray-600">{c.label}</span>
                    {run?.completed_at && <span className="text-gray-400 ml-auto shrink-0">{fmtDate(run.completed_at)}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="pt-4 pb-0.5 px-1">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">{title}</h2>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function MigrationDiagnosticsBlock({
  diag, pending, onRefresh,
}: {
  diag: CatalogDiagnostics | null
  pending: boolean
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const allOk = diag?.ok === true
  const missingMigrations = diag?.migrations.filter((m) => !m.applied) ?? []

  return (
    <div className={`bg-white rounded-xl border p-4 text-xs ${diag && !allOk ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <button className="flex items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
          <span className="font-semibold text-gray-700">Стан бази даних</span>
          {!diag ? (
            <span className="text-gray-400 font-normal">завантаження…</span>
          ) : allOk ? (
            <span className="text-green-600 font-normal">✓ всі міграції застосовані</span>
          ) : (
            <span className="text-red-500 font-normal">✗ {missingMigrations.length} міграцій не застосовано</span>
          )}
          <span className="text-gray-400">{open ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={onRefresh}
          disabled={pending}
          className="text-gray-400 hover:text-gray-700 disabled:opacity-40 shrink-0"
          title="Перевірити ще раз"
        >
          {pending ? '…' : '↻'}
        </button>
      </div>

      {diag && !allOk && !open && (
        <p className="mt-2 text-red-600">
          Деякі дії вимкнено, доки не застосовані міграції. Натисніть, щоб побачити точні колонки/файли.
        </p>
      )}

      {open && diag && (
        <div className="mt-3 space-y-3">
          {diag.missingTables && diag.missingTables.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-700">
              <div className="font-semibold">Відсутні обовʼязкові таблиці</div>
              <div className="font-mono mt-0.5">{diag.missingTables.join(', ')}</div>
              <div className="mt-1">Застосуйте базові міграції (001 → 037 → 039 …) перед каталогом.</div>
            </div>
          )}
          {diag.tables && (diag.tables.orders === false || diag.tables.order_items === false) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
              Таблиці замовлень відсутні (необовʼязкові для каталогу):{' '}
              <span className="font-mono">
                {[!diag.tables.orders && 'orders', !diag.tables.order_items && 'order_items'].filter(Boolean).join(', ')}
              </span>. Це не блокує пайплайн.
            </div>
          )}
          <div className="space-y-1">
            {diag.migrations.map((m) => (
              <div key={m.id} className="flex items-start gap-2">
                <span className={m.applied ? 'text-green-600' : 'text-red-500'}>{m.applied ? '✓' : '✗'}</span>
                <div>
                  <span className="text-gray-700">{m.label}</span>
                  {!m.applied && m.missing.length > 0 && (
                    <div className="font-mono text-red-500 mt-0.5">бракує: {m.missing.join(', ')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {Object.keys(diag.missingByTable).length > 0 && (
            <div>
              <div className="font-semibold text-gray-600 mb-1">Відсутні колонки за таблицями</div>
              <div className="space-y-0.5 font-mono">
                {Object.entries(diag.missingByTable).map(([table, cols]) => (
                  <div key={table}><span className="text-gray-700">{table}</span>: <span className="text-red-500">{cols.join(', ')}</span></div>
                ))}
              </div>
            </div>
          )}

          {!allOk && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
              Застосуйте у Supabase → SQL editor файл{' '}
              <span className="font-mono">054_catalog_final_stabilization.sql</span> — він ідемпотентно
              і безпечно (ALTER TABLE IF EXISTS) повторно додає всі потрібні колонки, функції, SEO-поля
              та порядок категорій. Зазвичай достатньо застосувати лише його.
            </div>
          )}

          {diag.notes.length > 0 && (
            <div className="space-y-0.5 text-gray-500">
              {diag.notes.map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const BTN = 'inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0'
const BTN_GRAY  = `${BTN} bg-gray-900 text-white hover:bg-gray-700`
const BTN_BLUE  = `${BTN} bg-blue-700 text-white hover:bg-blue-800`
const BTN_GREEN = `${BTN} bg-green-700 text-white hover:bg-green-800`
const BTN_RED   = `${BTN} bg-red-600 text-white hover:bg-red-700`
const BTN_AMBER = `${BTN} bg-amber-600 text-white hover:bg-amber-700`

function EnvUrlDisplay({ url, label }: { url: string; label: string }) {
  if (!url) {
    return <p className="text-xs text-amber-600 mt-1">⚠ {label} не встановлено — встановіть env var у Vercel.</p>
  }
  const short = url.length > 72 ? `${url.slice(0, 36)}…${url.slice(-20)}` : url
  return <p className="text-xs text-gray-400 mt-1 font-mono break-all" title={url}>{short}</p>
}

function RunStatusRow({ run }: { run: AutomationLastRun | undefined }) {
  if (!run) return null
  return (
    <div className="flex items-center justify-between text-xs mt-3 pt-2 border-t border-gray-100 text-gray-400">
      <div>
        {run.completed_at ? (
          <span className={run.status === 'completed' ? 'text-green-600' : run.status === 'failed' ? 'text-red-500' : ''}>
            {run.status === 'completed' ? '✓' : '✗'}{' '}
            {fmtDate(run.completed_at)}
            {run.count != null ? ` · ${run.count.toLocaleString('uk-UA')}` : ''}
            {run.triggered_by === 'cron' ? ' · авто' : ' · вручну'}
          </span>
        ) : <span>— не запускалось</span>}
      </div>
      <div>↻ {fmtNextRun(run.nextRunAt)}</div>
    </div>
  )
}

// One pipeline step card: numbered badge, title, description, single run button,
// optional migration-gating note, inline result banner and last-run row.
function StepCard({
  step, title, description, buttonLabel, buttonClass = BTN_GRAY, pendingLabel = 'Запуск…',
  pending, disabled, accent, onRun, result, runStatus, note, children,
}: {
  step?: number
  title: string
  description: React.ReactNode
  buttonLabel: string
  buttonClass?: string
  pendingLabel?: string
  pending: boolean
  disabled: boolean
  accent?: string
  onRun: () => void
  result?: StepResult | null
  runStatus?: React.ReactNode
  note?: React.ReactNode
  children?: React.ReactNode
}) {
  const border = pending ? 'border-amber-300' : (accent ?? 'border-gray-200')
  return (
    <div className={`bg-white rounded-xl border p-4 ${border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {step != null && (
            <span className={`shrink-0 mt-px w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${pending ? 'bg-amber-500 text-white' : 'bg-gray-900 text-white'}`}>
              {step}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-bark text-sm">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            {note}
          </div>
        </div>
        <button disabled={disabled} onClick={onRun} className={buttonClass}>
          {pending ? <><Spinner />{pendingLabel}</> : buttonLabel}
        </button>
      </div>
      {children}
      {result && <Banner result={result} />}
      {runStatus}
    </div>
  )
}

export function PipelineClient({
  initialStats,
  initialAutomation,
  productSeoUrl,
  categorySeoUrl,
  envStatus,
  n8nSeoConfigured,
}: {
  initialStats: PipelineStats
  initialAutomation: AutomationStatus
  productSeoUrl: string
  categorySeoUrl: string
  envStatus: EnvStatus
  n8nSeoConfigured: boolean
}) {
  const stats = initialStats
  const router = useRouter()

  const [autoStatus, setAutoStatus] = useState(initialAutomation)
  const [refreshing, startRefresh] = useTransition()

  const [rProducts,    setRProducts]    = usePersistedResult('pipeline_r2')
  const [rImportDry,   setRImportDry]   = usePersistedResult('pipeline_r_import_dry')
  const [rImport,      setRImport]      = usePersistedResult('pipeline_r5')
  const [rImportFull,  setRImportFull]  = usePersistedResult('pipeline_r_import_full')
  const [rSeo,         setRSeo]         = usePersistedResult('pipeline_r6')
  const [rPublish,  setRPublish]  = usePersistedResult('pipeline_r8')
  const [rBackfill, setRBackfill] = usePersistedResult('pipeline_r_backfill')
  const [rRepair,   setRRepair]   = usePersistedResult('pipeline_r_repair')
  const [rFinalize, setRFinalize] = usePersistedResult('pipeline_r_finalize')
  const [rManual,   setRManual]   = usePersistedResult('pipeline_r_manual')
  const [rSeoCat,   setRSeoCat]   = usePersistedResult('pipeline_r_seo_cat')
  const [rSeoProd,  setRSeoProd]  = usePersistedResult('pipeline_r_seo_prod')
  const [rSeoTplPrev, setRSeoTplPrev] = usePersistedResult('pipeline_r_seo_tpl_prev')
  const [rSeoTpl,   setRSeoTpl]   = usePersistedResult('pipeline_r_seo_tpl')
  const [rSeoFb,    setRSeoFb]    = usePersistedResult('pipeline_r_seo_fb')
  const [rShProdPrev, setRShProdPrev] = usePersistedResult('pipeline_r_sheet_prod_prev')
  const [rShProd,   setRShProd]   = usePersistedResult('pipeline_r_sheet_prod')
  const [rShCatPrev, setRShCatPrev] = usePersistedResult('pipeline_r_sheet_cat_prev')
  const [rShCat,    setRShCat]    = usePersistedResult('pipeline_r_sheet_cat')
  const [rOrphanDiag,  setROrphanDiag]  = usePersistedResult('pipeline_r_orphan_diag')
  const [rOrphanFix,   setROrphanFix]   = usePersistedResult('pipeline_r_orphan_fix')
  const [rImgDry,      setRImgDry]      = usePersistedResult('pipeline_r_img_dry')
  const [rImgApply,    setRImgApply]    = usePersistedResult('pipeline_r_img_apply')
  const [rSeoPriDry,   setRSeoPriDry]   = usePersistedResult('pipeline_r_seo_pri_dry')
  const [rSeoPriApply, setRSeoPriApply] = usePersistedResult('pipeline_r_seo_pri_apply')

  // Feed diagnostic lives in component state (hits the live API; not persisted).
  const [rDiag, setRDiag] = useState<FeedDiagResult | { error: string } | null>(null)
  // Migration / capability diagnostics — loaded on mount and after each action.
  const [diag, setDiag] = useState<CatalogDiagnostics | null>(null)
  // SEO counts — loaded on mount and after each SEO action.
  const [seo, setSeo] = useState<SeoCounts | null>(null)

  const [pProducts,    sProducts]    = useTransition()
  const [pImportDry,   sImportDry]   = useTransition()
  const [pImport,      sImport]      = useTransition()
  const [pImportFull,  sImportFull]  = useTransition()
  const [pSeo,         sSeo]         = useTransition()
  const [pPublish,  sPublish]  = useTransition()
  const [pBackfill, sBackfill] = useTransition()
  const [pRepair,   sRepair]   = useTransition()
  const [pFinalize, sFinalize] = useTransition()
  const [pManual,   sManual]   = useTransition()
  const [pDiag,     sDiag]     = useTransition()
  const [pMigDiag,  sMigDiag]  = useTransition()
  const [pSeoCat,   sSeoCat]   = useTransition()
  const [pSeoProd,  sSeoProd]  = useTransition()
  const [pSeoTplPrev, sSeoTplPrev] = useTransition()
  const [pSeoTpl,   sSeoTpl]   = useTransition()
  const [pSeoFb,    sSeoFb]    = useTransition()
  const [pShProdPrev, sShProdPrev] = useTransition()
  const [pShProd,   sShProd]   = useTransition()
  const [pShCatPrev, sShCatPrev] = useTransition()
  const [pShCat,    sShCat]    = useTransition()
  const [pOrphanDiag,  sOrphanDiag]  = useTransition()
  const [pOrphanFix,   sOrphanFix]   = useTransition()
  const [pImgDry,      sImgDry]      = useTransition()
  const [pImgApply,    sImgApply]    = useTransition()
  const [pSeoPriDry,   sSeoPriDry]   = useTransition()
  const [pSeoPriApply, sSeoPriApply] = useTransition()

  const anyPending = pProducts || pImportDry || pImport || pImportFull || pSeo || pPublish || pBackfill || pRepair || pFinalize || pManual || pDiag || pMigDiag || pSeoCat || pSeoProd || pSeoTplPrev || pSeoTpl || pSeoFb || pShProdPrev || pShProd || pShCatPrev || pShCat || pOrphanDiag || pOrphanFix || pImgDry || pImgApply || pSeoPriDry || pSeoPriApply || refreshing

  const loadDiagnostics = useCallback(() => {
    sMigDiag(async () => {
      try { setDiag(await getCatalogDiagnosticsAction()) } catch { /* never crash the page */ }
      try { setSeo(await getSeoCountsAction()) } catch { /* ignore */ }
    })
  }, [])

  useEffect(() => { loadDiagnostics() }, [loadDiagnostics])

  // Best-effort refresh of derived status after a mutation. Fully guarded — a
  // failure here must never bubble out of the transition (which would navigate
  // the whole page to the error boundary).
  const refreshDerived = useCallback(async () => {
    try { router.refresh() } catch { /* ignore */ }
    try { setAutoStatus(await getAutomationStatusAction()) } catch { /* ignore */ }
    try { setDiag(await getCatalogDiagnosticsAction()) } catch { /* ignore */ }
    try { setSeo(await getSeoCountsAction()) } catch { /* ignore */ }
  }, [router])

  // Single bulletproof runner: action + all follow-up awaits live inside one
  // try/catch, so no rejection can ever escape the transition.
  const run = useCallback((
    start: (fn: () => Promise<void>) => void,
    action: () => Promise<ActionResult>,
    setResult: (r: StepResult) => void,
  ) => {
    start(async () => {
      try {
        setResult(toStepResult(await action()))
      } catch (e) {
        setResult({ ok: false, message: e instanceof Error ? e.message : 'Несподівана помилка' })
      }
      await refreshDerived()
    })
  }, [refreshDerived])

  function refreshStatus() {
    startRefresh(async () => {
      try { setAutoStatus(await getAutomationStatusAction()) } catch { /* ignore */ }
    })
  }

  function runDiagnose() {
    sDiag(async () => {
      try {
        setRDiag(await inspectSupplierFeedsAction())
      } catch (e) {
        setRDiag({ error: e instanceof Error ? e.message : 'Помилка діагностики' })
      }
    })
  }

  const runsByType = new Map(autoStatus.lastRuns.map((r) => [r.sync_type, r]))

  // Capability gating — only disable once diagnostics report the required
  // migration as missing (avoids flicker while loading).
  const caps = diag?.capabilities
  const blockSeed     = !!caps && !caps.canSeedManual
  const blockFinalize = !!caps && !caps.canFinalizeCategories
  const blockBackfill = !!caps && !caps.canBackfillSlugs
  const blockSeoGen   = !!caps && !caps.canGenerateSeo
  const migHint = (text: string) => (
    <p className="text-xs text-red-600 mt-1">⚠ {text} Див. «Стан бази даних» вище.</p>
  )

  const numericIssue = stats.numericCategoryNames > 0
  const suspicious = stats.suspiciousPriceCount > 0

  return (
    <div className="space-y-3">

      {/* ════════════════════ A. STATUS ════════════════════ */}
      <SectionHeader title="Стан" />

      {/* Key counts */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
          <Stat label="Опубліковано" value={stats.catalogProductsPublished.toLocaleString('uk-UA')} />
          <Stat label="Draft" value={stats.catalogProductsDraft.toLocaleString('uk-UA')} />
          <Stat
            label="Черга постачальника"
            value={autoStatus.queueCount.toLocaleString('uk-UA')}
            tone={autoStatus.queueCount > 0 ? 'blue' : 'green'}
          />
          <Stat
            label="Числові категорії"
            value={stats.numericCategoryNames.toLocaleString('uk-UA')}
            tone={numericIssue ? 'red' : 'green'}
          />
          <Stat
            label="Товари в числових"
            value={stats.numericSlugProductCount.toLocaleString('uk-UA')}
            tone={stats.numericSlugProductCount > 0 ? 'red' : 'green'}
          />
          <Stat
            label="Ціна за запитом"
            value={stats.suspiciousPriceCount.toLocaleString('uk-UA')}
            tone={suspicious ? 'amber' : 'green'}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-3 pt-3 border-t border-gray-100 text-gray-500">
          {stats.productsWithNoCategory > 0 && (
            <span className="text-amber-600 font-medium">⚠ {stats.productsWithNoCategory.toLocaleString('uk-UA')} без категорії</span>
          )}
          {autoStatus.queueCount > 0
            ? <span className="text-blue-600 font-medium">⟳ backfill активний</span>
            : <span className="text-green-600 font-medium">✓ maintenance</span>}
          {!autoStatus.enabled && <span className="text-amber-600 font-medium">⚠ CRON_SECRET не встановлено</span>}
          {autoStatus.maxProductsReached && (
            <span className="text-amber-600 font-medium">⚠ Ліміт публікації {autoStatus.publishedCount.toLocaleString('uk-UA')}/{AUTOMATION_MAX_PUBLISHED.toLocaleString('uk-UA')}</span>
          )}
          <button
            onClick={refreshStatus}
            disabled={anyPending}
            className="ml-auto text-gray-400 hover:text-gray-700 disabled:opacity-40"
            title="Оновити статус"
          >
            {refreshing ? '…' : '↻ оновити'}
          </button>
        </div>
      </div>

      {/* Quick links — this page is maintenance-only; daily work lives elsewhere. */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/admin/catalog" className="font-medium text-gray-600 hover:text-gray-900">← Каталог</Link>
        <Link href="/admin/catalog/search-insights" className="font-medium text-honey-700 hover:underline">🔍 Пошукові запити</Link>
        <span className="text-xs text-gray-400 sm:ml-auto">Технічне обслуговування каталогу. Щоденний імпорт працює автоматично за розкладом.</span>
      </div>

      {/* ════════════════════ MANUAL CATALOG (owner-relevant) ════════════════════ */}
      <SectionHeader title="Ручний каталог" hint="Мед-шоколад, масло на замовлення, подарункові набори, натуральні продукти, олії, метал. Окремо від постачальника — імпорт постачальника їх не перезаписує." />

      <StepCard
        title="Заповнити ручний каталог"
        description="Створює/оновлює ручні категорії та товари. Безпечно повторювати — нічого не дублюється."
        buttonLabel="▶ Заповнити"
        accent={blockSeed ? 'border-red-300' : undefined}
        pending={pManual}
        disabled={anyPending || blockSeed}
        onRun={() => run(sManual, seedManualCatalogAction, setRManual)}
        result={rManual}
        note={blockSeed ? migHint('Відсутні колонки ручного каталогу (міграції 051–055).') : undefined}
      />

      {/* ════════════════════ SEO COVERAGE SUMMARY (owner-relevant) ════════════════════ */}
      <SectionHeader title="SEO — покриття" hint="Скільки категорій і товарів мають SEO. Кнопки генерації — у розширених інструментах." />

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
          <Stat label="Категорій без SEO" value={(seo?.categoriesMissing ?? 0).toLocaleString('uk-UA')} tone={seo && seo.categoriesMissing > 0 ? 'amber' : 'green'} />
          <Stat label="Товарів без SEO" value={(seo?.productsMissing ?? 0).toLocaleString('uk-UA')} tone={seo && seo.productsMissing > 0 ? 'amber' : 'green'} />
          <Stat label="AI згенеровано" value={(seo?.aiGenerated ?? 0).toLocaleString('uk-UA')} tone="green" />
          <Stat label="Шаблон (базове)" value={(seo?.templateGenerated ?? 0).toLocaleString('uk-UA')} tone="green" />
          <Stat label="Legacy fallback" value={(seo?.legacyFallback ?? 0).toLocaleString('uk-UA')} />
          <Stat label="Ручний замок" value={(seo?.manualLocked ?? 0).toLocaleString('uk-UA')} />
          <Stat label="n8n webhook" value={n8nSeoConfigured ? 'OK' : '—'} tone={n8nSeoConfigured ? 'green' : 'red'} />
        </div>
        {!n8nSeoConfigured && (
          <p className="text-xs text-red-600 mt-3 pt-3 border-t border-gray-100">
            ⚠ N8N_SEO_WEBHOOK_URL не встановлено — додайте env var у Vercel, щоб увімкнути генерацію SEO.
          </p>
        )}
      </div>

      {/* ════════════════════ ADVANCED TECHNICAL TOOLS (collapsed by default) ════════════════════ */}
      <details className="rounded-xl border border-gray-200 bg-gray-50/60">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-600 hover:text-gray-900">
          ⚙️ Розширені технічні інструменти
          <span className="block text-xs font-normal text-gray-400 mt-0.5">
            Синхронізація постачальника, ремонт категорій, генерація SEO, імпорт з таблиць, діагностика. Рідкісне технічне обслуговування — не потрібне для щоденної роботи.
          </span>
        </summary>
        <div className="space-y-3 p-3 pt-0">

      <MigrationDiagnosticsBlock diag={diag} pending={pMigDiag} onRefresh={loadDiagnostics} />
      <HealthBlock envStatus={envStatus} lastRuns={autoStatus.lastRuns} />

      {/* ════════════════════ B. DAILY SUPPLIER SYNC ════════════════════ */}
      <SectionHeader
        title="Щоденна синхронізація постачальника"
        hint="Порядок: 1) Синхр. API → 2) Імпорт у каталог → 3) Публікація"
      />

      <StepCard
        step={1}
        title="Синхронізація API"
        description="Завантажує товари, ціни (USD → UAH) та залишки з personal.cab обмеженою партією. Підозрілі ціни позначаються як «Ціна за запитом»."
        buttonLabel="▶ Запустити"
        pending={pProducts}
        disabled={anyPending}
        onRun={() => run(sProducts, syncApiProductsAction, setRProducts)}
        result={rProducts}
        runStatus={<RunStatusRow run={runsByType.get('products')} />}
      />

      {/* Dry-run import — safe to run first; writes nothing */}
      <StepCard
        title="Пробний запуск імпорту"
        description="Перевіряє, скільки товарів можна перенести з черги постачальника, але нічого не записує. Запустіть перед реальним імпортом."
        buttonLabel="🔍 Перевірити"
        buttonClass={BTN_BLUE}
        pendingLabel="Перевірка…"
        pending={pImportDry}
        disabled={anyPending}
        onRun={() => run(sImportDry, dryRunImportBatchAction, setRImportDry)}
        result={rImportDry}
      />

      <StepCard
        step={2}
        title="Імпорт у каталог (партія)"
        description={stats.supplierProductsNew > 0
          ? `${stats.supplierProductsNew.toLocaleString('uk-UA')} нових товарів готові до імпорту. Переносить партію ${AUTOMATION_BATCH_SIZE}, оновлює ціни/зображення існуючих.`
          : `Переносить партію ${AUTOMATION_BATCH_SIZE} нових товарів у каталог, оновлює ціни та зображення існуючих (не дублює).`}
        buttonLabel="▶ Запустити"
        pending={pImport}
        disabled={anyPending}
        onRun={() => run(sImport, importBatchAction, setRImport)}
        result={rImport}
        runStatus={<RunStatusRow run={runsByType.get('import_batch')} />}
      />

      {/* Full import — bypasses published cap, processes entire backlog in one call */}
      <StepCard
        title="Повний імпорт (весь бекlog)"
        description={`Переносить усю чергу (до 10 000 товарів за раз) без обмеження ліміту ${AUTOMATION_MAX_PUBLISHED.toLocaleString('uk-UA')}. Використовуйте після пробного запуску.`}
        buttonLabel="▶ Повний імпорт"
        buttonClass={BTN_AMBER}
        pendingLabel="Імпорт…"
        pending={pImportFull}
        disabled={anyPending}
        onRun={() => run(sImportFull, fullImportBatchAction, setRImportFull)}
        result={rImportFull}
      />

      {/* Пріоритетний імпорт SEO-товарів */}
      <StepCard
        title="Пріоритетний імпорт SEO-товарів (перевірка)"
        description="Показує, скільки артикулів із SEO-таблиці є в supplier_products, але ще не в каталозі. Запустіть перед застосуванням."
        buttonLabel="🔍 Перевірити"
        buttonClass={BTN_BLUE}
        pendingLabel="Перевірка…"
        pending={pSeoPriDry}
        disabled={anyPending}
        onRun={() => run(sSeoPriDry, seoSheetPriorityDryRunAction, setRSeoPriDry)}
        result={rSeoPriDry}
      />
      <StepCard
        title="Пріоритетний імпорт SEO-товарів"
        description="Імпортує лише ті товари з SEO-таблиці, яких ще немає в каталозі. Дозволяє відразу застосувати SEO, не чекаючи повного бекlogу."
        buttonLabel="▶ Імпортувати пріоритетні"
        buttonClass={BTN_AMBER}
        pendingLabel="Імпорт…"
        pending={pSeoPriApply}
        disabled={anyPending}
        onRun={() => run(sSeoPriApply, seoSheetPriorityImportAction, setRSeoPriApply)}
        result={rSeoPriApply}
      />

      {/* Відновлення осиротілих схвалених рядків */}
      <StepCard
        title="Осиротілі схвалені рядки (діагностика)"
        description="Знаходить рядки supplier_products з is_approved=true, яких немає в catalog_products — симптом перерваного імпорту."
        buttonLabel="🔍 Перевірити"
        buttonClass={BTN_BLUE}
        pendingLabel="Пошук…"
        pending={pOrphanDiag}
        disabled={anyPending}
        onRun={() => run(sOrphanDiag, findOrphanedAction, setROrphanDiag)}
        result={rOrphanDiag}
      />
      <StepCard
        title="Відновлення осиротілих рядків"
        description="Скидає is_approved=false для осиротілих рядків. Після цього вони знову потрапляють у чергу і можуть бути імпортовані."
        buttonLabel="▶ Відновити"
        buttonClass={BTN_AMBER}
        pendingLabel="Відновлення…"
        pending={pOrphanFix}
        disabled={anyPending}
        onRun={() => run(sOrphanFix, recoverOrphanedAction, setROrphanFix)}
        result={rOrphanFix}
      />

      {/* Витяг зображень постачальника з raw_data */}
      <StepCard
        title="Зображення постачальника (перевірка)"
        description="Перевіряє, скільки рядків supplier_products мають images.zone URL у raw_data, але порожній main_image_url."
        buttonLabel="🔍 Перевірити"
        buttonClass={BTN_BLUE}
        pendingLabel="Перевірка…"
        pending={pImgDry}
        disabled={anyPending}
        onRun={() => run(sImgDry, extractSupplierImagesDryRunAction, setRImgDry)}
        result={rImgDry}
      />
      <StepCard
        title="Витяг зображень із raw_data"
        description="Копіює images.zone URL із raw_data.mainimage у supplier_products.main_image_url. Не перезаписує наявні зображення."
        buttonLabel="▶ Заповнити зображення"
        buttonClass={BTN_AMBER}
        pendingLabel="Заповнення…"
        pending={pImgApply}
        disabled={anyPending}
        onRun={() => run(sImgApply, extractSupplierImagesAction, setRImgApply)}
        result={rImgApply}
      />

      <StepCard
        step={3}
        title="Публікація товарів"
        description={stats.catalogProductsDraft > 0
          ? `${stats.catalogProductsDraft.toLocaleString('uk-UA')} товарів у статусі draft. Ліміт публікації — ${AUTOMATION_MAX_PUBLISHED.toLocaleString('uk-UA')}.`
          : `Публікує всі draft-товари після імпорту. Ліміт публікації — ${AUTOMATION_MAX_PUBLISHED.toLocaleString('uk-UA')}.`}
        buttonLabel="▶ Запустити"
        buttonClass={BTN_GREEN}
        pending={pPublish}
        disabled={anyPending}
        onRun={() => run(sPublish, publishBatchAction, setRPublish)}
        result={rPublish}
        runStatus={<RunStatusRow run={runsByType.get('publish_batch')} />}
      />

      {/* ════════════════════ C. CATEGORIES ════════════════════ */}
      <SectionHeader
        title="Категорії"
        hint="Порядок: 1) Діагностика → 2) Виправлення назв → 3) Фіналізація → 4) Привʼязка слугів"
      />

      <StepCard
        step={1}
        title="Діагностика постачальника"
        description="Перевіряє, де у відповіді постачальника живуть назви категорій (YML/XML чи JSON). Запустіть перед виправленням."
        buttonLabel="🔍 Перевірити"
        pendingLabel="Перевірка…"
        pending={pDiag}
        disabled={anyPending}
        onRun={runDiagnose}
      >
        {rDiag && <DiagnoseOutput rDiag={rDiag} />}
      </StepCard>

      <StepCard
        step={2}
        title="Виправлення назв категорій"
        description={numericIssue
          ? `${stats.numericCategoryNames.toLocaleString('uk-UA')} категорій мають числові назви — /catalog показує лише «Інші товари». Витягує справжні назви з фіду постачальника.`
          : 'Усі назви категорій людиночитані. Витягує справжні назви з фіду постачальника за потреби.'}
        buttonLabel="▶ Виправити"
        buttonClass={numericIssue ? BTN_RED : BTN_GRAY}
        accent={numericIssue ? 'border-red-200' : undefined}
        pending={pRepair}
        disabled={anyPending}
        onRun={() => run(sRepair, repairCategoryNamesAction, setRRepair)}
        result={rRepair}
      />

      <StepCard
        step={3}
        title="Фіналізація категорій"
        description="Перейменовує слабкі мітки, обʼєднує дублікати та прибирає числові категорії. Ручні категорії не чіпаються. Запустіть після «Виправлення назв»."
        buttonLabel="▶ Фіналізувати"
        buttonClass={numericIssue ? BTN_RED : BTN_GRAY}
        accent={blockFinalize ? 'border-red-300' : numericIssue ? 'border-red-300' : undefined}
        pending={pFinalize}
        disabled={anyPending || blockFinalize}
        onRun={() => run(sFinalize, normalizeAndFinalizeCategoriesAction, setRFinalize)}
        result={rFinalize}
        note={blockFinalize ? migHint('Потрібна колонка catalog_categories.source (міграція 051/052).') : undefined}
      />

      <StepCard
        step={4}
        title="Привʼязка слугів категорій"
        description={stats.productsWithNoCategory > 0
          ? `${stats.productsWithNoCategory.toLocaleString('uk-UA')} товарів без category_slug. Виконується одним SQL UPDATE у Postgres (не вантажить рядки у память).`
          : 'Перепривʼязує товари до категорій. Виконується одним SQL UPDATE у Postgres. Запустіть, якщо /catalog показує «Категорії готуються».'}
        buttonLabel="▶ Привʼязати"
        buttonClass={stats.productsWithNoCategory > 0 ? BTN_AMBER : BTN_GRAY}
        accent={blockBackfill ? 'border-red-300' : stats.productsWithNoCategory > 0 ? 'border-amber-200' : undefined}
        pending={pBackfill}
        disabled={anyPending || blockBackfill}
        onRun={() => run(sBackfill, backfillCategorySlugsAction, setRBackfill)}
        result={rBackfill}
        note={blockBackfill ? migHint('Потрібна функція backfill_category_slugs() (міграція 052).') : undefined}
      />

      {/* ════════════════════ E. SEO GENERATION ════════════════════ */}
      <SectionHeader
        title="SEO — генерація"
        hint="Джерело правди — каталог Supabase. Генерація через n8n (AI). Ручні описи із замком не перезаписуються."
      />

      <StepCard
        step={1}
        title="Згенерувати SEO категорій"
        description={`Надсилає партію (${50}) категорій без SEO у n8n для генерації українською. Опубліковані категорії, без ручного замка.`}
        buttonLabel="▶ Надіслати партію"
        buttonClass={BTN_BLUE}
        pending={pSeoCat}
        disabled={anyPending || !n8nSeoConfigured || blockSeoGen}
        onRun={() => run(sSeoCat, generateCategorySeoBatchAction, setRSeoCat)}
        result={rSeoCat}
        note={blockSeoGen ? migHint('Відсутні SEO-колонки (міграція 054).') : undefined}
      />

      <StepCard
        step={2}
        title="Згенерувати SEO товарів"
        description={`Надсилає партію (${50}) товарів без SEO у n8n. Спершу опубліковані товари з фото, ціною та категорією. Ручні товари зберігають свої описи.`}
        buttonLabel="▶ Надіслати партію"
        buttonClass={BTN_BLUE}
        pending={pSeoProd}
        disabled={anyPending || !n8nSeoConfigured || blockSeoGen}
        onRun={() => run(sSeoProd, generateProductSeoBatchAction, setRSeoProd)}
        result={rSeoProd}
        note={blockSeoGen ? migHint('Відсутні SEO-колонки (міграція 054).') : undefined}
      />

      <StepCard
        title="Базове SEO без AI — перевірка (dry-run)"
        description="Показує, скільки опублікованих товарів отримають meta_title + meta_description зі вбудованого шаблону (назва + категорія + ціна). Нічого не записує. Працює без n8n."
        buttonLabel="▶ Перевірити"
        pending={pSeoTplPrev}
        disabled={anyPending || blockSeoGen}
        onRun={() => run(sSeoTplPrev, previewProductSeoTemplateAction, setRSeoTplPrev)}
        result={rSeoTplPrev}
        note={blockSeoGen ? migHint('Відсутні SEO-колонки (міграція 054).') : undefined}
      />

      <StepCard
        title="Згенерувати базове SEO без AI"
        description="Записує meta_title + meta_description (українською) для партії (500) опублікованих товарів без SEO. Не чіпає ручний замок, AI та ручні описи; не перезаписує заповнені поля. Товари лишаються в черзі n8n для AI-покращення."
        buttonLabel="▶ Згенерувати"
        buttonClass={BTN_BLUE}
        pending={pSeoTpl}
        disabled={anyPending || blockSeoGen}
        onRun={() => run(sSeoTpl, generateProductSeoTemplateAction, setRSeoTpl)}
        result={rSeoTpl}
        note={blockSeoGen ? migHint('Відсутні SEO-колонки (міграція 054).') : undefined}
      />

      <StepCard
        title="Тимчасовий fallback опису"
        description="Заповнює порожній опис із meta_description (set-based SQL). Тимчасово, доки AI не згенерує. Не чіпає ручний замок."
        buttonLabel="▶ Заповнити"
        pending={pSeoFb}
        disabled={anyPending || blockSeoGen}
        onRun={() => run(sSeoFb, backfillSeoDescriptionFallbackAction, setRSeoFb)}
        result={rSeoFb}
        note={blockSeoGen ? migHint('Відсутні SEO-колонки (міграція 054).') : undefined}
      />

      {/* ════════════════════ F. SEO FROM GOOGLE SHEETS (MERGE) ════════════════════ */}
      <SectionHeader
        title="SEO з Google Sheets (безпечний мердж)"
        hint="Імпорт готового SEO з таблиць за SKU / назвою. Спершу dry-run. Не перезаписує ручні/AI/заповнені поля; кожне значення проходить валідацію."
      />

      <StepCard
        title="SEO товарів з Sheets — перевірка (dry-run)"
        description="Показує, скільки товарів отримають meta_title / meta_description / keywords / опис із таблиці (PRODUCT_SEO_CSV_URL), збіг за SKU. Нічого не записує. Показує зразки та помилки валідації."
        buttonLabel="▶ Перевірити"
        pendingLabel="Перевірка…"
        pending={pShProdPrev}
        disabled={anyPending || !productSeoUrl || blockSeoGen}
        onRun={() => run(sShProdPrev, previewProductSeoSheetAction, setRShProdPrev)}
        result={rShProdPrev}
        note={blockSeoGen ? migHint('Відсутні SEO-колонки (міграція 054).') : undefined}
      >
        <EnvUrlDisplay url={productSeoUrl} label="PRODUCT_SEO_CSV_URL" />
      </StepCard>

      <StepCard
        title="SEO товарів з Sheets — застосувати"
        description="Записує SEO з таблиці у порожні поля (meta_title, meta_description, seo_keywords, опис). Збіг за SKU. Не чіпає ручний замок, AI/manual та вже заповнені поля. Позначає seo_source='sheet'."
        buttonLabel="▶ Застосувати"
        buttonClass={BTN_BLUE}
        pendingLabel="Імпорт…"
        pending={pShProd}
        disabled={anyPending || !productSeoUrl || blockSeoGen}
        onRun={() => run(sShProd, () => importProductSeoSheetAction(false), setRShProd)}
        result={rShProd}
        note={blockSeoGen ? migHint('Відсутні SEO-колонки (міграція 054).') : undefined}
      />

      <StepCard
        title="SEO категорій з Sheets — перевірка (dry-run)"
        description="Показує, скільки категорій отримають опис / meta із таблиці (CATEGORY_SEO_CSV_URL), збіг за назвою. Нічого не записує. Незбіги виводяться окремо для звірки."
        buttonLabel="▶ Перевірити"
        pendingLabel="Перевірка…"
        pending={pShCatPrev}
        disabled={anyPending || !categorySeoUrl || blockSeoGen}
        onRun={() => run(sShCatPrev, previewCategorySeoSheetAction, setRShCatPrev)}
        result={rShCatPrev}
        note={blockSeoGen ? migHint('Відсутні SEO-колонки (міграція 054).') : undefined}
      >
        <EnvUrlDisplay url={categorySeoUrl} label="CATEGORY_SEO_CSV_URL" />
      </StepCard>

      <StepCard
        title="SEO категорій з Sheets — застосувати"
        description="Записує опис / meta з таблиці у порожні поля категорій. Збіг за назвою (name_ua / name / slug). Не чіпає ручний замок, AI/manual та заповнені поля. Позначає seo_source='sheet'."
        buttonLabel="▶ Застосувати"
        buttonClass={BTN_BLUE}
        pendingLabel="Імпорт…"
        pending={pShCat}
        disabled={anyPending || !categorySeoUrl || blockSeoGen}
        onRun={() => run(sShCat, () => importCategorySeoSheetAction(false), setRShCat)}
        result={rShCat}
        note={blockSeoGen ? migHint('Відсутні SEO-колонки (міграція 054).') : undefined}
      />

      {/* Legacy Google Sheets SEO — collapsed, off the main flow */}
      <details className="bg-white rounded-xl border border-gray-200 p-4">
        <summary className="cursor-pointer select-none text-xs font-semibold text-gray-500">
          Legacy: SEO з Google Sheets (застаріле — лише як запасний варіант)
        </summary>
        <div className="mt-3">
          <StepCard
            title="SEO товарів (Google Sheets)"
            description="Застарілий імпорт за SKU з Google Sheets. Нова система — генерація через n8n вище. Використовуйте лише за потреби."
            buttonLabel="▶ Запустити (legacy)"
            buttonClass={BTN_GRAY}
            pending={pSeo}
            disabled={anyPending || !productSeoUrl}
            onRun={() => run(sSeo, runProductSeoAction, setRSeo)}
            result={rSeo}
            runStatus={<RunStatusRow run={runsByType.get('product_seo')} />}
          >
            <EnvUrlDisplay url={productSeoUrl} label="PRODUCT_SEO_CSV_URL" />
          </StepCard>
        </div>
      </details>

        </div>
      </details>

    </div>
  )
}

function Stat({ label, value, tone = 'gray' }: { label: string; value: string; tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue' }) {
  const color = {
    gray: 'text-gray-900', green: 'text-green-700', red: 'text-red-600', amber: 'text-amber-600', blue: 'text-blue-700',
  }[tone]
  return (
    <div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
      <div className="text-gray-400">{label}</div>
    </div>
  )
}

function DiagnoseOutput({ rDiag }: { rDiag: FeedDiagResult | { error: string } }) {
  if ('error' in rDiag) {
    return <div className="mt-3 text-xs rounded-lg border border-red-200 px-3 py-2 bg-red-50 text-red-700">✗ {rDiag.error}</div>
  }
  return (
    <div className="mt-3 text-xs rounded-lg border border-gray-200 overflow-hidden">
      <div className={`px-3 py-2 flex items-center gap-3 font-medium ${rDiag.winnerSource !== 'none' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
        <span>{rDiag.winnerSource !== 'none' ? '✓' : '⚠'}</span>
        <span>Джерело назв: <strong>{rDiag.winnerSource}</strong></span>
        {rDiag.winnerSource !== 'none'
          ? <span className="text-green-600 font-normal">— категорії можна виправити ↓</span>
          : <span className="text-amber-700 font-normal">— назви знайти не вдалося, перевірте API</span>}
      </div>

      {(['yml', 'xml'] as const).map((type) => {
        const feed = rDiag[type]
        const hasError = 'error' in feed
        const named = hasError ? 0 : feed.namedCategoryCount
        const parsed = hasError ? 0 : feed.parsedCategoryCount
        const hasBlock = hasError ? false : feed.hasCategoriesBlock
        const samples = hasError ? [] : feed.sampleCategories
        return (
          <div key={type} className="border-t border-gray-100 px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold uppercase text-gray-500 w-8">{type}</span>
              {hasError
                ? <span className="text-red-500">{(feed as { error: string }).error}</span>
                : <>
                    <span className={hasBlock ? 'text-green-600' : 'text-gray-400'}>{hasBlock ? '✓ <categories>' : '✗ no <categories>'}</span>
                    <span className="text-gray-400">·</span>
                    <span className={named > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}>{named} / {parsed} назв</span>
                  </>}
            </div>
            {!hasError && samples.length > 0 && (
              <details>
                <summary className="cursor-pointer text-gray-400 hover:text-gray-700 select-none">Зразки ({samples.length})</summary>
                <div className="mt-1 grid grid-cols-1 gap-0.5 font-mono">
                  {samples.map((c) => (
                    <div key={c.id} className="flex gap-2 text-gray-600">
                      <span className="text-gray-400 w-12 shrink-0">{c.id}</span>
                      <span className="text-green-700 font-medium">{c.name}</span>
                      {c.parentId && <span className="text-gray-300">← {c.parentId}</span>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )
      })}

      {'productCount' in rDiag.json && (
        <div className="border-t border-gray-100 px-3 py-2">
          <span className="font-mono font-bold uppercase text-gray-500 w-8 inline-block">json</span>
          <span className="ml-2 text-gray-600">{rDiag.json.productCount} товарів</span>
          <span className="ml-2 text-gray-400">·</span>
          <span className="ml-2">
            {rDiag.json.hasReadableCategoryNameInProducts
              ? <span className="text-blue-700">назви в полях: {rDiag.json.readableCategoryNameFields.join(', ')}</span>
              : <span className="text-gray-400">назв у продуктах немає — тільки category_id</span>}
          </span>
        </div>
      )}
    </div>
  )
}
