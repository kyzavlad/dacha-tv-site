'use server'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  syncCatalogCategories,
  publishAllCatalogCategories,
  backfillCategorySlugs,
  repairCategoryNamesFromProducts,
  normalizeAndFinalizeCategories,
  findOrphanedApprovedProducts,
  recoverOrphanedProducts,
  extractSupplierImages,
  importSeoSheetPriorityProducts,
} from '@/lib/catalog/pipeline'
import { getCatalogDiagnostics, type CatalogDiagnostics } from '@/lib/catalog/diagnostics'
export type { CatalogDiagnostics }
import {
  syncSupplierCategories,
  syncSupplierProducts,
  inspectSupplierFeeds,
  type FeedDiagResult,
} from '@/lib/supplier/sync'
export type { FeedDiagResult }
import { applyCategorySeoFromEnv } from '@/lib/catalog/seo'
import {
  getAutomationStatus,
  importBatch,
  publishBatch,
  runProductSeo,
} from '@/lib/catalog/automation'
import { syncProductsToCatalog } from '@/lib/catalog/pipeline'
import { AUTOMATION_BATCH_SIZE } from '@/lib/catalog/automation-config'
import type { AutomationStatus } from '@/lib/catalog/automation'
import {
  getSeoCounts,
  sendCategorySeoBatch,
  sendProductSeoBatch,
  backfillSeoDescriptionFallback,
  SEO_BATCH_DEFAULT,
  type SeoCounts,
} from '@/lib/catalog/seo-generate'
export type { SeoCounts }
import { generateProductSeoTemplate } from '@/lib/catalog/seo-template'
import {
  importProductSeoFromSheet,
  importCategorySeoFromSheet,
} from '@/lib/catalog/seo-sheet-import'

// ─── Unified, serialization-safe action result ───────────────────────────────
// Every pipeline *mutation* returns exactly this shape. Step-specific extras
// (counts, samples, warnings, HTTP diagnostics, …) ride along in `details`,
// which is ALWAYS a JSON-cloned plain object. That clone is the key fix: the
// React Server-Action serializer can no longer throw at the RSC boundary on a
// non-serializable field — which previously surfaced in the UI as the opaque
// "An error occurred in the Server Components render…" message inside a card.
export interface ActionResult {
  ok: boolean
  message: string
  details?: Record<string, unknown>
}

// Deep-clone through JSON → guarantees a plain, serializable object. Strips
// functions, class instances, undefined, symbols and circular refs.
function plain(value: unknown): Record<string, unknown> {
  try {
    const cloned = JSON.parse(JSON.stringify(value ?? {}))
    return cloned && typeof cloned === 'object' && !Array.isArray(cloned) ? cloned : {}
  } catch {
    return {}
  }
}

// Convert ANY thrown error (Supabase / PostgREST / redacted RSC / network) into
// a readable Ukrainian message. Raw PostgREST codes and stack traces never reach
// the UI.
function humanizeError(context: string, e: unknown): string {
  const err = e as { code?: string; message?: string } | undefined
  const code = err?.code
  const raw = (err?.message ?? (e instanceof Error ? e.message : String(e ?? ''))).trim()

  if (code === '42703' || /column .* does not exist/i.test(raw)) {
    return `${context}: відсутня колонка в базі даних — застосуйте міграції 047–052 у Supabase → SQL editor.`
  }
  if (code === '42P01' || /relation .* does not exist/i.test(raw)) {
    return `${context}: таблиця не існує — застосуйте міграції каталогу (037–052).`
  }
  if (code === 'PGRST202' || code === '42883' || /function .* does not exist/i.test(raw)) {
    return `${context}: SQL-функція відсутня — застосуйте міграцію 052_pipeline_safety.sql.`
  }
  if (/Server Components render/i.test(raw)) {
    return `${context}: помилка на сервері. Перевірте Vercel runtime logs за digest. Дані не змінено.`
  }
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|aborted/i.test(raw)) {
    return `${context}: помилка зʼєднання із зовнішнім сервісом. Спробуйте ще раз.`
  }
  return `${context}: ${raw || 'невідома помилка'}`
}

// Wrap a pipeline lib call: never throws, always returns an ActionResult, and
// revalidates the given paths only after the call resolves (revalidation itself
// is best-effort and can never fail the result).
async function safeAction<T extends { ok: boolean; message: string }>(
  context: string,
  fn: () => Promise<T>,
  revalidate: string[] = ['/admin/catalog/pipeline'],
): Promise<ActionResult> {
  try {
    const r = await fn()
    for (const p of revalidate) {
      try { revalidatePath(p) } catch { /* best-effort */ }
    }
    const { ok, message, ...rest } = r
    const details = plain(rest)
    return {
      ok: !!ok,
      message: String(message ?? (ok ? 'Готово' : 'Помилка')),
      details: Object.keys(details).length ? details : undefined,
    }
  } catch (e) {
    return { ok: false, message: humanizeError(context, e) }
  }
}

// ─── B. Daily supplier sync ─────────────────────────────────────────────────

export async function syncApiProductsAction(): Promise<ActionResult> {
  // pageSize caps how many rows are PROCESSED per run so a 190k-row feed never
  // lands in one serverless invocation.
  return safeAction('Синхронізація API', () => syncSupplierProducts({ pageSize: 1000 }))
}

export async function importBatchAction(): Promise<ActionResult> {
  return safeAction('Імпорт у каталог', () => importBatch())
}

// Dry-run: computes what would be inserted/updated but writes nothing and does
// NOT mark supplier rows as is_approved=true.
export async function dryRunImportBatchAction(): Promise<ActionResult> {
  return safeAction(
    'Пробний запуск імпорту',
    () => syncProductsToCatalog(AUTOMATION_BATCH_SIZE, { dryRun: true }),
    [],
  )
}

// Full import with no published-count cap — for manually loading the full backlog.
// Uses a large limit so all importable rows in the queue are processed in one call.
export async function fullImportBatchAction(): Promise<ActionResult> {
  return safeAction(
    'Повний імпорт у каталог',
    () => importBatch(10000, { skipCap: true }),
    ['/admin/catalog/pipeline', '/catalog'],
  )
}

// Diagnostic: find approved supplier rows absent from catalog_products (dry-run).
export async function findOrphanedAction(): Promise<ActionResult> {
  return safeAction('Діагностика осиротілих рядків', () => findOrphanedApprovedProducts(), [])
}

// Recovery: reset is_approved=false for orphaned rows so they re-queue.
export async function recoverOrphanedAction(): Promise<ActionResult> {
  return safeAction(
    'Відновлення осиротілих рядків',
    () => recoverOrphanedProducts({ apply: true }),
    ['/admin/catalog/pipeline'],
  )
}

// Supplier image extraction: copy raw_data.mainimage → supplier_products.main_image_url (dry-run).
export async function extractSupplierImagesDryRunAction(): Promise<ActionResult> {
  return safeAction('Витяг зображень постачальника (перевірка)', () => extractSupplierImages({ apply: false }), [])
}

// Supplier image extraction: apply.
export async function extractSupplierImagesAction(): Promise<ActionResult> {
  return safeAction(
    'Витяг зображень постачальника',
    () => extractSupplierImages({ apply: true }),
    ['/admin/catalog/pipeline'],
  )
}

// SEO-sheet priority import: show how many sheet SKUs can be imported first (dry-run).
export async function seoSheetPriorityDryRunAction(): Promise<ActionResult> {
  return safeAction('Пріоритетний імпорт SEO-товарів (перевірка)', () => importSeoSheetPriorityProducts({ apply: false }), [])
}

// SEO-sheet priority import: apply.
export async function seoSheetPriorityImportAction(): Promise<ActionResult> {
  return safeAction(
    'Пріоритетний імпорт SEO-товарів',
    () => importSeoSheetPriorityProducts({ apply: true }),
    ['/admin/catalog/pipeline', '/catalog'],
  )
}

export async function publishBatchAction(): Promise<ActionResult> {
  return safeAction('Публікація товарів', () => publishBatch(), ['/admin/catalog/pipeline', '/catalog'])
}

// ─── C. Categories ──────────────────────────────────────────────────────────

export async function repairCategoryNamesAction(): Promise<ActionResult> {
  return safeAction(
    'Виправлення назв категорій',
    () => repairCategoryNamesFromProducts(),
    ['/admin/catalog/pipeline', '/catalog'],
  )
}

export async function normalizeAndFinalizeCategoriesAction(): Promise<ActionResult> {
  return safeAction(
    'Фіналізація категорій',
    () => normalizeAndFinalizeCategories(),
    ['/admin/catalog/pipeline', '/catalog', '/catalog/all'],
  )
}

export async function backfillCategorySlugsAction(): Promise<ActionResult> {
  return safeAction(
    'Привʼязка слугів категорій',
    () => backfillCategorySlugs(),
    ['/admin/catalog/pipeline', '/catalog', '/catalog/all'],
  )
}

// ─── D. Manual catalog ──────────────────────────────────────────────────────
// The manual-catalog seed is intentionally NOT a Server Action. It runs via a
// client fetch to POST /api/admin/catalog/seed-manual (see PipelineClient) so its
// plain-JSON result never crosses the RSC action boundary — which is what
// produced the generic "Server Components render" 500 on this route.

// ─── E. SEO ─────────────────────────────────────────────────────────────────

export async function runProductSeoAction(): Promise<ActionResult> {
  return safeAction('SEO товарів', () => runProductSeo())
}

// ─── Setup-page actions (used by /admin/catalog/setup) ───────────────────────

export async function syncApiCategoriesAction(): Promise<ActionResult> {
  return safeAction(
    'Синхронізація категорій API',
    () => syncSupplierCategories(),
    ['/admin/catalog/pipeline', '/admin/catalog/setup'],
  )
}

export async function syncCatalogCategoriesAction(): Promise<ActionResult> {
  return safeAction(
    'Створення категорій каталогу',
    async () => {
      const client = getAdminClient()
      const result = await syncCatalogCategories()

      // Supplementary pass: fix any remaining numeric-named categories from the
      // real supplier category names.
      const { data: numericCats } = await client
        .from('catalog_categories')
        .select('id, supplier_category_id, name_ua')
      const toFix = (numericCats ?? []).filter((c) => /^\d+$/.test(String(c.name_ua ?? '')))
      if (toFix.length > 0) {
        const supplierIds = toFix.map((c) => c.supplier_category_id).filter(Boolean) as string[]
        if (supplierIds.length > 0) {
          const { data: scRows } = await client
            .from('supplier_categories')
            .select('supplier_id, name, name_ua')
            .in('supplier_id', supplierIds)
          const nameMap = new Map(
            (scRows ?? []).map((sc) => [sc.supplier_id as string, ((sc.name_ua || sc.name) as string).trim()]),
          )
          for (const cat of toFix) {
            if (!cat.supplier_category_id) continue
            const realName = nameMap.get(cat.supplier_category_id as string)
            if (realName && realName !== cat.name_ua) {
              await client.from('catalog_categories').update({ name_ua: realName }).eq('id', cat.id)
            }
          }
        }
      }
      return result
    },
    ['/admin/catalog/pipeline', '/admin/catalog/setup', '/admin/catalog/categories'],
  )
}

export async function applyCategorySeoAction(): Promise<ActionResult> {
  return safeAction(
    'SEO категорій',
    () => applyCategorySeoFromEnv(),
    ['/admin/catalog/pipeline', '/admin/catalog/setup', '/catalog'],
  )
}

export async function publishCategoriesAction(): Promise<ActionResult> {
  return safeAction(
    'Публікація категорій',
    () => publishAllCatalogCategories(),
    ['/admin/catalog/pipeline', '/admin/catalog/setup', '/catalog'],
  )
}

// ─── Read-only queries (serialization-safe; never throw) ─────────────────────
// These are queries, not mutations, so they keep their domain shapes — but each
// is JSON-cloned and wrapped so a DB/serialization fault returns a safe fallback
// instead of bubbling to the page-level error boundary.

export async function inspectSupplierFeedsAction(): Promise<FeedDiagResult | { error: string }> {
  try {
    return JSON.parse(JSON.stringify(await inspectSupplierFeeds())) as FeedDiagResult
  } catch (e) {
    return { error: humanizeError('Діагностика постачальника', e) }
  }
}

export async function getCatalogDiagnosticsAction(): Promise<CatalogDiagnostics> {
  try {
    return JSON.parse(JSON.stringify(await getCatalogDiagnostics())) as CatalogDiagnostics
  } catch (e) {
    return {
      ok: false,
      source: 'probe',
      migrations: [],
      missingByTable: {},
      missingTables: [],
      tables: {},
      capabilities: {
        canSeedManual: false,
        canFinalizeCategories: false,
        canBackfillSlugs: false,
        canGenerateSeo: false,
        hasPriceTraceColumns: false,
        hasOrderSupplierColumns: false,
      },
      notes: [humanizeError('Діагностика бази даних', e)],
    }
  }
}

export async function getAutomationStatusAction(): Promise<AutomationStatus> {
  try {
    return JSON.parse(JSON.stringify(await getAutomationStatus())) as AutomationStatus
  } catch {
    return { enabled: false, publishedCount: 0, queueCount: 0, maxProductsReached: false, lastRuns: [] }
  }
}

// ─── SEO generation (new system: Supabase → n8n webhook) ─────────────────────

export async function getSeoCountsAction(): Promise<SeoCounts> {
  try {
    return JSON.parse(JSON.stringify(await getSeoCounts())) as SeoCounts
  } catch {
    return { webhookConfigured: false, categoriesMissing: 0, productsMissing: 0, legacyFallback: 0, aiGenerated: 0, templateGenerated: 0, manualLocked: 0 }
  }
}

// In-app deterministic SEO baseline (no n8n/AI). Dry-run previews counts +
// samples; apply writes meta_title/meta_description for published products that
// still lack them. Template rows stay eligible for n8n AI upgrade.
export async function previewProductSeoTemplateAction(): Promise<ActionResult> {
  return safeAction('Базове SEO (перевірка)', () => generateProductSeoTemplate({ apply: false, limit: 500 }), [])
}

export async function generateProductSeoTemplateAction(): Promise<ActionResult> {
  return safeAction('Базове SEO товарів', () => generateProductSeoTemplate({ apply: true, limit: 500 }), ['/admin/catalog/pipeline', '/catalog'])
}

export async function generateCategorySeoBatchAction(): Promise<ActionResult> {
  return safeAction('Генерація SEO категорій', () => sendCategorySeoBatch(SEO_BATCH_DEFAULT), ['/admin/catalog/pipeline'])
}

export async function generateProductSeoBatchAction(): Promise<ActionResult> {
  return safeAction('Генерація SEO товарів', () => sendProductSeoBatch(SEO_BATCH_DEFAULT), ['/admin/catalog/pipeline'])
}

export async function backfillSeoDescriptionFallbackAction(): Promise<ActionResult> {
  return safeAction('SEO fallback з meta_description', () => backfillSeoDescriptionFallback(), ['/admin/catalog/pipeline', '/catalog'])
}

// ─── Google Sheets SEO import (safe, dry-run-first) ──────────────────────────
// Merge human-authored SEO from the two Google Sheets WITHOUT overwriting good
// content. Dry-run previews counts + samples; apply writes only empty fields
// (force can override). Never touches locks; every value is validated first.

export async function previewProductSeoSheetAction(): Promise<ActionResult> {
  return safeAction('Імпорт SEO товарів з Sheets (перевірка)', () => importProductSeoFromSheet({ apply: false }), [])
}

export async function importProductSeoSheetAction(force = false): Promise<ActionResult> {
  return safeAction('Імпорт SEO товарів з Sheets', () => importProductSeoFromSheet({ apply: true, force }), ['/admin/catalog/pipeline', '/catalog'])
}

export async function previewCategorySeoSheetAction(): Promise<ActionResult> {
  return safeAction('Імпорт SEO категорій з Sheets (перевірка)', () => importCategorySeoFromSheet({ apply: false }), [])
}

export async function importCategorySeoSheetAction(force = false): Promise<ActionResult> {
  return safeAction('Імпорт SEO категорій з Sheets', () => importCategorySeoFromSheet({ apply: true, force }), ['/admin/catalog/pipeline', '/catalog'])
}
