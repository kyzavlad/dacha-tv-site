export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchUkCategoryNameSources } from '@/lib/supabase/catalog'
import {
  resolveUkCategoryName,
  resolveRuCategoryName,
  isGenericCategoryName,
} from '@/lib/catalog/uk-category-name'
import type { CatalogCategory } from '@/types'

// ─── Category localization diagnostic (CRON_SECRET) ───────────────────────────
// Reports how many published categories resolve to a REAL name per locale, how
// many still collapse onto a generic/duplicate title, and which rows a human
// must name by hand. Slugs appear HERE ONLY — never in public output.
//
//   curl -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3030/api/admin/diag/categories
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const client = getAdminClient()
  const { data, error } = await client
    .from('catalog_categories')
    .select('id, slug, name_ua, h1, supplier_category_id, source, seo_status, seo_manual_lock')
    .eq('is_published', true)
    .order('slug', { ascending: true })
    .limit(2000)

  if (error) return Response.json({ ok: false, message: `categories read failed: ${error.message}` }, { status: 200 })

  const rows = (data ?? []) as unknown as CatalogCategory[]
  // Protected route → admin client so RLS cannot hide a source row.
  const sources = await fetchUkCategoryNameSources(rows, client).catch(() => new Map())

  // FULL counters — computed for every row, never capped by the sample limits.
  let usableUk = 0
  let usableRu = 0
  let genericStoredCount = 0
  const ukNames: string[] = []
  const genericRows: Array<{ slug: string; stored_name_ua: string | null }> = []
  const needsReview: Array<{ slug: string; russian_source: string | null; suggested_uk: string | null; source: string }> = []
  const unresolved: Array<{ slug: string; stored_name_ua: string | null; supplier_category_id: string | null }> = []
  const samples: Array<{ slug: string; uk: string; ru: string | null; source: string }> = []

  for (const row of rows) {
    const src = { h1: row.h1, name_ua: row.name_ua, slug: row.slug, ...(sources.get(row.id) ?? {}) }
    const uk = resolveUkCategoryName(src)
    const ru = resolveRuCategoryName(src)

    if (uk.name) { usableUk++; ukNames.push(uk.name) } else {
      unresolved.push({ slug: row.slug, stored_name_ua: row.name_ua ?? null, supplier_category_id: row.supplier_category_id ?? null })
    }
    if (ru) usableRu++
    // needsReview = only a heuristic SUGGESTION exists; it is never rendered.
    if (uk.needsReview && uk.suggestedName && needsReview.length < 100) {
      needsReview.push({ slug: row.slug, russian_source: uk.russianSource, suggested_uk: uk.suggestedName, source: uk.source })
    }
    if (isGenericCategoryName(row.name_ua) || isGenericCategoryName(row.h1)) {
      genericStoredCount++
      if (genericRows.length < 200) genericRows.push({ slug: row.slug, stored_name_ua: row.name_ua ?? null })
    }
    if (samples.length < 25 && uk.name && ru && uk.name !== ru) {
      samples.push({ slug: row.slug, uk: uk.name, ru, source: uk.source })
    }
  }

  // Duplicate resolved names — the symptom of the original bug.
  const counts = new Map<string, number>()
  for (const n of ukNames) counts.set(n, (counts.get(n) ?? 0) + 1)
  const duplicates = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([name, count]) => ({ name, count }))

  return Response.json({
    ok: true,
    total_published_categories: rows.length,
    usable_uk_names: usableUk,
    usable_ru_names: usableRu,
    unique_uk_name_count: new Set(ukNames).size,
    duplicate_uk_names: duplicates,
    // Rows that still literally store a generic phrase (they are now overridden
    // at render time, but the stored value is worth fixing).
    generic_stored_rows: genericStoredCount,
    generic_stored_samples: genericRows.slice(0, 20),
    // Uncapped: every unresolved row needs a human name; needsReview is the
    // subset for which a heuristic suggestion could be offered.
    categories_requiring_review: unresolved.length,
    review_queue: needsReview.slice(0, 25),
    unresolved_categories: unresolved.length,
    unresolved_samples: unresolved.slice(0, 25),
    samples,
    note: 'unresolved = no VERIFIED Ukrainian name; those are excluded from /catalog, the sitemap and 404 on their UA page (/catalog/all stays available). review_queue carries a diagnostic heuristic suggestion that is NEVER rendered or persisted — add a verified mapping to CURATED_UK_CATEGORY_NAMES.',
    timestamp: new Date().toISOString(),
  })
}
