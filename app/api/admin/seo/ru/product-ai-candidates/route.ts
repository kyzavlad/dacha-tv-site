export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../../cron/_auth'
import { getRuProductAiCandidates, RU_PRODUCT_TARGETS } from '@/lib/catalog/seo-ai-ru'

// ─── RU product AI candidates (READ-ONLY) ─────────────────────────────────────
// Published, public-listable products that still need Russian SEO in the
// translation table (missing/blank RU meta_title/meta_description/description).
// Ukrainian source SEO is included as translation reference. Independent of the
// Ukrainian seo_status; RU-locked rows are excluded. Writes nothing.
//
//   GET /api/admin/seo/ru/product-ai-candidates?limit=100   (1–1000, default 100)
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<site>/api/admin/seo/ru/product-ai-candidates?limit=5"
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 100) || 100
  try {
    const r = await getRuProductAiCandidates(limit)
    return Response.json({ ok: r.ok, locale: 'ru', count: r.count, limit: r.limit, message: r.message, targets: RU_PRODUCT_TARGETS, candidates: r.candidates }, { status: r.ok ? 200 : 500 })
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
