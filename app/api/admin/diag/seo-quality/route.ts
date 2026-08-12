export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  UA_BACKLOG_COLS, summarizeUaBacklog, classifyUaSeoRow, missingUaFields, type UaSeoRow,
} from '@/lib/catalog/seo-backlog'

// ─── READ-ONLY SEO quality / queue diagnostic ─────────────────────────────────
// Reports catalog SEO coverage and the size of the AI backlog WITHOUT mutating
// anything. Counts are HEAD `count:'exact'` queries (cheap, no rows returned).
//
//   GET /api/admin/diag/seo-quality
//   GET /api/admin/diag/seo-quality?sampleCategories=4000   (bigger category sample)
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/diag/seo-quality
//
// Protected by CRON_SECRET.

async function count(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try { const { count } = await build(); return count ?? 0 } catch { return 0 }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const sampleSize = Math.min(Math.max(Number(url.searchParams.get('sampleCategories') ?? 2000) || 2000, 100), 10000)

  const client = getAdminClient()
  const P = () => client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published')

  const [
    total,
    withMetaTitle,
    withMetaDescription,
    withLongDescription,
    missingAnyMeta,
    missingLongDescription,
    manualLocked,
    seoSheet,
    seoManual,
    seoAi,
    seoTemplate,
    seoMissing,
  ] = await Promise.all([
    count(() => P()),
    count(() => P().not('meta_title', 'is', null).neq('meta_title', '')),
    count(() => P().not('meta_description', 'is', null).neq('meta_description', '')),
    count(() => P().not('description_ua', 'is', null).neq('description_ua', '')),
    count(() => P().or('meta_title.is.null,meta_description.is.null')),
    count(() => P().is('description_ua', null)),
    count(() => P().eq('seo_manual_lock', true)),
    count(() => P().eq('seo_status', 'sheet')),
    count(() => P().eq('seo_status', 'manual')),
    count(() => P().eq('seo_status', 'ai')),
    count(() => P().eq('seo_status', 'template')),
    count(() => P().eq('seo_status', 'missing')),
  ])

  // AI-eligible backlog: published, not human-authored/locked, real sellable
  // product (image+price+category+name) that still lacks a long description or a
  // meta field. This is the pool /api/admin/seo/ai-candidates draws from.
  const aiBacklog = await count(() =>
    P()
      .neq('seo_manual_lock', true)
      .neq('seo_status', 'sheet')
      .neq('seo_status', 'manual')
      .or('description_ua.is.null,meta_title.is.null,meta_description.is.null')
      .not('main_image_url', 'is', null)
      .gt('price_uah', 0)
      .not('category_slug', 'is', null)
      .not('name_ua', 'is', null),
  )

  // ── Actionable UA backlog (classified, not just counted) ────────────────────
  // Load ONLY the published rows that are actually incomplete — one bounded,
  // indexed filter — and classify each with the shared definition. At the current
  // catalog state this set is tiny (tens of rows), so the classification is exact;
  // it is capped so the endpoint stays bounded even if that ever changes.
  const CLASSIFY_CAP = 2000
  const actionable = {
    incomplete_rows_classified: 0,
    classified_sample_capped: false,
    actionable_supplier: 0,
    manual_exception: 0,
    manual_locked: 0,
    malformed_public: 0,
    actionable: 0,
    samples: [] as Array<{ sku: string; name: string; missing: string[]; klass: string }>,
    note: 'actionable = published supplier rows the UA AI pipeline can still fill. Manual products, human-locked rows and rows with an unusable public name are exceptions, not backlog.',
  }
  try {
    const { data } = await client
      .from('catalog_products')
      .select(UA_BACKLOG_COLS)
      .eq('status', 'published')
      .or('meta_title.is.null,meta_title.eq.,meta_description.is.null,meta_description.eq.,description_ua.is.null,description_ua.eq.')
      .limit(CLASSIFY_CAP)
    const rows = (data ?? []) as UaSeoRow[]
    actionable.incomplete_rows_classified = rows.length
    actionable.classified_sample_capped = rows.length >= CLASSIFY_CAP
    const summary = summarizeUaBacklog(rows)
    actionable.actionable_supplier = summary.actionable_supplier
    actionable.manual_exception = summary.manual_exception
    actionable.manual_locked = summary.manual_locked
    actionable.malformed_public = summary.malformed
    actionable.actionable = summary.actionable
    for (const row of rows.slice(0, 25)) {
      actionable.samples.push({
        sku: String(row.supplier_sku ?? ''),
        name: String(row.name_ua ?? row.name ?? ''),
        missing: missingUaFields(row),
        klass: classifyUaSeoRow(row),
      })
    }
  } catch { /* non-fatal — the coverage counts above still stand */ }

  // Top categories needing SEO — SAMPLED (bounded scan) so the diagnostic never
  // scans 100k rows. Tally category_slug of published products missing a long
  // description over the first `sampleSize` rows, report the top 15.
  const topCategoriesNeedingSeo: { category_slug: string; sampled_missing: number }[] = []
  let sampledRows = 0
  try {
    const { data } = await client
      .from('catalog_products')
      .select('category_slug')
      .eq('status', 'published')
      .is('description_ua', null)
      .not('category_slug', 'is', null)
      .limit(sampleSize)
    const rows = (data ?? []) as { category_slug: string | null }[]
    sampledRows = rows.length
    const tally = new Map<string, number>()
    for (const r of rows) {
      if (!r.category_slug) continue
      tally.set(r.category_slug, (tally.get(r.category_slug) ?? 0) + 1)
    }
    for (const [category_slug, n] of [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      topCategoriesNeedingSeo.push({ category_slug, sampled_missing: n })
    }
  } catch { /* non-fatal */ }

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)

  return Response.json({
    ok: true,
    generated_at: new Date().toISOString(),
    totals: {
      published_products: total,
      with_meta_title: withMetaTitle,
      with_meta_description: withMetaDescription,
      with_long_description: withLongDescription,
      missing_any_meta: missingAnyMeta,
      missing_long_description: missingLongDescription,
    },
    coverage_pct: {
      meta_title: pct(withMetaTitle),
      meta_description: pct(withMetaDescription),
      long_description: pct(withLongDescription),
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
      eligible_products: aiBacklog,
      note: 'Published, non-locked, non-sheet/manual products with image+price+category+name that still need a long description or a meta field. Source pool for /api/admin/seo/ai-candidates.',
    },
    // The ONLY number that represents real remaining UA SEO work. Manual Dacha TV
    // products, human-locked rows and rows with an unusable public name are
    // reported separately instead of being counted as broken supplier SEO — see
    // lib/catalog/seo-backlog.ts. `incomplete_rows_classified` is exact when
    // `classified_sample_capped` is false.
    actionable_backlog: actionable,
    top_categories_needing_seo: {
      sampled_rows: sampledRows,
      note: 'Approximate — tallied from a bounded sample of products missing a long description.',
      categories: topCategoriesNeedingSeo,
    },
  })
}
