'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import {
  previewSheetImport, applySheetImport,
  previewCategorySeoImport, applyCategorySeoImport,
} from './actions'
import type { ImportPreview, ImportRow, ApplyResult, CatSeoPreview, CatSeoRow, CatSeoResult } from './actions'

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_PRODUCT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9LdpBMcaR3UsJjbNEFRs8RYV0DAgyIsW3hcDIqELxrAV8z6O6QPkDdpTi3cyuECM5R783boFU8dHR/pub?output=csv'
const DEFAULT_CATEGORY_SEO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFz7CfebTkj8qLiKNIyIM2evNTgKPtXZtOnc2H5m6T1khTXJY0Aw-VOhcfkhoROErQKU4VSBvDS7fKC/pub?output=csv'

// Old edit-link URLs that may be stored in existing sessions — replaced automatically
const LEGACY_PRODUCT_URL = 'https://docs.google.com/spreadsheets/d/1g_fljSpg4_dPk8Zij7sHF-DKbvk3C_mOdqQlf4anGIU/edit?gid=1604331528#gid=1604331528'
const LEGACY_CATEGORY_URL = 'https://docs.google.com/spreadsheets/d/1En8K5-4-ThCl2QcDMk_CFuT3ymjK2aWDV-i4Uat2Ww4/edit?gid=0#gid=0'

const LS_PROD_URL = 'import_prod_url'
const LS_CAT_URL = 'import_cat_url'

// ─── Constants ────────────────────────────────────────────────────────────────
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent'
const BTN = 'bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const BTN_APPLY = 'bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const LEGACY_URL_MAP: Record<string, string> = {
  [LEGACY_PRODUCT_URL]:  DEFAULT_PRODUCT_SHEET_URL,
  [LEGACY_CATEGORY_URL]: DEFAULT_CATEGORY_SEO_URL,
}

function usePersistedUrl(lsKey: string, defaultVal: string) {
  const [val, setVal] = useState(defaultVal)
  const ready = useRef(false)
  useEffect(() => {
    if (ready.current) return
    ready.current = true
    try {
      const stored = localStorage.getItem(lsKey)
      const migrated = stored ? (LEGACY_URL_MAP[stored] ?? stored) : null
      if (migrated && migrated !== stored) localStorage.setItem(lsKey, migrated)
      setVal(migrated ?? defaultVal)
    } catch { /* SSR */ }
  }, [lsKey, defaultVal])
  function set(v: string) {
    setVal(v)
    try { localStorage.setItem(lsKey, v) } catch { /* SSR */ }
  }
  return [val, set] as const
}

// ─── Product SEO tab ──────────────────────────────────────────────────────────
function ProductSeoTab() {
  const [sheetUrl, setSheetUrl] = usePersistedUrl(LS_PROD_URL, DEFAULT_PRODUCT_SHEET_URL)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const [isPreviewing, startPreview] = useTransition()
  const [isApplying, startApply] = useTransition()

  function handlePreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setPreview(null)
    setApplyResult(null)
    startPreview(async () => setPreview(await previewSheetImport(fd)))
  }

  function handleApply() {
    if (!preview?.rows) return
    startApply(async () => setApplyResult(await applySheetImport(preview.rows, false)))
  }

  const updateCount = preview?.rows.filter((r) => r.action === 'update').length ?? 0

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 max-w-2xl">
        <p className="text-sm font-semibold text-amber-800">Тільки SEO-поля оновлюються</p>
        <p className="text-xs text-amber-700 mt-1">
          Ціна, фото, залишок — завжди з API. Для додавання нових товарів запустіть Пайплайн (Кроки 1–5).
        </p>
      </div>

      <form onSubmit={handlePreview} className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 mb-5 max-w-2xl">
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Google Таблиця — Прайс товарів *
          </label>
          <input
            name="sheet_url"
            type="text"
            required
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            className={INPUT}
            placeholder="https://docs.google.com/spreadsheets/d/…"
          />
          <p className="text-xs text-gray-400 mt-1">
            Колонки: <span className="font-mono">SKU · Name · Categories · Description · Meta Title · Meta Description</span>
          </p>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Ліміт рядків</label>
          <div className="flex gap-2">
            {(['100', '300', '500'] as const).map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="limit" value={s} defaultChecked={s === '100'} className="accent-gray-900" />
                {s}
              </label>
            ))}
          </div>
        </div>
        <button type="submit" disabled={isPreviewing} className={BTN}>
          {isPreviewing ? 'Завантаження…' : 'Переглянути'}
        </button>
      </form>

      {preview && !preview.ok && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-5 max-w-2xl">
          <p className="font-semibold text-red-700">Помилка</p>
          <p className="text-sm text-red-600 mt-1 font-mono">{preview.error}</p>
        </div>
      )}

      {applyResult && (
        <div className={`border rounded-xl p-5 mb-5 max-w-2xl ${applyResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`font-semibold ${applyResult.ok ? 'text-green-800' : 'text-red-700'}`}>
            {applyResult.ok ? 'SEO оновлено' : 'Помилки при оновленні'}
          </p>
          <p className={`text-sm mt-1 ${applyResult.ok ? 'text-green-700' : 'text-red-600'}`}>{applyResult.message}</p>
        </div>
      )}

      {preview?.ok && preview.rows.length > 0 && !applyResult && (
        <>
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Аналіз ({preview.total} рядків)</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Буде оновлено: <span className="text-blue-600 font-medium">{updateCount}</span>
                {' · '}Не в каталозі: {preview.skip_count}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">#</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">SKU</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Назва</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 hidden md:table-cell">Категорія</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-400">Дія</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.rows.slice(0, 200).map((row: ImportRow) => (
                    <tr key={row.row_num} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-xs text-gray-400">{row.row_num}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{row.supplier_sku}</td>
                      <td className="px-4 py-2 text-gray-900 max-w-[200px] truncate" title={row.name}>{row.name || '—'}</td>
                      <td className="px-4 py-2 text-xs hidden md:table-cell">
                        {row.category_slug
                          ? <span className="text-green-700 font-mono">{row.category_slug}</span>
                          : row.category_raw
                          ? <span className="text-amber-600">{row.category_raw} ⚠</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          row.action === 'update' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {row.action === 'update' ? 'Оновити SEO' : 'Не в каталозі'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 max-w-2xl">
            <div className="flex items-center gap-3">
              <button onClick={handleApply} disabled={isApplying || updateCount === 0} className={BTN_APPLY}>
                {isApplying ? 'Оновлюю…' : `Оновити SEO (${updateCount} товарів)`}
              </button>
              <button onClick={() => setPreview(null)} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Скасувати
              </button>
            </div>
            {updateCount === 0 && (
              <p className="text-xs text-amber-600 mt-2">Жодного товару не знайдено в каталозі. Спочатку запустіть Пайплайн Кроки 1–5.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Category SEO tab ─────────────────────────────────────────────────────────
function CategorySeoTab() {
  const [sheetUrl, setSheetUrl] = usePersistedUrl(LS_CAT_URL, DEFAULT_CATEGORY_SEO_URL)
  const [preview, setPreview] = useState<CatSeoPreview | null>(null)
  const [applyResult, setApplyResult] = useState<CatSeoResult | null>(null)
  const [isPreviewing, startPreview] = useTransition()
  const [isApplying, startApply] = useTransition()

  function handlePreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setPreview(null)
    setApplyResult(null)
    startPreview(async () => setPreview(await previewCategorySeoImport(fd)))
  }

  function handleApply() {
    if (!preview?.rows) return
    startApply(async () => setApplyResult(await applyCategorySeoImport(preview.rows)))
  }

  return (
    <div>
      <form onSubmit={handlePreview} className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 mb-5 max-w-2xl">
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Google Таблиця — SEO категорій *
          </label>
          <input
            name="cat_sheet_url"
            type="text"
            required
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            className={INPUT}
            placeholder="https://docs.google.com/spreadsheets/d/…"
          />
          <p className="text-xs text-gray-400 mt-1">
            Колонки: <span className="font-mono">Category | Description</span>
            {' '}— Category має збігатися з назвою в каталозі.
          </p>
        </div>
        <button type="submit" disabled={isPreviewing} className={BTN}>
          {isPreviewing ? 'Завантаження…' : 'Переглянути'}
        </button>
      </form>

      {preview && !preview.ok && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-5 max-w-2xl">
          <p className="font-semibold text-red-700">Помилка</p>
          <p className="text-sm text-red-600 mt-1">{preview.error}</p>
        </div>
      )}

      {applyResult && (
        <div className={`border rounded-xl p-5 mb-5 max-w-2xl ${applyResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`font-semibold ${applyResult.ok ? 'text-green-800' : 'text-red-700'}`}>
            {applyResult.ok ? 'Оновлено' : 'Помилки'}
          </p>
          <p className={`text-sm mt-1 ${applyResult.ok ? 'text-green-700' : 'text-red-600'}`}>{applyResult.message}</p>
        </div>
      )}

      {preview?.ok && preview.rows.length > 0 && !applyResult && (
        <>
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Категорії ({preview.total} рядків)</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Знайдено: <span className="text-green-600 font-medium">{preview.update_count}</span>
                {' · '}Не знайдено: {preview.skip_count}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">#</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Назва з таблиці</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Slug у каталозі</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 hidden md:table-cell">Опис</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-400">Дія</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.rows.map((row: CatSeoRow) => (
                    <tr key={row.row_num} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-xs text-gray-400">{row.row_num}</td>
                      <td className="px-4 py-2 text-gray-700">{row.name_raw}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {row.matched_slug
                          ? <span className="text-green-700">{row.matched_slug}</span>
                          : <span className="text-red-400">не знайдено</span>
                        }
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500 max-w-[200px] truncate hidden md:table-cell" title={row.description ?? ''}>
                        {row.description || '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          row.action === 'update' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {row.action === 'update' ? 'Оновити' : 'Пропустити'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 max-w-2xl">
            <div className="flex items-center gap-3">
              <button onClick={handleApply} disabled={isApplying || preview.update_count === 0} className={BTN_APPLY}>
                {isApplying ? 'Оновлюю…' : `Оновити ${preview.update_count} категорій`}
              </button>
              <button onClick={() => setPreview(null)} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Скасувати
              </button>
            </div>
          </div>
        </>
      )}

      {preview?.ok && preview.rows.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-6 text-center max-w-2xl">
          <p className="text-gray-500">Рядків не знайдено. Перевірте назви категорій у таблиці — вони мають збігатися з name_ua у каталозі.</p>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type Tab = 'products' | 'categories'

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>('products')

  useEffect(() => {
    const hash = window.location.hash
    if (hash === '#categories') setTab('categories')
  }, [])

  function switchTab(t: Tab) {
    setTab(t)
    window.location.hash = t === 'categories' ? '#categories' : '#products'
  }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Імпорт SEO з Google Sheets</h1>
        <p className="text-sm text-gray-500 mt-0.5">Оновлює тільки SEO-поля (опис, мета). Ціна та фото — завжди з API.</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([['products', 'SEO товарів'], ['categories', 'SEO категорій']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'products' ? <ProductSeoTab /> : <CategorySeoTab />}
    </div>
  )
}
