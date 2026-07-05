export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getCategorySeoAiCandidates, SEO_CATEGORY_TARGETS } from '@/lib/catalog/seo-ai-category'

// ─── AI-ready CATEGORY candidate batch (READ-ONLY) ────────────────────────────
// Returns published categories that need SEO improvement, excluding human-
// authored SEO (sheet/manual/locked) and unusable/garbage names. The app does
// NOT call any AI here — n8n pulls this list, generates copy, then POSTs to
// /api/admin/seo/apply-category-ai-batch. Writes nothing.
//
//   GET /api/admin/seo/category-ai-candidates?limit=100   (1–1000, default 100)
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<site>/api/admin/seo/category-ai-candidates?limit=5"
//
// Protected by CRON_SECRET.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const limit = Number(url.searchParams.get('limit') ?? 100) || 100

  try {
    const result = await getCategorySeoAiCandidates(limit)
    return Response.json({
      ok: result.ok,
      count: result.count,
      limit: result.limit,
      message: result.message,
      targets: SEO_CATEGORY_TARGETS,
      candidates: result.candidates,
    }, { status: result.ok ? 200 : 500 })
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
