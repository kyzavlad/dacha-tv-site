export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { localizedProductCoverage } from '@/lib/catalog/seo-ai-ru'

const SUPPORTED = new Set(['ru', 'en'])

// ─── READ-ONLY localized product SEO coverage ─────────────────────────────────
// Reports Russian product SEO coverage from catalog_product_translations WITHOUT
// mutating anything. Only locale=ru is implemented.
//
//   GET /api/admin/diag/seo-quality-products-localized?locale=ru
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<site>/api/admin/diag/seo-quality-products-localized?locale=ru"
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const locale = (new URL(req.url).searchParams.get('locale') ?? 'ru').toLowerCase()
  if (!SUPPORTED.has(locale)) return Response.json({ ok: false, message: `Локаль '${locale}' не підтримується (лише 'ru'/'en').` }, { status: 400 })

  try {
    const c = await localizedProductCoverage(locale)
    const pct = (n: number) => (c.total > 0 ? Math.round((n / c.total) * 1000) / 10 : 0)
    return Response.json({
      ok: true,
      locale,
      generated_at: new Date().toISOString(),
      totals: {
        published_products: c.total,
        ru_translation_rows: c.ruRows,
        ru_with_meta_title: c.ruMetaTitle,
        ru_with_meta_description: c.ruMetaDesc,
        ru_with_description: c.ruDesc,
        ru_complete: c.complete,
      },
      coverage_pct: { meta_title: pct(c.ruMetaTitle), meta_description: pct(c.ruMetaDesc), description: pct(c.ruDesc), complete: pct(c.complete) },
      ru_status: { ai: c.ruAi, manual_locked: c.ruLocked },
      ai_backlog: {
        eligible_products: c.backlog,
        note: 'Approx: published products minus products with a complete RU translation (meta_title + meta_description + description). Source pool for /api/admin/seo/ru/product-ai-candidates.',
      },
    })
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
