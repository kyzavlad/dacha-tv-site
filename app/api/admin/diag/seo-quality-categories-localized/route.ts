export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { ruCategoryCoverage } from '@/lib/catalog/seo-ai-ru'

// ─── READ-ONLY localized category SEO coverage ────────────────────────────────
// Reports Russian category SEO coverage from catalog_category_translations
// WITHOUT mutating anything. Only locale=ru is implemented.
//
//   GET /api/admin/diag/seo-quality-categories-localized?locale=ru
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<site>/api/admin/diag/seo-quality-categories-localized?locale=ru"
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const locale = (new URL(req.url).searchParams.get('locale') ?? 'ru').toLowerCase()
  if (locale !== 'ru') return Response.json({ ok: false, message: `Локаль '${locale}' не підтримується (лише 'ru').` }, { status: 400 })

  try {
    const c = await ruCategoryCoverage()
    const pct = (n: number) => (c.total > 0 ? Math.round((n / c.total) * 1000) / 10 : 0)
    return Response.json({
      ok: true,
      locale: 'ru',
      generated_at: new Date().toISOString(),
      totals: {
        published_categories: c.total,
        ru_translation_rows: c.ruRows,
        ru_with_meta_title: c.ruMetaTitle,
        ru_with_meta_description: c.ruMetaDesc,
        ru_with_description: c.ruDesc,
        ru_with_h1: c.ruH1,
        ru_with_faq: c.ruFaq,
        ru_complete: c.complete,
      },
      coverage_pct: { meta_title: pct(c.ruMetaTitle), meta_description: pct(c.ruMetaDesc), description: pct(c.ruDesc), faq: pct(c.ruFaq), complete: pct(c.complete) },
      ru_status: { ai: c.ruAi, manual_locked: c.ruLocked },
      ai_backlog: {
        eligible_categories: c.backlog,
        note: 'Approx: published categories minus categories with a complete RU translation (meta_title + meta_description + description). Source pool for /api/admin/seo/ru/category-ai-candidates.',
      },
    })
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
