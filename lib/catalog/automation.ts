import { getAdminClient } from '@/lib/supabase/admin'
import { syncProductsToCatalog, publishAllCatalogProducts } from './pipeline'
import { applyProductSeoFromEnv, applyCategorySeoFromEnv } from './seo'
import { AUTOMATION_MAX_PUBLISHED, AUTOMATION_BATCH_SIZE, CRON_STEPS } from './automation-config'

export interface AutomationLastRun {
  sync_type: string
  label: string
  description: string
  schedule: string
  cronHour: number
  cronMinute: number
  status: string | null
  completed_at: string | null
  count: number | null
  triggered_by: string | null
  errorMessage: string | null
  nextRunAt: string    // ISO string, calculated from cronHour/cronMinute
}

export interface AutomationStatus {
  enabled: boolean
  publishedCount: number
  queueCount: number
  maxProductsReached: boolean
  lastRuns: AutomationLastRun[]
}

function calcNextRunAt(hour: number, minute: number): string {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0))
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString()
}

export async function getAutomationStatus(): Promise<AutomationStatus> {
  const client = getAdminClient()

  const [publishedRes, queueRes, logsRes] = await Promise.all([
    client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    client.from('supplier_products').select('id', { count: 'exact', head: true }).not('name', 'is', null).gt('price_uah', 0).eq('is_approved', false),
    client
      .from('supplier_sync_log')
      .select('sync_type, status, completed_at, products_total, products_new, categories_total, triggered_by, error_details')
      .order('started_at', { ascending: false })
      .limit(80),
  ])

  const publishedCount = publishedRes.count ?? 0
  const queueCount = queueRes.count ?? 0

  // Latest non-running run per sync_type
  const seen = new Set<string>()
  const lastRunMap = new Map<string, AutomationLastRun>()

  for (const log of (logsRes.data ?? [])) {
    const t = log.sync_type as string
    if (seen.has(t) || log.status === 'running') continue
    seen.add(t)
    const step = CRON_STEPS[t]
    if (!step) continue
    const errDetails = log.error_details as Record<string, unknown> | null
    const errMessage = log.status === 'failed' && errDetails?.message
      ? String(errDetails.message).slice(0, 200)
      : null
    lastRunMap.set(t, {
      sync_type: t,
      label: step.label,
      description: step.description,
      schedule: step.schedule,
      cronHour: step.cronHour,
      cronMinute: step.cronMinute,
      status: log.status,
      completed_at: log.completed_at,
      count: (log.products_total ?? log.products_new ?? log.categories_total ?? null) as number | null,
      triggered_by: log.triggered_by,
      errorMessage: errMessage,
      nextRunAt: calcNextRunAt(step.cronHour, step.cronMinute),
    })
  }

  // Ensure all cron steps appear even if never run
  for (const [t, step] of Object.entries(CRON_STEPS)) {
    if (!lastRunMap.has(t)) {
      lastRunMap.set(t, {
        sync_type: t,
        label: step.label,
        description: step.description,
        schedule: step.schedule,
        cronHour: step.cronHour,
        cronMinute: step.cronMinute,
        status: null,
        completed_at: null,
        count: null,
        triggered_by: null,
        errorMessage: null,
        nextRunAt: calcNextRunAt(step.cronHour, step.cronMinute),
      })
    }
  }

  // Return in cron execution order
  const order = ['categories', 'category_seo', 'products', 'import_batch', 'publish_batch', 'product_seo']
  const lastRuns = order.flatMap((t) => lastRunMap.has(t) ? [lastRunMap.get(t)!] : [])

  return {
    enabled: !!process.env.CRON_SECRET,
    publishedCount,
    queueCount,
    maxProductsReached: publishedCount >= AUTOMATION_MAX_PUBLISHED,
    lastRuns,
  }
}

export interface ImportBatchResult {
  ok: boolean
  imported: number
  published: number
  skipped: boolean
  errors?: number
  errorGroups?: Record<string, number>
  message: string
}

// Import without publishing — allows SEO to run before products go live.
// opts.skipCap=true bypasses the AUTOMATION_MAX_PUBLISHED guard (use for manual bulk imports).
export async function importBatch(
  limit = AUTOMATION_BATCH_SIZE,
  opts: { skipCap?: boolean } = {},
): Promise<ImportBatchResult> {
  const client = getAdminClient()
  const startedAt = Date.now()

  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'import_batch', status: 'running', triggered_by: 'cron' })
    .select('id').single()

  try {
    const { count: publishedCount } = await client
      .from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published')

    if (!opts.skipCap && (publishedCount ?? 0) >= AUTOMATION_MAX_PUBLISHED) {
      await client.from('supplier_sync_log').update({
        status: 'completed',
        products_total: 0,
        error_details: { skipped: true, reason: 'max_published_reached', duration_ms: Date.now() - startedAt },
        completed_at: new Date().toISOString(),
      }).eq('id', log?.id)
      return { ok: true, imported: 0, published: 0, skipped: true, message: `Ліміт ${AUTOMATION_MAX_PUBLISHED} опублікованих — авто-імпорт призупинено` }
    }

    const result = await syncProductsToCatalog(limit)
    await client.from('supplier_sync_log').update({
      status: result.ok ? 'completed' : 'failed',
      products_total: result.inserted,
      products_new: result.inserted,
      error_details: { imported: result.inserted, updated: result.updated, errors: result.errors, errorGroups: result.errorGroups, message: result.message, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return {
      ok: result.ok, imported: result.inserted, published: 0, skipped: false,
      errors: result.errors || undefined,
      errorGroups: result.errors ? result.errorGroups : undefined,
      message: result.message,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return { ok: false, imported: 0, published: 0, skipped: false, message: msg }
  }
}

// Publish all draft products with logging.
export async function publishBatch(): Promise<ImportBatchResult> {
  const client = getAdminClient()
  const startedAt = Date.now()

  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'publish_batch', status: 'running', triggered_by: 'cron' })
    .select('id').single()

  try {
    const result = await publishAllCatalogProducts()
    await client.from('supplier_sync_log').update({
      status: 'completed',
      products_total: result.updated,
      error_details: { published: result.updated, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return { ok: true, imported: 0, published: result.updated, skipped: false, message: `Опубліковано ${result.updated} товарів` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return { ok: false, imported: 0, published: 0, skipped: false, message: msg }
  }
}

// Legacy — kept for backwards compatibility; new cron routes use importBatch + publishBatch separately.
export async function importAndPublishBatch(limit = AUTOMATION_BATCH_SIZE): Promise<ImportBatchResult> {
  const importResult = await importBatch(limit)
  if (!importResult.ok || importResult.imported === 0) return importResult
  const publishResult = await publishBatch()
  return {
    ok: true,
    imported: importResult.imported,
    published: publishResult.published,
    skipped: false,
    message: `Імпортовано ${importResult.imported}, опубліковано ${publishResult.published}`,
  }
}

// ─── Category SEO batch (reads CATEGORY_SEO_CSV_URL from env) ─────────────────

export interface SeoRunResult {
  ok: boolean
  updated: number
  skipped: number
  notFound: number
  message: string
  csvUrl?: string
  unmatchedSample?: string[]
  matchSources?: Record<string, number>
  sheetWarning?: string
  httpStatus?: number
  contentType?: string
  bodyPreview?: string
  finalUrl?: string
}

export async function runCategorySeo(): Promise<SeoRunResult> {
  const client = getAdminClient()
  const startedAt = Date.now()

  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'category_seo', status: 'running', triggered_by: 'manual' })
    .select('id').single()

  try {
    const result = await applyCategorySeoFromEnv()
    await client.from('supplier_sync_log').update({
      status: result.ok ? 'completed' : 'failed',
      categories_total: result.updated,
      error_details: {
        updated: result.updated, skipped: result.skipped, notFound: result.notFound,
        csv_url: result.csvUrl, match_sources: result.matchSources,
        unmatched_sample: result.unmatchedSample, message: result.message,
        duration_ms: Date.now() - startedAt,
      },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return { ok: false, updated: 0, skipped: 0, notFound: 0, message: msg }
  }
}

// ─── Product SEO batch (reads PRODUCT_SEO_CSV_URL from env) ───────────────────

export async function runProductSeo(): Promise<SeoRunResult> {
  const client = getAdminClient()
  const startedAt = Date.now()

  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'product_seo', status: 'running', triggered_by: 'manual' })
    .select('id').single()

  try {
    const result = await applyProductSeoFromEnv()
    await client.from('supplier_sync_log').update({
      status: result.ok ? 'completed' : 'failed',
      products_total: result.updated,
      error_details: {
        updated: result.updated, skipped: result.skipped, notFound: result.notFound,
        csv_url: result.csvUrl, unmatched_sample: result.unmatchedSample,
        message: result.message, duration_ms: Date.now() - startedAt,
      },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return { ok: false, updated: 0, skipped: 0, notFound: 0, message: msg }
  }
}
