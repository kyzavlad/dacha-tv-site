export const AUTOMATION_MAX_PUBLISHED = 3000
export const AUTOMATION_BATCH_SIZE = 300

// Normal per-call batch size for the EXISTING-row set-based refresh RPC
// (refresh_existing_catalog_from_supplier). The refresh is one bounded
// set-based UPDATE with no full-table scans (v7 migration), so a larger batch
// is safe and dramatically cuts the number of round-trips needed to drain the
// ~112k-row daily queue (≈23 calls at 5000 vs ≈375 at 300) — the daily job
// now completes the full refresh without hundreds of requests, each of which
// also no longer runs three exact whole-queue COUNT scans. Clamped to
// [1, 10000] both here and inside the SQL function.
export const EXISTING_REFRESH_BATCH_SIZE = 5000

// Genuinely-new supplier products (no existing catalog_products row) still go
// through the JS insert path. That path was never the timeout risk — the
// per-SKU refresh loop for EXISTING rows was (see
// lib/catalog/existing-product-refresh.ts) — but it stays deliberately small
// and bounded even when the caller requests a large `limit` for the
// existing-row refresh, so a single request never queues an unbounded number
// of chunked upserts.
export const NEW_PRODUCT_INSERT_BATCH_CAP = 500

// Categories the first ad campaigns point at. SEO effort (AI long descriptions)
// is prioritised here — we do NOT wait for 100% AI SEO on all ~105k products
// before launching. Template meta covers the rest quickly.
export const PRIORITY_AD_CATEGORIES = [
  'na-skuter-1782704758752',
  'na-moped-1782704757771',
  'na-benzopyl-1782704756437',
  'na-motokos-1782704757995',
  'unyversaln-e-dlya-moto-1782704773670',
] as const

export interface CronStep {
  label: string
  description: string
  schedule: string
  cronHour: number
  cronMinute: number
}

// Daily execution order (UTC):
// 01:00 categories → 02:00 category_seo → 03:00 products → 04:00 import_batch → 05:00 publish_batch → 06:00 product_seo
export const CRON_STEPS: Record<string, CronStep> = {
  categories: {
    label: 'Синхр. категорій',
    description: 'API → supplier_categories → catalog_categories → публікація',
    schedule: 'Щодня 01:00 UTC',
    cronHour: 1, cronMinute: 0,
  },
  category_seo: {
    label: 'SEO категорій',
    description: 'Google Sheets (CATEGORY_SEO_CSV_URL) → catalog_categories',
    schedule: 'Щодня 02:00 UTC',
    cronHour: 2, cronMinute: 0,
  },
  products: {
    label: 'Синхронізація API',
    description: 'Завантажує товари, ціни та залишки з personal.cab',
    schedule: 'Щодня 03:00 UTC',
    cronHour: 3, cronMinute: 0,
  },
  import_batch: {
    label: 'Імпорт у каталог',
    description: 'Переносить нові та оновлені товари в catalog_products',
    schedule: 'Щодня 04:00 UTC',
    cronHour: 4, cronMinute: 0,
  },
  publish_batch: {
    label: 'Публікація товарів',
    description: 'Публікує всі товари зі статусом draft',
    schedule: 'Щодня 05:00 UTC',
    cronHour: 5, cronMinute: 0,
  },
  product_seo: {
    label: 'SEO товарів',
    description: 'Google Sheets (PRODUCT_SEO_CSV_URL) → catalog_products',
    schedule: 'Щодня 06:00 UTC',
    cronHour: 6, cronMinute: 0,
  },
}

export const CRON_SCHEDULE_LABELS = CRON_STEPS
