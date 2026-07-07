export const AUTOMATION_MAX_PUBLISHED = 3000
export const AUTOMATION_BATCH_SIZE = 300

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
