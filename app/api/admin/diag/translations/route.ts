export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { localizedProductCoverage, localizedCategoryCoverage } from '@/lib/catalog/seo-ai-ru'

// ─── Read-only translation-coverage diagnostic (CRON_SECRET) ──────────────────
// Reports where RU/EN localized content is MISSING, without exposing any secret.
// Uses HEAD counts only (safe on the ~105k catalog). "missing" = published total
// minus rows that already carry a complete translation for that locale.
//
//   product/category: catalog_product_translations / catalog_category_translations
//   manual:           manual_content_translations rows per locale + entity_type
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const client = getAdminClient()
  const head = (build: () => PromiseLike<{ count: number | null; error: unknown }>) =>
    build().then((r) => r.count ?? 0, () => 0)

  const [productRu, productEn, categoryRu, categoryEn] = await Promise.all([
    localizedProductCoverage('ru').catch(() => null),
    localizedProductCoverage('en').catch(() => null),
    localizedCategoryCoverage('ru').catch(() => null),
    localizedCategoryCoverage('en').catch(() => null),
  ])

  // Manual content: count translation rows per locale + entity_type.
  const ENTITY_TYPES = ['honey_product', 'apiary_product', 'beekeeper_product', 'flower_product', 'service', 'static']
  const manual: Record<string, { ru: number; en: number }> = {}
  for (const et of ENTITY_TYPES) {
    const [ru, en] = await Promise.all([
      head(() => client.from('manual_content_translations').select('id', { count: 'exact', head: true }).eq('entity_type', et).eq('locale', 'ru')),
      head(() => client.from('manual_content_translations').select('id', { count: 'exact', head: true }).eq('entity_type', et).eq('locale', 'en')),
    ])
    manual[et] = { ru, en }
  }

  const summarize = (c: Awaited<ReturnType<typeof localizedProductCoverage>> | null) =>
    c ? { total: c.total, complete: c.complete, missing: Math.max(0, c.total - c.complete) } : null

  return Response.json({
    ok: true,
    product: { ru: summarize(productRu), en: summarize(productEn) },
    category: { ru: summarize(categoryRu), en: summarize(categoryEn) },
    manual_translation_rows: manual,
    note: 'missing = published total − rows with a complete translation for that locale. EN falls back to RU then UK at render time, so "missing" here means no dedicated EN row, not a blank page.',
  })
}
