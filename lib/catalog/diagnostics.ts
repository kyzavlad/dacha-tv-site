import { getAdminClient } from '@/lib/supabase/admin'

// ─── Catalog pipeline diagnostics ─────────────────────────────────────────────
// Reports which migrations/columns are *effectively* applied in the live DB and
// which pipeline capabilities are therefore safe to run. Prefers the in-DB
// pipeline_diagnostics() function (migration 052); if that function does not yet
// exist it falls back to probing each column directly, so diagnostics stay useful
// even before 052 is applied. No table is ever loaded into memory.

export interface MigrationCheck {
  id: string
  label: string
  applied: boolean
  missing: string[] // human-readable list of missing columns/functions
}

export interface CatalogDiagnostics {
  ok: boolean
  source: 'rpc' | 'probe'
  migrations: MigrationCheck[]
  missingByTable: Record<string, string[]>
  missingTables: string[]          // required catalog tables that do not exist
  tables: Record<string, boolean>  // existence of every checked table
  capabilities: {
    canSeedManual: boolean
    canFinalizeCategories: boolean
    canBackfillSlugs: boolean
    canGenerateSeo: boolean
    hasPriceTraceColumns: boolean
    hasOrderSupplierColumns: boolean
  }
  notes: string[]
}

type Probe = { table: string; column: string }

// Tables the catalog/SEO pipeline truly needs. orders/order_items are optional
// e-commerce tables — their absence is reported but does NOT block the pipeline
// (this is why migration 054 uses ALTER TABLE IF EXISTS for orders).
const REQUIRED_TABLES = [
  'catalog_products', 'catalog_categories', 'supplier_products', 'supplier_categories', 'honey_products',
] as const
const ALL_TABLES = [
  'orders', 'order_items', 'catalog_products', 'catalog_categories',
  'supplier_products', 'supplier_categories', 'inquiries', 'honey_products',
] as const

// Columns each migration is responsible for. Keys are "table.column".
const MIGRATION_COLUMNS: Record<string, { label: string; cols: string[] }> = {
  '047': {
    label: '047 — поля замовлень постачальника',
    cols: [
      'orders.supplier_order_id',
      'orders.supplier_order_mode',
      'orders.supplier_order_status',
      'orders.supplier_order_response',
      'orders.method_payment',
      'orders.nova_poshta_warehouse_id',
      'orders.receiver_first_name',
    ],
  },
  '048_049': {
    label: '048/049 — трасування цін + прапор підозрілої ціни',
    cols: [
      'supplier_products.price_win_field',
      'supplier_products.supplier_price_currency',
      'catalog_products.is_price_suspicious',
      'catalog_categories.meta_auto_generated',
    ],
  },
  '051': {
    label: '051 — ручний каталог',
    cols: [
      'catalog_products.source',
      'catalog_products.price_prefix',
      'catalog_products.unit_label',
      'catalog_products.inquiry_only',
      'catalog_products.lead_type',
      'catalog_products.options',
      'catalog_categories.source',
      'catalog_categories.lead_type',
    ],
  },
  '054': {
    label: '054 — SEO-поля + порядок категорій',
    cols: [
      'catalog_categories.sort_order',
      'catalog_categories.seo_status',
      'catalog_categories.faq_json',
      'catalog_categories.seo_manual_lock',
      'catalog_products.seo_status',
      'catalog_products.description_ua',
      'catalog_products.seo_manual_lock',
    ],
  },
}

function allColumns(): Probe[] {
  const seen = new Set<string>()
  const out: Probe[] = []
  for (const { cols } of Object.values(MIGRATION_COLUMNS)) {
    for (const key of cols) {
      if (seen.has(key)) continue
      seen.add(key)
      const [table, column] = key.split('.')
      out.push({ table, column })
    }
  }
  return out
}

// Probe a single column: select it HEAD-only with no rows. PostgREST returns
// error code 42703 ("undefined column") when the column does not exist.
async function columnExists(
  client: ReturnType<typeof getAdminClient>,
  table: string,
  column: string,
): Promise<boolean> {
  const { error } = await client.from(table).select(column, { head: true }).limit(1)
  if (!error) return true
  // Only the "undefined column" code proves absence. Any other error (table
  // missing, RLS, etc.) is reported as present=false-safe via 42P01 handling
  // below; we treat non-42703 as "present" to avoid false negatives.
  return (error as { code?: string }).code !== '42703'
}

function buildResult(
  present: (key: string) => boolean,
  hasBackfillFn: boolean,
  tableExists: (table: string) => boolean,
  source: CatalogDiagnostics['source'],
  notes: string[],
): CatalogDiagnostics {
  const tables: Record<string, boolean> = {}
  for (const t of ALL_TABLES) tables[t] = tableExists(t)
  const missingTables = REQUIRED_TABLES.filter((t) => !tableExists(t))

  // A column only counts as "missing" when its table EXISTS but the column does
  // not. Columns on an absent table are reported via missingTables instead, so a
  // catalog-only instance without `orders` is not flagged as broken.
  const colMissing = (key: string) => {
    const [table] = key.split('.')
    return tableExists(table) && !present(key)
  }

  const migrations: MigrationCheck[] = Object.entries(MIGRATION_COLUMNS).map(([id, def]) => {
    const missing = def.cols.filter(colMissing)
    return { id, label: def.label, applied: missing.length === 0, missing }
  })

  // 052 is represented by the SQL functions, not columns.
  migrations.push({
    id: '052',
    label: '052 — set-based backfill + діагностика',
    applied: hasBackfillFn,
    missing: hasBackfillFn ? [] : ['function backfill_category_slugs()'],
  })

  const missingByTable: Record<string, string[]> = {}
  for (const def of Object.values(MIGRATION_COLUMNS)) {
    for (const key of def.cols) {
      if (!colMissing(key)) continue
      const [table, column] = key.split('.')
      ;(missingByTable[table] ??= []).push(column)
    }
  }

  const has = (k: string) => present(k)
  const capabilities = {
    canSeedManual:
      has('catalog_products.source') && has('catalog_products.options') &&
      has('catalog_products.inquiry_only') && has('catalog_products.lead_type') &&
      has('catalog_products.price_prefix') && has('catalog_products.unit_label') &&
      has('catalog_categories.source') && has('catalog_categories.lead_type') &&
      has('catalog_categories.meta_auto_generated'),
    canFinalizeCategories: has('catalog_categories.source') && has('catalog_products.source'),
    canBackfillSlugs: hasBackfillFn,
    canGenerateSeo: has('catalog_products.seo_status') && has('catalog_categories.seo_status'),
    hasPriceTraceColumns:
      has('supplier_products.price_win_field') && has('supplier_products.supplier_price_currency'),
    hasOrderSupplierColumns:
      has('orders.supplier_order_id') && has('orders.supplier_order_mode'),
  }

  if (missingTables.length > 0) {
    notes.push(`Відсутні обовʼязкові таблиці: ${missingTables.join(', ')} — застосуйте базові міграції (001/037/039) перед запуском каталогу.`)
  }
  if (!tableExists('orders')) {
    notes.push('Таблиця orders відсутня (необовʼязкова для каталогу). Поля 047 буде додано автоматично, коли orders зʼявиться — це не блокує пайплайн.')
  }

  const ok =
    missingTables.length === 0 &&
    migrations.every((m) => m.applied) &&
    Object.keys(missingByTable).length === 0

  return { ok, source, migrations, missingByTable, missingTables, tables, capabilities, notes }
}

export async function getCatalogDiagnostics(): Promise<CatalogDiagnostics> {
  const client = getAdminClient()

  // Preferred path: in-DB diagnostics function (migration 052+).
  const { data, error } = await client.rpc('pipeline_diagnostics')
  if (!error && data && typeof data === 'object') {
    const d = data as {
      columns?: Record<string, boolean>
      functions?: Record<string, boolean>
      tables?: Record<string, boolean>
      data?: Record<string, number>
    }
    const columns = d.columns ?? {}
    const tbls = d.tables ?? {}
    const hasBackfillFn = !!d.functions?.backfill_category_slugs
    const notes: string[] = []
    const missingWin = Number(d.data?.supplier_products_missing_win_field ?? 0)
    if (missingWin > 0) {
      notes.push(
        `050 (price backfill): ${missingWin.toLocaleString('uk-UA')} supplier_products без price_win_field — застосуйте 050_finish_price_backfill.sql.`,
      )
    }
    // Older diagnostics functions (≤53) did not return `tables`; fall back to
    // "table exists if any of its checked columns resolved true".
    const tableExists = (t: string) =>
      t in tbls ? tbls[t] === true : Object.keys(columns).some((k) => k.startsWith(`${t}.`) && columns[k])
    return buildResult((k) => columns[k] === true, hasBackfillFn, tableExists, 'rpc', notes)
  }

  // Fallback: probe tables + columns directly (works before 052 is applied).
  const tableResults = await Promise.all(
    ALL_TABLES.map(async (t) => [t, await tableExistsProbe(client, t)] as [string, boolean]),
  )
  const tableMap = new Map<string, boolean>(tableResults)
  const probes = allColumns().filter((p) => tableMap.get(p.table)) // skip columns of absent tables
  const results = await Promise.all(
    probes.map(async (p) => [`${p.table}.${p.column}`, await columnExists(client, p.table, p.column)] as [string, boolean]),
  )
  const presentMap = new Map<string, boolean>(results)
  const notes = [
    'Функція pipeline_diagnostics() недоступна — застосуйте міграцію 054_catalog_final_stabilization.sql. Поки що показано результат прямої перевірки таблиць/колонок.',
  ]
  // Without 052+ the backfill function is also absent.
  return buildResult(
    (k) => presentMap.get(k) === true,
    false,
    (t) => tableMap.get(t) === true,
    'probe',
    notes,
  )
}

// Probe whether a table exists: a HEAD select returns 42P01 when it doesn't.
async function tableExistsProbe(client: ReturnType<typeof getAdminClient>, table: string): Promise<boolean> {
  const { error } = await client.from(table).select('*', { head: true, count: 'exact' }).limit(1)
  if (!error) return true
  return (error as { code?: string }).code !== '42P01'
}
