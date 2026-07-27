export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchUkCategoryNameSources } from '@/lib/supabase/catalog'
import { planCategoryNameBackfill, type BackfillSkip } from '@/lib/catalog/uk-category-name'
import type { CatalogCategory } from '@/types'

// ─── Idempotent Ukrainian category-name backfill (CRON_SECRET) ────────────────
// Writes ONLY `catalog_categories.name_ua`, and only when the resolved name is a
// VERIFIED Ukrainian value (curated mapping, reviewed uk translation row, or a
// genuine Ukrainian supplier name). Heuristic suggestions are diagnostic-only
// and are never persisted; generic phrases are never written; a valid stored
// Ukrainian name is never overwritten — so re-running is a no-op.
//
//   GET            → DRY RUN (default)
//   POST ?apply=1  → apply
// Russian content in catalog_category_translations is not touched.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  return run(req, true)
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  return run(req, new URL(req.url).searchParams.get('apply') !== '1')
}

async function run(req: Request, dryRun: boolean) {
  const url = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '2000', 10) || 2000, 1), 5000)
  const sampleCap = Math.min(Math.max(parseInt(url.searchParams.get('samples') ?? '25', 10) || 25, 20), 100)
  // Protected route → admin client everywhere, so RLS cannot hide a source row
  // and make a resolvable category look unusable.
  const client = getAdminClient()

  const { data, error } = await client
    .from('catalog_categories')
    .select('id, slug, name_ua, h1, supplier_category_id, seo_status, seo_manual_lock, source')
    .eq('is_published', true)
    .order('slug', { ascending: true })
    .limit(limit)

  if (error) return Response.json({ ok: false, message: `categories read failed: ${error.message}` }, { status: 200 })

  const rows = (data ?? []) as unknown as CatalogCategory[]
  const sources = await fetchUkCategoryNameSources(rows, client).catch(() => new Map())

  // FULL counters — never capped by the sample limits below.
  let scanned = 0
  let changed = 0
  let writeConflicts = 0
  let writeErrors = 0
  const skipped: Record<BackfillSkip, number> = {
    manual_lock: 0, protected_status: 0, manual_source: 0, already_valid: 0, needs_review: 0, unusable: 0,
  }
  const samples: Array<{ slug: string; source_name: string | null; proposed_uk: string; source_type: string }> = []
  const unusableSamples: Array<{ slug: string; stored_name_ua: string | null }> = []
  const reviewSamples: Array<{ slug: string; source_name: string | null; suggested_name: string | null }> = []

  for (const row of rows) {
    scanned++
    const plan = planCategoryNameBackfill({
      id: row.id,
      slug: row.slug,
      h1: row.h1,
      name_ua: row.name_ua,
      seo_status: row.seo_status,
      seo_manual_lock: row.seo_manual_lock,
      source: row.source,
      ...(sources.get(row.id) ?? {}),
    })

    if (plan.skip) {
      skipped[plan.skip]++
      if (plan.skip === 'unusable' && unusableSamples.length < 50) {
        unusableSamples.push({ slug: plan.slug, stored_name_ua: row.name_ua ?? null })
      }
      if (plan.skip === 'needs_review' && reviewSamples.length < 50) {
        reviewSamples.push({ slug: plan.slug, source_name: plan.sourceName, suggested_name: plan.suggestedName })
      }
      continue
    }
    if (!plan.payload) continue

    if (samples.length < sampleCap) {
      samples.push({
        slug: plan.slug,
        source_name: plan.sourceName,
        proposed_uk: plan.payload.name_ua,
        source_type: plan.sourceType,
      })
    }

    if (dryRun) { changed++; continue }

    // NULL-SAFE protection. `.neq(col, v)` excludes NULL rows in SQL, so the old
    // filters silently matched ZERO rows for categories whose seo_status /
    // seo_manual_lock / source are NULL. Each guard now explicitly allows NULL.
    // `.select('id')` returns the rows actually updated, so `changed` only
    // counts real writes and a zero-row match is reported as a write conflict.
    const { data: updated, error: upErr } = await client
      .from('catalog_categories')
      .update({ ...plan.payload, updated_at: new Date().toISOString() })
      .eq('id', plan.id)
      .or('seo_manual_lock.is.null,seo_manual_lock.eq.false')
      .or('seo_status.is.null,and(seo_status.neq.sheet,seo_status.neq.manual)')
      .or('source.is.null,source.neq.manual')
      .select('id')

    if (upErr) { writeErrors++; continue }
    if (!updated || updated.length === 0) { writeConflicts++; continue }
    changed++
  }

  return Response.json({
    ok: true,
    dryRun,
    scanned,
    updated: changed,
    changed,
    write_conflicts: writeConflicts,
    write_errors: writeErrors,
    skipped,
    // Full, uncapped counters.
    categories_requiring_review: skipped.needs_review,
    unresolved_categories: skipped.unusable,
    // Capped samples.
    samples,
    unusable_samples: unusableSamples.slice(0, 25),
    review_queue: reviewSamples.slice(0, 25),
    message: `${dryRun ? 'DRY RUN — would update' : 'Updated'} ${changed} of ${scanned} published categories. ${skipped.needs_review} need a verified mapping (heuristic suggestion only, never written), ${skipped.unusable} have no usable source name${writeConflicts ? `, ${writeConflicts} write conflicts (row protected between read and write)` : ''}.`,
  })
}
