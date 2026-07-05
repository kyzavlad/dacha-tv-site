export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../../cron/_auth'
import { getRuCategoryAiCandidates, RU_CATEGORY_TARGETS } from '@/lib/catalog/seo-ai-ru'

// ─── RU category AI candidates (READ-ONLY) ────────────────────────────────────
// Published categories that still need Russian SEO in the translation table.
// Grounded with products_count + sample_products and ranked by products_count
// DESC. Ukrainian source SEO is included as reference. Independent of the
// Ukrainian seo_status; RU-locked rows excluded. Writes nothing.
//
//   GET /api/admin/seo/ru/category-ai-candidates?limit=100   (1–1000, default 100)
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<site>/api/admin/seo/ru/category-ai-candidates?limit=5"
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 100) || 100
  try {
    const r = await getRuCategoryAiCandidates(limit)
    return Response.json({ ok: r.ok, locale: 'ru', count: r.count, limit: r.limit, message: r.message, targets: RU_CATEGORY_TARGETS, candidates: r.candidates }, { status: r.ok ? 200 : 500 })
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
