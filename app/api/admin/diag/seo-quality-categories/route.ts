export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'

// ─── READ-ONLY category SEO quality / queue diagnostic ────────────────────────
// Reports catalog CATEGORY SEO coverage and the AI backlog WITHOUT mutating
// anything. Counts are HEAD `count:'exact'` queries (cheap, no rows returned).
//
//   GET /api/admin/diag/seo-quality-categories
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/diag/seo-quality-categories
//
// Protected by CRON_SECRET.

async function count(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try { const { count } = await build(); return count ?? 0 } catch { return 0 }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const client = getAdminClient()
  const C = () => client.from('catalog_categories').select('id', { count: 'exact', head: true }).eq('is_published', true)

  const [
    total,
    withMetaTitle,
    withMetaDescription,
    withLongDescription,
    withFaq,
    missingAnyMeta,
    missingLongDescription,
    manualLocked,
    seoSheet,
    seoManual,
    seoAi,
    seoTemplate,
    seoMissing,
  ] = await Promise.all([
    count(() => C()),
    count(() => C().not('meta_title', 'is', null).neq('meta_title', '')),
    count(() => C().not('meta_description', 'is', null).neq('meta_description', '')),
    count(() => C().not('description_ua', 'is', null).neq('description_ua', '')),
    count(() => C().not('faq_json', 'is', null)),
    count(() => C().or('meta_title.is.null,meta_description.is.null')),
    count(() => C().is('description_ua', null)),
    count(() => C().eq('seo_manual_lock', true)),
    count(() => C().eq('seo_status', 'sheet')),
    count(() => C().eq('seo_status', 'manual')),
    count(() => C().eq('seo_status', 'ai')),
    count(() => C().eq('seo_status', 'template')),
    count(() => C().eq('seo_status', 'missing')),
  ])

  // AI-eligible backlog: published, not human-authored/locked, still missing a
  // long description, a meta field, or FAQ. Pool for category-ai-candidates.
  const aiBacklog = await count(() =>
    C()
      .neq('seo_manual_lock', true)
      .neq('seo_status', 'sheet')
      .neq('seo_status', 'manual')
      .or('description_ua.is.null,meta_title.is.null,meta_description.is.null,faq_json.is.null')
      .not('name_ua', 'is', null),
  )

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)

  return Response.json({
    ok: true,
    generated_at: new Date().toISOString(),
    scope: 'categories',
    totals: {
      published_categories: total,
      with_meta_title: withMetaTitle,
      with_meta_description: withMetaDescription,
      with_long_description: withLongDescription,
      with_faq: withFaq,
      missing_any_meta: missingAnyMeta,
      missing_long_description: missingLongDescription,
    },
    coverage_pct: {
      meta_title: pct(withMetaTitle),
      meta_description: pct(withMetaDescription),
      long_description: pct(withLongDescription),
      faq: pct(withFaq),
    },
    seo_status_breakdown: {
      missing: seoMissing,
      template: seoTemplate,
      sheet: seoSheet,
      ai: seoAi,
      manual: seoManual,
      manual_locked: manualLocked,
    },
    ai_backlog: {
      eligible_categories: aiBacklog,
      note: 'Published, non-locked, non-sheet/manual categories still needing a long description, a meta field, or FAQ. Source pool for /api/admin/seo/category-ai-candidates.',
    },
  })
}
