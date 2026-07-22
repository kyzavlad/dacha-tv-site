import { getAdminClient } from '@/lib/supabase/admin'
import { autoSlug } from '@/lib/catalog/csv-utils'
import { buildSupplierUpdatePayload, planGuardedWrites, type CatalogUpdatePayload, type ExistingCatalogOwnership } from '@/lib/catalog/field-ownership'
import { isValidHumanCategoryName, deterministicCategoryIntro } from '@/lib/catalog/category-fallback'
import { AUTOMATION_MAX_PUBLISHED, NEW_PRODUCT_INSERT_BATCH_CAP } from '@/lib/catalog/automation-config'
import { normalizeStock } from '@/lib/catalog/stock'
import { refreshExistingCatalogFromSupplier } from '@/lib/catalog/existing-product-refresh'
import {
  buildNewProductRow, combineExistingAndNewBatchResults,
  type NewProductCandidate, type NewInsertBatchResult,
} from '@/lib/catalog/new-product-insert'

type AdminClient = ReturnType<typeof getAdminClient>

// Paginate a select past the PostgREST 1000-row default cap. `build` gets the
// inclusive [from,to] range. Without this, category loads silently stopped at
// 1000 rows, so in-memory slug-collision detection was incomplete and a
// regenerated slug could collide with an unloaded row → 23505 unique violation
// against catalog_categories_slug_key, surfacing as the "Fix names"/"Finalize"
// card errors.
async function selectAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  const P = 1000
  for (let from = 0; ; from += P) {
    const { data, error } = await build(from, from + P - 1)
    if (error || !data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < P) break
  }
  return out
}

// Update a catalog_categories row's name/slug, retrying with a numeric suffix on
// a UNIQUE(slug) violation (23505). Belt-and-suspenders on top of the in-memory
// usedSlugs guard so a slug collision can never throw the whole action.
async function writeCategoryNameSlug(
  client: AdminClient,
  id: string,
  fields: { name_ua?: string; slug: string; is_published?: boolean },
  usedSlugs: Set<string>,
): Promise<string | null> {
  const base = fields.slug
  for (let attempt = 1; attempt <= 20; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`
    if (usedSlugs.has(slug) && slug !== base) continue
    const { error } = await client.from('catalog_categories').update({ ...fields, slug }).eq('id', id)
    if (!error) { usedSlugs.add(slug); return slug }
    if ((error as { code?: string }).code !== '23505') return null
  }
  return null
}


export interface PipelineStats {
  supplierCategories: number
  supplierProductsNew: number        // eligible supplier products not yet in catalog_products
  catalogCategories: number
  catalogCategoriesPublished: number
  catalogProducts: number
  catalogProductsDraft: number
  catalogProductsPublished: number
  productsWithNoCategory: number     // catalog_products with category_slug IS NULL
  numericCategoryNames: number       // catalog_categories where name_ua is purely numeric
  numericSlugProductCount: number    // catalog_products whose category_slug points to a numeric-named category
  suspiciousPriceCount: number       // catalog_products flagged is_price_suspicious (shown as "Ціна за запитом")
}

export interface SyncCategoriesResult {
  ok: boolean
  inserted: number
  skipped: number
  numericFixed: number
  message: string
}

export interface SyncProductsResult {
  ok: boolean
  inserted: number
  updated: number
  skipped: number
  errors: number
  errorGroups: Record<string, number>
  duplicateSlugFixed?: number   // rows where slug was regenerated to avoid 23505
  message: string
  // Truthful batch accounting (never conflate "inserted" with "did work").
  processed?: number
  approved?: number
  failed?: number
  insertsSkippedCap?: number
  // ACTIONABLE backlog only: remaining === remainingExisting + remainingNew.
  // Deliberately excludes blockedManual (supplier rows shadowed by a
  // source='manual' catalog row) so a caller looping "until remaining === 0"
  // actually terminates once all real work is done — a manual-shadowed row
  // can never be approved by either path, so counting it here would mean
  // `remaining` never reaches zero.
  remaining?: number
  remainingExisting?: number
  remainingNew?: number
  remainingTotal?: number
  // Diagnostics only: unapproved supplier rows matched to a source='manual'
  // catalog row. Never approved automatically by either path — reported
  // separately, not folded into `remaining`.
  blockedManual?: number
  errorSamples?: string[]
  // Populated on dry-run only
  wouldInsert?: number
  wouldUpdate?: number
  backlogImportable?: number
  samples?: Array<{ sku: string; name: string }>
}

export interface OrphanedApprovedResult {
  ok: boolean
  total_approved: number
  orphaned: number
  orphaned_ids: string[]
  samples: Array<{ id: string; supplier_sku: string; name: string }>
  message: string
}

export interface RecoverOrphanedResult {
  ok: boolean
  orphaned: number
  recovered: number
  message: string
}

export interface ExtractImagesResult {
  ok: boolean
  applied: boolean
  limit: number
  effectiveLimit: number
  selected: number
  total: number
  missing: number
  extractable: number
  remainingMissing: number
  remainingExtractable?: number
  updated: number
  errors: number
  samples: Array<{ sku: string; url: string }>
  message: string
}

export interface SeoSheetPriorityResult {
  ok: boolean
  applied: boolean
  sheet_skus: number
  in_supplier: number
  already_in_catalog: number
  importable: number
  imported: number
  errors: number
  samples: Array<{ sku: string; name: string }>
  message: string
}

export interface PublishResult {
  ok: boolean
  updated: number
  message: string
}

export interface ManualPublishResult {
  ok: boolean
  applied: boolean
  draftTotal: number          // total draft catalog_products
  eligibleQuality?: number    // quality=true only: drafts with image + meta_title + meta_description
  wouldPublish: number        // drafts that would be published this run (after limit)
  published: number           // rows actually flipped to published (0 on dry run)
  skipped: number             // drafts left unpublished because of the limit
  errors: number
  samples: Array<{ sku: string; name: string }>
  message: string
}

export interface BackfillResult {
  ok: boolean
  updated: number
  skipped: number
  message: string
}

export interface RepairCategoryNamesResult {
  ok: boolean
  supplierFixed: number    // supplier_categories rows where name was updated
  catalogFixed: number     // catalog_categories rows where name_ua + slug were updated
  remaining: number        // catalog_categories still numeric after repair
  message: string
}

export async function getPipelineStats(): Promise<PipelineStats> {
  const client = getAdminClient()

  const [
    { count: supplierCategories },
    { count: catalogCategories },
    { count: catalogCategoriesPublished },
    { count: catalogProducts },
    { count: catalogProductsDraft },
    { count: catalogProductsPublished },
    { count: productsWithNoCategory },
    { count: eligibleSupplierCount },
    numericCatRowsAll,
  ] = await Promise.all([
    client.from('supplier_categories').select('id', { count: 'exact', head: true }),
    client.from('catalog_categories').select('id', { count: 'exact', head: true }),
    client.from('catalog_categories').select('id', { count: 'exact', head: true }).eq('is_published', true),
    client.from('catalog_products').select('id', { count: 'exact', head: true }),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).is('category_slug', null),
    // Eligible supplier products: have name + price (HEAD count — no row transfer).
    client.from('supplier_products').select('id', { count: 'exact', head: true })
      .not('name', 'is', null).gt('price_uah', 0),
    // catalog_categories with numeric name_ua — paginated so we never miss rows
    // past the PostgREST 1000-row cap and never risk a partial-data crash.
    (async () => {
      const rows: { name_ua: string | null; slug: string | null }[] = []
      const P = 1000
      for (let from = 0; ; from += P) {
        const { data, error } = await client
          .from('catalog_categories').select('name_ua, slug')
          .order('id', { ascending: true }).range(from, from + P - 1)
        if (error || !data || data.length === 0) break
        rows.push(...data as typeof rows)
        if (data.length < P) break
      }
      return rows
    })(),
  ])

  const numericCatRows = (numericCatRowsAll ?? []).filter((r) => /^\d+$/.test(String(r.name_ua ?? '')))
  const numericCategoryNames = numericCatRows.length

  // Count products whose category_slug points to a numeric-named category
  const numericSlugs = numericCatRows.map((r) => r.slug as string).filter(Boolean)
  let numericSlugProductCount = 0
  if (numericSlugs.length > 0) {
    // Chunk the .in() list so a large numeric-category set can't overflow the URL.
    for (let i = 0; i < numericSlugs.length; i += 100) {
      const { count } = await client
        .from('catalog_products')
        .select('id', { count: 'exact', head: true })
        .in('category_slug', numericSlugs.slice(i, i + 100))
      numericSlugProductCount += count ?? 0
    }
  }

  // Approximate "new" supplier products: eligible minus those already promoted.
  // HEAD counts only — avoids loading hundreds of thousands of SKUs into memory
  // (the previous full-table select was capped at 1000 and crashed/under-counted).
  const supplierProductsNew = Math.max(0, (eligibleSupplierCount ?? 0) - (catalogProducts ?? 0))

  // Suspicious-price count is a separate, guarded HEAD count: the
  // is_price_suspicious column only exists once migration 048/049 is applied, so
  // a missing column must degrade to 0 rather than failing the whole stats call.
  const suspiciousPriceCount = await client
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })
    .eq('is_price_suspicious', true)
    .then((r) => r.count ?? 0)
    .then((c) => c, () => 0)

  return {
    supplierCategories: supplierCategories ?? 0,
    supplierProductsNew,
    catalogCategories: catalogCategories ?? 0,
    catalogCategoriesPublished: catalogCategoriesPublished ?? 0,
    catalogProducts: catalogProducts ?? 0,
    catalogProductsDraft: catalogProductsDraft ?? 0,
    catalogProductsPublished: catalogProductsPublished ?? 0,
    productsWithNoCategory: productsWithNoCategory ?? 0,
    numericCategoryNames,
    numericSlugProductCount,
    suspiciousPriceCount,
  }
}

// Step 3: Create/update catalog_categories from supplier_categories.
// Existing entries (matched by supplier_category_id) are skipped to preserve SEO edits,
// except entries where name_ua is purely numeric — those get fixed from supplier_categories.
// Stable, collision-resistant slug suffix from the supplier category id (which is
// unique per row) — deterministic, unlike Date.now().
function supplierIdSuffix(supplierCategoryId: unknown): string {
  return autoSlug(String(supplierCategoryId ?? '')) || 'x'
}

export async function syncCatalogCategories(): Promise<SyncCategoriesResult> {
  const client = getAdminClient()

  const { data: supplierCats, error: fetchErr } = await client
    .from('supplier_categories')
    .select('supplier_id, name, name_ua')
    .order('name', { ascending: true })

  if (fetchErr || !supplierCats) {
    return { ok: false, inserted: 0, skipped: 0, numericFixed: 0, message: fetchErr?.message ?? 'Failed to fetch supplier categories' }
  }

  const { data: existing } = await client
    .from('catalog_categories')
    .select('supplier_category_id, id, name_ua, slug')

  const existingMap = new Map(
    (existing ?? [])
      .filter((r) => r.supplier_category_id)
      .map((r) => [r.supplier_category_id as string, r])
  )

  // Track all slugs to prevent collisions when fixing numeric names
  const usedSlugs = new Set((existing ?? []).map((r) => r.slug as string).filter(Boolean))

  const toInsert: Record<string, unknown>[] = []
  let fixed = 0

  for (const sc of supplierCats) {
    const supplierId = sc.supplier_id as string
    const displayName = ((sc.name_ua || sc.name || supplierId) as string).trim()
    const ex = existingMap.get(supplierId)

    if (ex) {
      // Fix numeric names that got stored instead of real names — also fix the slug
      if (/^\d+$/.test(String(ex.name_ua ?? '')) && displayName && !/^\d+$/.test(displayName)) {
        let newSlug = autoSlug(displayName)
        // If slug is taken by a different row, append a counter suffix
        if (usedSlugs.has(newSlug) && newSlug !== (ex.slug as string)) {
          let n = 2
          while (usedSlugs.has(`${newSlug}-${n}`)) n++
          newSlug = `${newSlug}-${n}`
        }
        usedSlugs.add(newSlug)
        await client
          .from('catalog_categories')
          .update({ name_ua: displayName, slug: newSlug })
          .eq('id', ex.id)
        fixed++
      }
      continue
    }

    // New category. Auto-fill a safe short description ONLY when the name is a
    // real human name (never generate copy from a numeric/code name), and mark it
    // as generated so legacy/manual content can replace it later.
    const validName = isValidHumanCategoryName(displayName)
    const row: Record<string, unknown> = {
      supplier_category_id: supplierId,
      slug: autoSlug(displayName),
      name_ua: displayName,
      is_published: false,
      display_order: 0,
    }
    if (validName) {
      const intro = deterministicCategoryIntro(displayName)
      if (intro) { row.description = intro; row.description_auto_generated = true }
    }
    toInsert.push(row)
  }

  const skipped = supplierCats.length - toInsert.length - fixed

  if (toInsert.length === 0) {
    return {
      ok: true,
      inserted: 0,
      skipped,
      numericFixed: fixed,
      message: `Всі категорії вже є${fixed > 0 ? `, виправлено ${fixed} числових назв` : ''}`,
    }
  }

  // toInsert rows are known-new (absent from existingMap by supplier_category_id),
  // so a plain INSERT is correct. We deliberately do NOT upsert on
  // supplier_category_id: only a PARTIAL unique index exists on that column, which
  // Postgres cannot use for ON CONFLICT inference (42P10) — that made every insert
  // chunk fail. On a slug collision (23505) we retry the single row with a suffix.
  let inserted = 0
  const errors: string[] = []
  const CHUNK = 100

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error } = await client.from('catalog_categories').insert(chunk)
    if (!error) { inserted += chunk.length; continue }
    // Isolate the failing chunk row-by-row; fix slug collisions with a suffix.
    for (const row of chunk) {
      const r = row as Record<string, unknown>
      const { error: e1 } = await client.from('catalog_categories').insert(r)
      if (!e1) { inserted++; continue }
      if ((e1 as { code?: string }).code === '23505') {
        const { error: e2 } = await client.from('catalog_categories').insert({ ...r, slug: `${r.slug}-${supplierIdSuffix(r.supplier_category_id)}` })
        if (!e2) { inserted++; continue }
        errors.push(e2.message)
      } else {
        errors.push(e1.message)
      }
    }
  }

  if (errors.length) {
    return { ok: false, inserted, skipped, numericFixed: fixed, message: `Inserted ${inserted}, fixed ${fixed}, ${errors.length} errors: ${errors[0]}` }
  }
  return {
    ok: true,
    inserted,
    skipped,
    numericFixed: fixed,
    message: `Додано ${inserted} нових категорій${fixed > 0 ? `, виправлено ${fixed} числових назв` : ''}, ${skipped} вже існували`,
  }
}

// Step 5: Create catalog_products from supplier_products.
// Price, stock, images come from API (supplier_products) — NEVER from Google Sheets.
// Existing catalog products: update price_uah and main_image_url from API only.
// New products: insert with status='draft'.
// SEO fields (description, meta_title, meta_description) are NOT set here — Step 6 handles those.
//
// opts.dryRun=true: compute toInsert/toUpdatePrice counts but write nothing and do NOT
//   mark is_approved=true. Returns wouldInsert/wouldUpdate/backlogImportable/samples.
// opts.skuFilter: import ONLY the listed SKUs (ignores is_approved flag — used for
//   targeted SEO-sheet-first import). Limit is still respected as a cap.
// Dispatcher: the daily untargeted batch (no skuFilter, not a dry-run preview)
// uses the new set-based existing-row refresh + bounded new-row insert path
// (syncExistingAndNewBatch, below) — this is what fixes the import-products
// 504. Targeted SKU imports (a short, explicit list — e.g. the SEO-priority
// sheet importer) and dry-run previews stay on the original combined
// load-everything-then-decide implementation: neither was ever the timeout
// risk (skuFilter lists are short; dry-run never writes), so they are left
// completely unchanged to minimize risk.
export async function syncProductsToCatalog(
  limit: number,
  opts: { dryRun?: boolean; skuFilter?: string[]; capNewInserts?: boolean } = {},
): Promise<SyncProductsResult> {
  if (opts.dryRun || (opts.skuFilter && opts.skuFilter.length > 0)) {
    return syncProductsToCatalogLegacy(limit, opts)
  }
  return syncExistingAndNewBatch(limit, opts)
}

// ─── New default path: set-based existing-row refresh + bounded new-row insert ──
export async function syncExistingAndNewBatch(
  limit: number,
  opts: { capNewInserts?: boolean } = {},
): Promise<SyncProductsResult> {
  const client = getAdminClient()
  const nowIso = new Date().toISOString()

  // The published cap blocks only NEW storefront insertion — never the daily
  // price/image/stock refresh of rows that already exist in catalog_products.
  let capReached = false
  if (opts.capNewInserts) {
    const { count: publishedCount } = await client
      .from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published')
    capReached = (publishedCount ?? 0) >= AUTOMATION_MAX_PUBLISHED
  }

  // ── Step 1: set-based refresh of every EXISTING catalog row matched to an
  // unapproved supplier row. Was: load up to `limit` supplier rows into JS then
  // one sequential UPDATE per SKU per changed field — tens of thousands of
  // PostgREST round-trips at limit=10000, the root cause of the 504. Now: one
  // RPC call does the whole batch as a single set-based UPDATE.
  const refresh = await refreshExistingCatalogFromSupplier(client, limit)
  if (!refresh.ok) {
    return {
      ok: false, inserted: 0, updated: 0, skipped: 0, errors: 1,
      errorGroups: { [refresh.message]: 1 },
      message: refresh.message,
      processed: 0, approved: 0, failed: 1,
    }
  }

  // ── Step 2: genuinely NEW supplier products (no existing catalog_products
  // row) still go through the JS insert path — deliberately bounded small
  // regardless of `limit`, since this was never the timeout risk.
  const insertResult = await insertNewSupplierProducts(client, NEW_PRODUCT_INSERT_BATCH_CAP, capReached, nowIso)

  const combined = combineExistingAndNewBatchResults(refresh, insertResult)

  return {
    ok: combined.ok,
    inserted: combined.inserted,
    updated: combined.updated,
    skipped: combined.insertsSkippedCap,
    errors: combined.failed,
    errorGroups: combined.errorGroups,
    duplicateSlugFixed: combined.duplicateSlugFixed,
    message: combined.message,
    processed: combined.processed,
    approved: combined.approved,
    failed: combined.failed,
    insertsSkippedCap: combined.insertsSkippedCap,
    // Actionable-only, per the required response semantics: remaining =
    // remainingExisting + remainingNew. blockedManual is reported separately
    // and deliberately excluded so this can reach zero.
    remaining: combined.remainingTotal,
    remainingExisting: combined.remainingExisting,
    remainingNew: combined.remainingNew,
    remainingTotal: combined.remainingTotal,
    blockedManual: combined.blockedManual,
    errorSamples: combined.errorSamples,
  }
}

// A page consisting entirely of rows already refreshed by the RPC, or shadowed
// by a source='manual' catalog row, must never stall the search for genuinely
// new products — this bounds how many supplier rows we're willing to scan
// while looking for NEW_PRODUCT_INSERT_BATCH_CAP of them, without ever loading
// the full ~112k-row supplier table.
export const NEW_PRODUCT_SCAN_CEILING = 10000
export const NEW_PRODUCT_SCAN_PAGE = 500

// Bounded small-batch insert for genuinely-new supplier products (no existing
// catalog_products row). Pages through the unapproved queue — skipping rows
// already present in catalog_products (refreshed-by-RPC or manual-shadowed)
// without stopping — until `insertCap` new candidates are collected or the
// scan ceiling is hit. Mirrors the original insert logic (category-slug
// resolution, collision-safe slugging, chunked upsert with per-row fallback).
export async function insertNewSupplierProducts(
  client: AdminClient,
  insertCap: number,
  capReached: boolean,
  nowIso: string,
): Promise<NewInsertBatchResult> {
  const COLS = 'id, supplier_sku, name, name_ua, slug, supplier_category_id, price_uah, supplier_price_usd, main_image_url, images, stock_quantity, is_in_stock'
  const fail = (scanned: number, message: string): NewInsertBatchResult => ({
    ok: false, processed: 0, scanned, inserted: 0, approved: 0,
    insertsSkippedCap: 0, duplicateSlugFixed: 0, errors: [], message,
  })

  const newCandidates: NewProductCandidate[] = []
  let scanned = 0

  for (let from = 0; newCandidates.length < insertCap && scanned < NEW_PRODUCT_SCAN_CEILING; from += NEW_PRODUCT_SCAN_PAGE) {
    const to = from + NEW_PRODUCT_SCAN_PAGE - 1
    const { data, error: fetchErr } = await client
      .from('supplier_products')
      .select(COLS)
      .eq('is_approved', false)
      .not('name', 'is', null)
      .gt('price_uah', 0)
      .order('id', { ascending: true })
      .range(from, to)
    if (fetchErr) return fail(scanned, `supplier candidate read failed: ${fetchErr.message}`)
    if (!data || data.length === 0) break // queue exhausted
    scanned += data.length

    // Which of THIS page's SKUs already exist in catalog_products — either
    // just refreshed by the RPC, or shadowed by a source='manual' row the RPC
    // deliberately never touches. Either way, skip and KEEP SCANNING — a run
    // of existing/manual-shadow rows at the front of the queue must never
    // block genuinely-new rows further back.
    const pageSkus = data.map((p) => p.supplier_sku as string)
    const existingSkus = new Set<string>()
    const SKU_CHUNK = 500
    for (let i = 0; i < pageSkus.length; i += SKU_CHUNK) {
      const { data: existingChunk, error: exErr } = await client
        .from('catalog_products')
        .select('supplier_sku')
        .in('supplier_sku', pageSkus.slice(i, i + SKU_CHUNK))
      if (exErr) return fail(scanned, `existing-SKU read failed: ${exErr.message}`)
      for (const r of existingChunk ?? []) existingSkus.add(r.supplier_sku as string)
    }

    for (const sp of data as NewProductCandidate[]) {
      if (existingSkus.has(sp.supplier_sku)) continue
      newCandidates.push(sp)
      if (newCandidates.length >= insertCap) break
    }

    if (data.length < NEW_PRODUCT_SCAN_PAGE) break // last page
  }

  if (newCandidates.length === 0) {
    return { ok: true, processed: 0, scanned, inserted: 0, approved: 0, insertsSkippedCap: 0, duplicateSlugFixed: 0, errors: [] }
  }

  // Resolve category slug via supplier_category_id → catalog_categories.slug
  const catIds = [...new Set(newCandidates.map((p) => p.supplier_category_id).filter(Boolean) as string[])]
  const catSlugMap = new Map<string, string>()
  if (catIds.length > 0) {
    const { data: cats, error: catErr } = await client
      .from('catalog_categories')
      .select('supplier_category_id, slug')
      .in('supplier_category_id', catIds)
    if (catErr) return fail(scanned, `category lookup failed: ${catErr.message}`)
    for (const c of cats ?? []) {
      if (c.supplier_category_id) catSlugMap.set(c.supplier_category_id, c.slug)
    }
  }

  // Paginated slug read with explicit error propagation (not the shared
  // selectAllRows helper, which treats a read error the same as "no more
  // data" — acceptable for its other callers, but not here: a slug read
  // failure must never look like an empty catalog and risk a false slug
  // collision on insert).
  const slugRows: { slug: string }[] = []
  {
    const SLUG_PAGE = 1000
    for (let from = 0; ; from += SLUG_PAGE) {
      const to = from + SLUG_PAGE - 1
      const { data, error: slugErr } = await client
        .from('catalog_products').select('slug').order('slug', { ascending: true }).range(from, to)
      if (slugErr) return fail(scanned, `slug read failed: ${slugErr.message}`)
      if (!data || data.length === 0) break
      slugRows.push(...data)
      if (data.length < SLUG_PAGE) break
    }
  }
  const usedSlugs = new Set(slugRows.map((r) => r.slug).filter(Boolean))

  const toInsert: Record<string, unknown>[] = []
  const skuToSpId = new Map<string, string>()
  for (const sp of newCandidates) {
    skuToSpId.set(sp.supplier_sku, sp.id)
    const categorySlug = sp.supplier_category_id ? (catSlugMap.get(sp.supplier_category_id as string) ?? null) : null
    toInsert.push(buildNewProductRow(sp, categorySlug, usedSlugs, nowIso))
  }

  let inserted = 0, duplicateSlugFixed = 0, insertsSkippedCap = 0
  const errors: string[] = []
  const approvedIds = new Set<string>()
  const CHUNK = 200

  if (capReached) {
    insertsSkippedCap = toInsert.length
  } else {
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK)
      const { error } = await client
        .from('catalog_products')
        .upsert(chunk, { onConflict: 'supplier_sku', ignoreDuplicates: true })
      if (!error) {
        inserted += chunk.length
        for (const row of chunk) {
          const spId = skuToSpId.get(row.supplier_sku as string)
          if (spId) approvedIds.add(spId)
        }
        continue
      }

      // Chunk failed — isolate and retry each row, handling slug collisions.
      // A per-row insert failure is a SOFT error (folded into `errors` below,
      // feeding failed/errorGroups) — not a hard ok=false — matching the
      // pre-existing behavior for the insert step specifically.
      for (const row of chunk) {
        const sku = row.supplier_sku as string
        let currentRow = { ...row }
        let slugFixed = false
        let rowOk = false
        let rowErr = ''

        for (let attempt = 0; attempt <= 10; attempt++) {
          const { error: e2 } = await client
            .from('catalog_products')
            .upsert([currentRow], { onConflict: 'supplier_sku', ignoreDuplicates: true })
          if (!e2) {
            inserted++
            rowOk = true
            if (slugFixed) duplicateSlugFixed++
            const spId = skuToSpId.get(sku)
            if (spId) approvedIds.add(spId)
            break
          }
          const errCode = (e2 as { code?: string }).code
          if (errCode === '23505' && e2.message.includes('slug')) {
            const baseSlug = autoSlug(sku) || sku.toLowerCase().replace(/[^a-z0-9]/g, '-')
            currentRow = { ...currentRow, slug: `${baseSlug}-${attempt + 2}` }
            slugFixed = true
          } else {
            rowErr = e2.message
            break
          }
        }
        if (!rowOk && rowErr) errors.push(rowErr)
      }
    }
  }

  // Approve STRICTLY the supplier rows whose insert succeeded. An approval
  // UPDATE error is a HARD failure (ok=false) — those rows must NOT be
  // counted as approved even though their catalog_products row was already
  // inserted; they simply stay is_approved=false and are picked up again next
  // call as ordinary "existing" rows (their source defaults to 'supplier'),
  // where the RPC will refresh+approve them normally. Never silently treated
  // as success.
  const idsToApprove = [...approvedIds]
  const confirmedApprovedIds = new Set<string>()
  let approvalErrorMsg: string | null = null
  for (let i = 0; i < idsToApprove.length; i += 500) {
    const batchIds = idsToApprove.slice(i, i + 500)
    const { error: approveErr } = await client
      .from('supplier_products')
      .update({ is_approved: true })
      .in('id', batchIds)
    if (approveErr) {
      approvalErrorMsg = approveErr.message
      continue // still attempt remaining chunks; overall result is still ok=false
    }
    for (const id of batchIds) confirmedApprovedIds.add(id)
  }

  if (approvalErrorMsg) {
    return {
      ok: false,
      processed: newCandidates.length, scanned,
      inserted, approved: confirmedApprovedIds.size, insertsSkippedCap, duplicateSlugFixed, errors,
      message: `supplier approval update failed: ${approvalErrorMsg}`,
    }
  }

  return {
    ok: true,
    processed: newCandidates.length, scanned,
    inserted, approved: confirmedApprovedIds.size, insertsSkippedCap, duplicateSlugFixed, errors,
  }
}

// ─── Legacy path: targeted SKU imports + dry-run previews (unchanged) ─────────
async function syncProductsToCatalogLegacy(
  limit: number,
  opts: { dryRun?: boolean; skuFilter?: string[]; capNewInserts?: boolean } = {},
): Promise<SyncProductsResult> {
  const dryRun = opts.dryRun === true
  const client = getAdminClient()
  const nowIso = new Date().toISOString()

  // The published cap blocks only NEW storefront insertion — never the daily
  // price/image/stock refresh of rows that already exist in catalog_products.
  let capReached = false
  if (opts.capNewInserts) {
    const { count: publishedCount } = await client
      .from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published')
    capReached = (publishedCount ?? 0) >= AUTOMATION_MAX_PUBLISHED
  }

  // Load supplier products — either a targeted SKU list or the next unapproved batch.
  const supplierProducts: Array<{
    id: unknown; supplier_sku: unknown; name: unknown; name_ua: unknown; slug: unknown
    supplier_category_id: unknown; price_uah: unknown; supplier_price_usd: unknown
    main_image_url: unknown; images: unknown; stock_quantity: unknown; is_in_stock: unknown
  }> = []

  if (opts.skuFilter && opts.skuFilter.length > 0) {
    // Targeted import: load the specific SKUs regardless of is_approved.
    const FILTER_CHUNK = 300
    for (let i = 0; i < opts.skuFilter.length; i += FILTER_CHUNK) {
      const { data } = await client
        .from('supplier_products')
        .select('id, supplier_sku, name, name_ua, slug, supplier_category_id, price_uah, supplier_price_usd, main_image_url, images, stock_quantity, is_in_stock')
        .in('supplier_sku', opts.skuFilter.slice(i, i + FILTER_CHUNK))
        .not('name', 'is', null)
        .gt('price_uah', 0)
        .limit(limit)
      if (data) supplierProducts.push(...data)
    }
  } else {
    // Paginate past the PostgREST 1000-row cap, bounded to `limit` — a single
    // `.limit(10000)` silently returns only 1000, which is the root cause of the
    // stuck import. Never loads the whole 112k backlog: we stop at `limit`.
    const COLS = 'id, supplier_sku, name, name_ua, slug, supplier_category_id, price_uah, supplier_price_usd, main_image_url, images, stock_quantity, is_in_stock'
    const PAGE = 1000
    for (let from = 0; supplierProducts.length < limit; from += PAGE) {
      const to = Math.min(from + PAGE, limit) - 1
      const { data, error: fetchErr } = await client
        .from('supplier_products')
        .select(COLS)
        .eq('is_approved', false)
        .not('name', 'is', null)
        .gt('price_uah', 0)
        .order('id', { ascending: true })
        .range(from, to)
      if (fetchErr) {
        if (supplierProducts.length === 0) {
          return { ok: false, inserted: 0, updated: 0, skipped: 0, errors: 0, errorGroups: {}, message: fetchErr.message }
        }
        break // keep what we have; surface partial progress
      }
      if (!data || data.length === 0) break
      supplierProducts.push(...data)
      if (data.length < to - from + 1) break // last page
    }
  }

  if (supplierProducts.length === 0) {
    return { ok: true, inserted: 0, updated: 0, skipped: 0, errors: 0, errorGroups: {}, message: 'Нових товарів для синхронізації немає' }
  }

  // Resolve category slug via supplier_category_id → catalog_categories.slug
  const catIds = [...new Set(supplierProducts.map((p) => p.supplier_category_id).filter(Boolean) as string[])]
  const catSlugMap = new Map<string, string>()
  if (catIds.length > 0) {
    const { data: cats } = await client
      .from('catalog_categories')
      .select('supplier_category_id, slug')
      .in('supplier_category_id', catIds)
    for (const c of cats ?? []) {
      if (c.supplier_category_id) catSlugMap.set(c.supplier_category_id, c.slug)
    }
  }

  // Check which SKUs already exist in catalog_products.
  // Chunked to 500 SKUs per request — a single .in() over 5000 SKUs generates
  // a URL that exceeds PostgREST limits and the response is capped at 1000 rows,
  // both causing incorrect "not existing" false-negatives.
  const skus = supplierProducts.map((p) => p.supplier_sku as string)
  // Capture ownership (source + manual locks) alongside existence so the update
  // path can honor manual storefront fields instead of blindly overwriting them.
  const existingOwnership = new Map<string, ExistingCatalogOwnership>()
  const SKU_CHUNK = 500
  for (let i = 0; i < skus.length; i += SKU_CHUNK) {
    const { data: existingChunk } = await client
      .from('catalog_products')
      .select('supplier_sku, source, price_manual_lock, image_manual_lock')
      .in('supplier_sku', skus.slice(i, i + SKU_CHUNK))
    for (const r of existingChunk ?? []) {
      existingOwnership.set(r.supplier_sku as string, {
        source: (r as { source?: string | null }).source ?? null,
        price_manual_lock: (r as { price_manual_lock?: boolean | null }).price_manual_lock ?? false,
        image_manual_lock: (r as { image_manual_lock?: boolean | null }).image_manual_lock ?? false,
      })
    }
  }

  // Load ALL existing slugs — paginated past the PostgREST 1000-row cap.
  // A plain .select('slug') silently returns only the first 1000 rows, making
  // 2000+ slugs invisible to the in-memory collision check and causing false
  // negatives that later surface as a catalog_products_slug_key unique violation.
  const slugRows = await selectAllRows<{ slug: string }>(
    (from, to) => client.from('catalog_products').select('slug').order('slug', { ascending: true }).range(from, to),
  )
  const usedSlugs = new Set(slugRows.map((r) => r.slug).filter(Boolean))

  const toInsert: Record<string, unknown>[] = []
  const toUpdatePrice: { sku: string; payload: CatalogUpdatePayload }[] = []

  for (const sp of supplierProducts) {
    const sku = sp.supplier_sku as string
    const ownership = existingOwnership.get(sku)
    if (ownership) {
      // Already in catalog — refresh only the operational facts the supplier
      // still owns (price + imagery), skipping any manually-locked field and
      // never touching a fully manual row. buildSupplierUpdatePayload returns
      // null when there is nothing the import may write.
      const payload = buildSupplierUpdatePayload(
        {
          price_uah: sp.price_uah as number,
          main_image_url: sp.main_image_url as string | null,
          images: sp.images,
          stock_quantity: sp.stock_quantity as number | null,
          is_in_stock: sp.is_in_stock as boolean | null,
        },
        ownership,
      )
      if (payload) toUpdatePrice.push({ sku, payload })
      continue
    }
    const name = (sp.name_ua || sp.name || '') as string
    const categorySlug = sp.supplier_category_id ? (catSlugMap.get(sp.supplier_category_id as string) ?? null) : null

    // Collision-safe slug: name → name+sku → sku → sku-N (up to 999).
    // The numeric suffix loop ensures that even duplicate-sku products in a batch
    // always get a unique slug rather than colliding on the DB constraint.
    const candidateA = autoSlug(name)
    const candidateB = autoSlug(`${name} ${sku}`)
    const candidateC = autoSlug(sku) || sku.toLowerCase().replace(/[^a-z0-9]/g, '-')
    let slug = !usedSlugs.has(candidateA) ? candidateA
      : !usedSlugs.has(candidateB) ? candidateB
      : candidateC
    if (usedSlugs.has(slug)) {
      for (let n = 2; n <= 999; n++) {
        const candidate = `${candidateC}-${n}`
        if (!usedSlugs.has(candidate)) { slug = candidate; break }
      }
    }
    usedSlugs.add(slug)

    const priceUah = sp.price_uah as number
    const isPriceSuspicious = priceUah < 100 && priceUah >= 10 && (sp.supplier_price_usd == null)
    const stock = normalizeStock(sp.stock_quantity, sp.is_in_stock)

    toInsert.push({
      supplier_product_id: sp.id as string,
      supplier_sku: sku,
      name_ua: name,
      slug,
      category_slug: categorySlug,
      price_uah: priceUah,
      is_price_suspicious: isPriceSuspicious,
      main_image_url: sp.main_image_url as string | null,
      images: sp.images ?? null,
      stock_quantity: stock.stock_quantity,
      is_in_stock: stock.is_in_stock,
      stock_synced_at: nowIso,
      status: 'draft',
      is_featured: false,
      display_order: 0,
    })
  }

  // Dry-run: report what would happen without touching the DB or is_approved.
  if (dryRun) {
    const { count: backlogImportable } = await client
      .from('supplier_products')
      .select('id', { count: 'exact', head: true })
      .eq('is_approved', false)
      .not('name', 'is', null)
      .gt('price_uah', 0)
    const samples = toInsert.slice(0, 10).map((p) => ({
      sku: String(p.supplier_sku ?? ''),
      name: String(p.name_ua ?? ''),
    }))
    return {
      ok: true,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorGroups: {},
      duplicateSlugFixed: 0,
      message: `DRY RUN — додати ${toInsert.length}, оновити ${toUpdatePrice.length}. Черга: ${backlogImportable ?? '?'} готових`,
      wouldInsert: toInsert.length,
      wouldUpdate: toUpdatePrice.length,
      backlogImportable: backlogImportable ?? 0,
      samples,
    }
  }

  let inserted = 0, updated = 0, duplicateSlugFixed = 0, insertsSkippedCap = 0
  const errors: string[] = []
  const CHUNK = 200

  // SKU → supplier_products.id map — used to track which rows to approve.
  const skuToSpId = new Map(supplierProducts.map((p) => [p.supplier_sku as string, p.id as string]))
  // Only IDs of rows that were CONFIRMED inserted or updated go into this set.
  // Rows whose insert failed are NOT approved so they stay in the queue and retry.
  const approvedIds = new Set<string>()

  // Insert new products — UNLESS the published cap is reached, in which case new
  // storefront rows are deferred (counted, not inserted, left unapproved) while
  // the existing-row refresh below still runs. This is the key separation: the
  // cap gates NEW insertion/publication only, never the daily refresh.
  if (capReached) {
    insertsSkippedCap = toInsert.length
  } else
  // Chunk upsert first; on any error fall back to per-row so one bad row cannot
  // abort 200 good ones. Per-row fallback also handles residual 23505 slug
  // collisions by regenerating the slug with numeric suffixes.
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error } = await client
      .from('catalog_products')
      .upsert(chunk, { onConflict: 'supplier_sku', ignoreDuplicates: true })
    if (!error) {
      inserted += chunk.length
      for (const row of chunk) {
        const spId = skuToSpId.get(row.supplier_sku as string)
        if (spId) approvedIds.add(spId)
      }
      continue
    }

    // Chunk failed — isolate and retry each row, handling slug collisions.
    for (const row of chunk) {
      const sku = row.supplier_sku as string
      let currentRow = { ...row }
      let slugFixed = false
      let rowOk = false
      let rowErr = ''

      for (let attempt = 0; attempt <= 10; attempt++) {
        const { error: e2 } = await client
          .from('catalog_products')
          .upsert([currentRow], { onConflict: 'supplier_sku', ignoreDuplicates: true })
        if (!e2) {
          inserted++
          rowOk = true
          if (slugFixed) duplicateSlugFixed++
          const spId = skuToSpId.get(sku)
          if (spId) approvedIds.add(spId)
          break
        }
        const errCode = (e2 as { code?: string }).code
        if (errCode === '23505' && e2.message.includes('slug')) {
          // Slug collision — regenerate using SKU as the base with numeric suffix.
          // The SKU-based slug is stable across retries and avoids the collision.
          const baseSlug = autoSlug(sku) || sku.toLowerCase().replace(/[^a-z0-9]/g, '-')
          currentRow = { ...currentRow, slug: `${baseSlug}-${attempt + 2}` }
          slugFixed = true
        } else {
          rowErr = e2.message
          break
        }
      }
      if (!rowOk && rowErr) errors.push(rowErr)
    }
  }

  // Refresh existing products with supplier-owned facts only. Each field is
  // written in its own UPDATE whose WHERE re-checks the relevant manual lock AND
  // excludes source='manual' — so a lock toggled on AFTER candidate selection is
  // still honored (the guarded UPDATE simply matches zero rows). A matched row is
  // approved even when fully locked, since it already exists in the catalog.
  for (const { sku, payload } of toUpdatePrice) {
    const writes = planGuardedWrites(payload)
    let rowError: string | null = null
    let wrote = false
    for (const w of writes) {
      // Stock (guardColumn === null) is operational — no manual lock guard, but it
      // still stamps stock_synced_at and keeps the source!=manual guard below.
      const extra = w.guardColumn === null ? { stock_synced_at: nowIso } : {}
      let q = client
        .from('catalog_products')
        .update({ ...w.columns, ...extra, updated_at: nowIso }, { count: 'exact' })
        .eq('supplier_sku', sku)
        .or('source.is.null,source.neq.manual')
      if (w.guardColumn !== null) q = q.eq(w.guardColumn, false)
      const { error, count } = await q
      if (error) { rowError = error.message; break }
      if ((count ?? 0) > 0) wrote = true
    }
    if (rowError) {
      errors.push(rowError)
      continue
    }
    if (wrote) updated++
    const spId = skuToSpId.get(sku)
    if (spId) approvedIds.add(spId)
  }

  // Mark ONLY confirmed rows as approved — a failed insert must NOT be approved
  // because the product is absent from catalog_products and would become an orphan.
  const idsToApprove = [...approvedIds]
  for (let i = 0; i < idsToApprove.length; i += 500) {
    await client
      .from('supplier_products')
      .update({ is_approved: true })
      .in('id', idsToApprove.slice(i, i + 500))
  }

  const errorGroups: Record<string, number> = {}
  for (const e of errors) errorGroups[e] = (errorGroups[e] ?? 0) + 1

  // Remaining actionable backlog AFTER this batch (unapproved supplier rows).
  const { count: remainingCount } = await client
    .from('supplier_products')
    .select('id', { count: 'exact', head: true })
    .eq('is_approved', false)
    .not('name', 'is', null)
    .gt('price_uah', 0)

  const processed = supplierProducts.length
  const approved = approvedIds.size
  const failed = errors.length
  const remaining = remainingCount ?? 0
  const accounting = { processed, approved, failed, insertsSkippedCap, remaining, errorSamples: errors.slice(0, 5) }

  if (errors.length) {
    return {
      ok: false, inserted, updated, skipped: insertsSkippedCap, errors: errors.length, errorGroups,
      duplicateSlugFixed, ...accounting,
      message: `${errors.length} DB помилок: ${errors[0]}`,
    }
  }
  return {
    ok: true, inserted, updated, skipped: insertsSkippedCap, errors: 0, errorGroups: {},
    duplicateSlugFixed, ...accounting,
    message: `Оброблено ${processed}, додано ${inserted}, оновлено ${updated}, підтверджено ${approved}${insertsSkippedCap > 0 ? `, відкладено (ліміт) ${insertsSkippedCap}` : ''}, залишок ${remaining}`,
  }
}

// Step 7: Publish all unpublished catalog categories
// Publish only categories that have a REAL human name. A numeric/code-like name
// (e.g. an unresolved supplier id) must never go public — it would render a
// broken card. Bounded: categories number in the hundreds, read in one bounded
// page and published by id in chunks.
export async function publishAllCatalogCategories(): Promise<PublishResult> {
  const client = getAdminClient()
  const { data: candidates, error: readErr } = await client
    .from('catalog_categories')
    .select('id, name_ua')
    .eq('is_published', false)
    .limit(5000)
  if (readErr) return { ok: false, updated: 0, message: readErr.message }

  const publishable = (candidates ?? []).filter((c) => isValidHumanCategoryName(c.name_ua as string | null))
  const skipped = (candidates ?? []).length - publishable.length
  if (publishable.length === 0) {
    return { ok: true, updated: 0, message: `Немає категорій з валідними назвами для публікації${skipped > 0 ? ` (пропущено ${skipped} з числовими назвами)` : ''}` }
  }

  let updated = 0
  const errors: string[] = []
  const ids = publishable.map((c) => c.id as string)
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await client
      .from('catalog_categories')
      .update({ is_published: true })
      .in('id', ids.slice(i, i + 200))
    if (error) errors.push(error.message)
    else updated += ids.slice(i, i + 200).length
  }
  if (errors.length) return { ok: false, updated, message: `Опубліковано ${updated}, ${errors.length} помилок: ${errors[0]}` }
  return { ok: true, updated, message: `Опубліковано ${updated} категорій${skipped > 0 ? `, пропущено ${skipped} з числовими назвами` : ''}` }
}

// Step 7b: Backfill category_slug on existing catalog_products.
// Fixes products whose category_slug is null or stale by re-resolving:
//   catalog_products.supplier_sku → supplier_products.supplier_category_id
//                                  → catalog_categories.slug
//
// PRODUCTION-SAFE: this runs as a single SET-BASED SQL UPDATE inside Postgres via
// the backfill_category_slugs() function (migration 052). The previous in-memory
// implementation paginated the entire ~190k-row supplier_products AND
// catalog_products tables into JS Maps, which OOM-killed / timed-out the
// serverless function and surfaced as a 500 ("Server Components render") error.
// Manual products (source='manual') are never touched by the SQL function.
export async function backfillCategorySlugs(): Promise<BackfillResult> {
  const client = getAdminClient()

  const { data, error } = await client.rpc('backfill_category_slugs')
  if (error) {
    const code = (error as { code?: string }).code
    if (code === 'PGRST202' || code === '42883') {
      return {
        ok: false,
        updated: 0,
        skipped: 0,
        message: 'Функція backfill_category_slugs() відсутня — застосуйте міграцію 052_pipeline_safety.sql.',
      }
    }
    return { ok: false, updated: 0, skipped: 0, message: `backfill_category_slugs: ${error.message}` }
  }

  const row = Array.isArray(data) ? data[0] : data
  const updated = Number((row as { updated_count?: number } | null)?.updated_count ?? 0)
  return {
    ok: true,
    updated,
    skipped: 0,
    message: `Перепривʼязано category_slug у ${updated.toLocaleString('uk-UA')} товарів (set-based SQL).`,
  }
}

// True when a catalog_categories row has a purely-numeric name_ua AND is
// eligible for automated repair — manually-curated categories (source=
// 'manual') are never touched, even if one somehow has a numeric name_ua.
// Exported so this guarantee is directly unit-testable without a database.
export function isNumericAutoRepairableCategory(row: { name_ua: string | null; source: string | null }): boolean {
  return /^\d+$/.test(String(row.name_ua ?? '')) && row.source !== 'manual'
}

// Repair category names using data already stored in the database — supplier
// feed names that syncSupplierProducts/syncSupplierCategories already
// resolved into supplier_categories, with supplier_products.raw_data as a
// fallback. Propagates names to supplier_categories + catalog_categories.
// Idempotent — only overwrites null/empty/numeric names, never human-readable
// ones.
//
// Deliberately DOES NOT call fetchSupplierCategoryMap() (which downloads the
// complete YML/XML product feed) — this function runs as part of the daily
// sync-categories cron chain, which must never trigger that full-feed
// download (see lib/supplier/sync.ts's syncSupplierCategories doc comment).
// The DB already holds the same names via syncSupplierProducts's top-level
// category extraction, so a fresh feed download here would be redundant.
export async function repairCategoryNamesFromProducts(): Promise<RepairCategoryNamesResult> {
  const client = getAdminClient()
  const PAGE = 1000
  const ymlMap = new Map<string, string>()
  const nameSource = 'db'

  // 1. Find all supplier_categories with numeric-only name
  const numericSupplierCats: Array<{ id: string; supplier_id: string }> = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('supplier_categories')
      .select('id, supplier_id, name')
      .order('supplier_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const row of data) {
      if (/^\d+$/.test(String(row.name ?? ''))) {
        numericSupplierCats.push({ id: row.id as string, supplier_id: row.supplier_id as string })
      }
    }
    if (data.length < PAGE) break
  }

  if (numericSupplierCats.length === 0) {
    const catData = await selectAllRows<{ name_ua: string | null }>((f, t) =>
      client.from('catalog_categories').select('name_ua').order('id', { ascending: true }).range(f, t))
    const remaining = catData.filter((r) => /^\d+$/.test(String(r.name_ua ?? ''))).length
    return { ok: true, supplierFixed: 0, catalogFixed: 0, remaining, message: `Всі назви категорій вже людиночитані (джерело: ${nameSource})` }
  }

  // 2. Resolve a human-readable name per numeric category: YML map first, then
  //    sample supplier_products.raw_data as a fallback.
  const nameCache = new Map<string, string>() // supplier_id → human name
  for (const sc of numericSupplierCats) {
    const fromYml = ymlMap.get(sc.supplier_id)
    if (fromYml && !/^\d+$/.test(fromYml)) {
      nameCache.set(sc.supplier_id, fromYml)
      continue
    }
    const { data: products } = await client
      .from('supplier_products')
      .select('raw_data')
      .eq('supplier_category_id', sc.supplier_id)
      .limit(5)
    if (!products) continue
    for (const prod of products) {
      const p = (prod.raw_data ?? {}) as Record<string, unknown>
      const candidate = String(
        p.category        ?? p.category_name  ?? p.cat_name      ?? p.group         ??
        p.group_name      ?? p.section        ?? p.section_name  ?? p.category_title ??
        p.cat_title       ?? p.category_label ?? p.cat_label     ?? p.category_ua   ??
        p.cat_ua          ?? ''
      ).trim()
      if (candidate && !/^\d+$/.test(candidate)) {
        nameCache.set(sc.supplier_id, candidate)
        break
      }
    }
  }

  // 3. Update supplier_categories.name (and name_ua) for rows where a better name was found
  let supplierFixed = 0
  for (const sc of numericSupplierCats) {
    const newName = nameCache.get(sc.supplier_id)
    if (!newName) continue
    const { error } = await client
      .from('supplier_categories')
      .update({ name: newName, name_ua: newName })
      .eq('id', sc.id)
    if (!error) supplierFixed++
  }

  // 4. Fix catalog_categories: find numeric rows and update from supplier_categories.
  // Load ALL rows (paginated) so the slug set below is complete. Manually-curated
  // categories (source='manual') are excluded from the WRITE set below — their
  // names are hand-written and must never be touched by this automated repair,
  // even in the (unexpected) case one has a numeric name_ua.
  const catRows = await selectAllRows<{ id: string; supplier_category_id: string | null; name_ua: string | null; slug: string | null; source: string | null }>((f, t) =>
    client.from('catalog_categories').select('id, supplier_category_id, name_ua, slug, source').order('id', { ascending: true }).range(f, t))
  const numericCatRows = catRows.filter(isNumericAutoRepairableCategory)

  // Rebuild supplier name map after updates (paginated — never capped at 1000).
  const scAll = await selectAllRows<{ supplier_id: string; name: string | null; name_ua: string | null }>((f, t) =>
    client.from('supplier_categories').select('supplier_id, name, name_ua').order('supplier_id', { ascending: true }).range(f, t))
  const scNameMap = new Map(
    scAll.map((sc) => [sc.supplier_id, ((sc.name_ua || sc.name || '') as string).trim()])
  )

  // Complete slug set across ALL categories → collision-safe reslug.
  const usedSlugs = new Set(catRows.map((r) => String(r.slug ?? '')).filter(Boolean))

  let catalogFixed = 0
  for (const cat of numericCatRows) {
    const supplierId = cat.supplier_category_id
    if (!supplierId) continue
    const newName = scNameMap.get(supplierId)
    if (!newName || /^\d+$/.test(newName)) continue
    const written = await writeCategoryNameSlug(client, cat.id, { name_ua: newName, slug: autoSlug(newName) }, usedSlugs)
    if (written) catalogFixed++
  }

  // 5. Re-link products to the repaired slugs so /catalog cards get correct counts.
  let relinked = 0
  if (catalogFixed > 0) {
    try {
      const bf = await backfillCategorySlugs()
      relinked = bf.updated
    } catch { /* non-fatal — names are already fixed */ }
  }

  // 6. Count remaining numeric catalog categories
  const finalData = await selectAllRows<{ name_ua: string | null }>((f, t) =>
    client.from('catalog_categories').select('name_ua').order('id', { ascending: true }).range(f, t))
  const remaining = finalData.filter((r) => /^\d+$/.test(String(r.name_ua ?? ''))).length

  return {
    ok: true,
    supplierFixed,
    catalogFixed,
    remaining,
    message: `Джерело назв: ${nameSource}. Виправлено: ${supplierFixed} постачальних, ${catalogFixed} каталогних категорій, перепривʼязано ${relinked} товарів. Залишилось числових: ${remaining}`,
  }
}

// Step 8: Publish all draft catalog products
export async function publishAllCatalogProducts(): Promise<PublishResult> {
  const client = getAdminClient()
  const { data: ids, error: fetchErr } = await client
    .from('catalog_products')
    .select('id')
    .eq('status', 'draft')
  if (fetchErr) return { ok: false, updated: 0, message: fetchErr.message }
  if (!ids || ids.length === 0) return { ok: true, updated: 0, message: 'Всі товари вже опубліковані' }

  const idList = ids.map((r) => r.id)
  let updated = 0
  const CHUNK = 500
  for (let i = 0; i < idList.length; i += CHUNK) {
    const { error } = await client
      .from('catalog_products')
      .update({ status: 'published' })
      .in('id', idList.slice(i, i + CHUNK))
    if (!error) updated += Math.min(CHUNK, idList.length - i)
  }
  return { ok: true, updated, message: `Опубліковано ${updated} товарів` }
}

// Manual, controlled publish: flip up to `limit` draft catalog_products to
// published, with a dry-run default and full reporting. This is the protected
// counterpart to the daily publishBatch() (which publishes ALL drafts at once).
//
// There is NO publish cap in the codebase — AUTOMATION_MAX_PUBLISHED only gates
// IMPORT (importBatch stops importing once 3000 are published). Publishing drafts
// is therefore always allowed; this function adds dry-run + batching + counts so a
// bulk publish can be reviewed before it goes live.
//
// opts.quality=true: publish only rows that have main_image_url + meta_title +
//   meta_description — skips low-quality rows rather than surfacing them publicly.
//   eligibleQuality in the result tells how many pass the quality gate.
//
// SAFETY: touches ONLY status (+ updated_at). Never price, image, category, SEO.
export async function publishDraftProducts(
  opts: { dryRun?: boolean; limit?: number; quality?: boolean } = {},
): Promise<ManualPublishResult> {
  const dryRun = opts.dryRun === true
  const quality = opts.quality === true
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 100000
  const client = getAdminClient()

  const { count: draftTotal } = await client
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft')

  // Quality mode: restrict candidate pool to rows that have image + both meta fields.
  // Standard mode: all draft rows (original behaviour, unchanged).
  const buildQuery = (from: number, to: number) => {
    const q = client.from('catalog_products')
      .select('id, supplier_sku, name_ua')
      .eq('status', 'draft')
      .order('created_at', { ascending: true })
      .range(from, to)
    if (quality) {
      return q
        .not('main_image_url', 'is', null)
        .not('meta_title', 'is', null)
        .not('meta_description', 'is', null)
    }
    return q
  }

  // Load candidate rows (paginated past the 1000-row cap), oldest first, then cap.
  const candidateRows = await selectAllRows<{ id: string; supplier_sku: string | null; name_ua: string | null }>(buildQuery)

  const eligibleQuality = quality ? candidateRows.length : undefined
  const candidates = candidateRows.slice(0, limit)
  const skipped = Math.max(0, candidateRows.length - candidates.length)
  const samples = candidates.slice(0, 10).map((r) => ({
    sku: String(r.supplier_sku ?? ''),
    name: String(r.name_ua ?? ''),
  }))

  const qualityNote = quality
    ? ` (якість: зображення + meta_title + meta_description; eligible: ${eligibleQuality ?? 0})`
    : ''

  if (dryRun) {
    return {
      ok: true, applied: false,
      draftTotal: draftTotal ?? 0,
      ...(quality ? { eligibleQuality: eligibleQuality ?? 0 } : {}),
      wouldPublish: candidates.length,
      published: 0, skipped, errors: 0, samples,
      message: `DRY RUN — буде опубліковано ${candidates.length} з ${draftTotal ?? 0} draft-товарів${qualityNote}${skipped > 0 ? ` (${skipped} понад ліміт залишаться draft)` : ''}.`,
    }
  }

  let published = 0, errors = 0
  const ids = candidates.map((c) => c.id)
  const CHUNK = 500
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const { error } = await client
      .from('catalog_products')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .in('id', slice)
      .eq('status', 'draft') // never re-touch an already-published row
    if (error) errors += slice.length
    else published += slice.length
  }

  return {
    ok: errors === 0, applied: true,
    draftTotal: draftTotal ?? 0,
    ...(quality ? { eligibleQuality: eligibleQuality ?? 0 } : {}),
    wouldPublish: candidates.length,
    published, skipped, errors, samples,
    message: `Опубліковано ${published} товарів${qualityNote}${skipped > 0 ? `, ${skipped} залишилось draft (ліміт)` : ''}${errors > 0 ? `, помилок: ${errors}` : ''}.`,
  }
}

// ─── Full category normalization ──────────────────────────────────────────────
// Run AFTER migration 049.  Fixes slugs for categories whose name was updated
// by SQL (migration 049 only updates name_ua; TypeScript must regenerate slugs
// because Ukrainian transliteration is impractical in pure SQL).
// Also re-runs backfillCategorySlugs so products re-link to the new slugs.
// Idempotent.
export interface FullNormalizationResult {
  ok: boolean
  slugsFixed: number       // catalog_categories slugs regenerated
  productsRelinked: number // catalog_products.category_slug updated
  remaining: number        // catalog_categories with name_ua still purely numeric
  message: string
}

export async function fullCategoryNormalization(): Promise<FullNormalizationResult> {
  const client = getAdminClient()

  // 1. Find catalog_categories whose slug is still a bare number (starts with 'cat-'
  //    prefix added by migration 049, or is fully numeric) and whose name_ua is now readable.
  const { data: catRows } = await client
    .from('catalog_categories')
    .select('id, supplier_category_id, name_ua, slug')

  const toFix = (catRows ?? []).filter((r) => {
    const name = String(r.name_ua ?? '')
    const slug = String(r.slug ?? '')
    // Needs fix if slug is bare numeric OR starts with 'cat-' (migration placeholder)
    return !/^\d+$/.test(name) && (slug.startsWith('cat-') || /^\d/.test(slug))
  })

  const usedSlugs = new Set((catRows ?? []).map((r) => r.slug as string).filter(Boolean))
  const slugToId = new Map((catRows ?? []).map((r) => [r.slug as string, r.id as string]))

  let slugsFixed = 0
  for (const cat of toFix) {
    const oldSlug = cat.slug as string
    let newSlug = autoSlug(String(cat.name_ua ?? ''))
    if (!newSlug || newSlug === oldSlug) continue

    // Resolve collision
    if (usedSlugs.has(newSlug) && slugToId.get(newSlug) !== cat.id) {
      let n = 2
      while (usedSlugs.has(`${newSlug}-${n}`)) n++
      newSlug = `${newSlug}-${n}`
    }
    usedSlugs.add(newSlug)
    slugToId.set(newSlug, cat.id as string)

    const { error } = await client
      .from('catalog_categories')
      .update({ slug: newSlug })
      .eq('id', cat.id)
    if (!error) slugsFixed++
  }

  // 2. Re-link products to updated slugs
  let productsRelinked = 0
  try {
    const bf = await backfillCategorySlugs()
    productsRelinked = bf.updated
  } catch { /* non-fatal */ }

  // 3. Count remaining truly numeric
  const { data: finalRows } = await client.from('catalog_categories').select('id, name_ua')
  const remaining = (finalRows ?? []).filter((r) => /^\d+$/.test(String(r.name_ua ?? ''))).length

  return {
    ok: true,
    slugsFixed,
    productsRelinked,
    remaining,
    message: `Виправлено ${slugsFixed} slug-ів, перепривʼязано ${productsRelinked} товарів. Числових залишилось: ${remaining}`,
  }
}

// ─── Weak / duplicate / numeric category cleanup ─────────────────────────────
// Curated rename map for the weak, mixed-language labels the supplier emits.
// Keys are matched case-insensitively against the trimmed current name_ua.
// Several keys may map to the SAME clean name — that intentionally merges
// duplicates (e.g. "Автоаксессуары" + "Автоаксесуари" → one category).
const CATEGORY_NAME_FIXUPS: Record<string, string> = {
  'atv':              'Квадроцикли та аксесуари',
  'автоаксессуары':   'Автоаксесуари',
  'автоаксесуари':    'Автоаксесуари',
  'авто аксессуары':  'Автоаксесуари',
  'автомобильные':    'Автотовари',
  'автомобільні':     'Автотовари',
  'автотовары':       'Автотовари',
  'автотовари':       'Автотовари',
  'инструменты':      'Інструменти',
  'инструмент':       'Інструменти',
  'разное':           'Інші товари',
  'прочее':           'Інші товари',
  'другое':           'Інші товари',
}

export interface NormalizeFinalizeResult {
  ok: boolean
  renamed: number          // weak labels rewritten to clean names
  merged: number           // duplicate categories merged away (unpublished)
  productsMoved: number     // catalog_products repointed during merges
  numericNeutralized: number // numeric categories named/unpublished
  productsRelinked: number  // products relinked by the final backfill pass
  numericRemaining: number  // numeric public categories left (target: 0)
  publishedInNumeric: number // published products under numeric cats (target: 0)
  message: string
}

const isNumeric = (s: unknown) => /^\d+$/.test(String(s ?? '').trim())

// Count published products for a given category slug (HEAD count, no data fetch).
async function countPublishedForSlug(
  client: ReturnType<typeof getAdminClient>,
  slug: string,
): Promise<number> {
  const { count } = await client
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('category_slug', slug)
  return count ?? 0
}

// Full, idempotent catalog category cleanup. End state guarantees:
//   • numeric public categories       = 0
//   • published products in numeric    = 0
// Strategy: (1) apply curated rename map, (2) merge duplicate names into the
// category that already holds the most products, (3) for any still-numeric
// category, adopt a real supplier name if one exists else unpublish + neutralise
// the name so it leaves the public numeric count, (4) relink products.
export async function normalizeAndFinalizeCategories(): Promise<NormalizeFinalizeResult> {
  const client = getAdminClient()

  // Precheck: the manual/supplier split depends on catalog_categories.source.
  // Without it this pass cannot safely exclude manual categories — fail loud with
  // a clear instruction instead of silently processing nothing.
  const { error: sourceProbe } = await client
    .from('catalog_categories')
    .select('source', { head: true })
    .limit(1)
  if (sourceProbe && (sourceProbe as { code?: string }).code === '42703') {
    return {
      ok: false, renamed: 0, merged: 0, productsMoved: 0, numericNeutralized: 0,
      productsRelinked: 0, numericRemaining: 0, publishedInNumeric: 0,
      message: 'Колонка catalog_categories.source відсутня — застосуйте міграції 051_manual_catalog.sql та 052_pipeline_safety.sql.',
    }
  }

  // Exclude manually-curated categories (source='manual'): their names are
  // hand-written and must never be renamed, merged or archived by this pass.
  // Load ALL non-manual categories (paginated) so the slug set is complete and
  // reslug can never collide with an unloaded row.
  const load = () => selectAllRows<{ id: string; supplier_category_id: string | null; name_ua: string | null; slug: string | null; is_published: boolean }>((f, t) =>
    client.from('catalog_categories')
      .select('id, supplier_category_id, name_ua, slug, is_published')
      .neq('source', 'manual')
      .order('id', { ascending: true })
      .range(f, t))

  let cats = await load()
  const usedSlugs = new Set(cats.map((c) => String(c.slug ?? '')).filter(Boolean))

  // 1. Curated rename of weak labels.
  let renamed = 0
  for (const c of cats) {
    const cur = String(c.name_ua ?? '').trim()
    const clean = CATEGORY_NAME_FIXUPS[cur.toLowerCase()]
    if (clean && clean !== cur) {
      const written = await writeCategoryNameSlug(client, c.id, { name_ua: clean, slug: autoSlug(clean) || String(c.slug ?? '') }, usedSlugs)
      if (written) renamed++
    }
  }
  if (renamed > 0) cats = await load()

  // 2. Merge duplicates (same non-numeric name, case-insensitive).
  let merged = 0
  let productsMoved = 0
  const groups = new Map<string, typeof cats>()
  for (const c of cats) {
    const name = String(c.name_ua ?? '').trim()
    if (!name || isNumeric(name)) continue
    const key = name.toLowerCase()
    const arr = groups.get(key) ?? []
    arr.push(c)
    groups.set(key, arr)
  }
  for (const [, arr] of groups) {
    if (arr.length < 2) continue
    // Canonical = the member with the most published products.
    const counts = await Promise.all(arr.map((c) => countPublishedForSlug(client, String(c.slug))))
    let canonicalIdx = 0
    for (let i = 1; i < arr.length; i++) if (counts[i] > counts[canonicalIdx]) canonicalIdx = i
    const canonical = arr[canonicalIdx]
    for (let i = 0; i < arr.length; i++) {
      if (i === canonicalIdx) continue
      const dup = arr[i]
      // Repoint this duplicate's products to the canonical slug, then unpublish it.
      // Use a HEAD count (not .select('id')) so a category with tens of thousands
      // of products doesn't transfer every row into the serverless function.
      const { count: moved } = await client
        .from('catalog_products')
        .update({ category_slug: canonical.slug }, { count: 'exact' })
        .eq('category_slug', dup.slug)
      productsMoved += moved ?? 0
      await client
        .from('catalog_categories')
        .update({ is_published: false })
        .eq('id', dup.id)
      merged++
    }
  }
  if (merged > 0) cats = await load()

  // 3. Resolve / neutralise remaining numeric categories.
  // Build supplier_id → human name map for a last attempt at a real name.
  const scRows = await selectAllRows<{ supplier_id: string; name: string | null; name_ua: string | null }>((f, t) =>
    client.from('supplier_categories').select('supplier_id, name, name_ua').order('supplier_id', { ascending: true }).range(f, t))
  const scNameMap = new Map(
    scRows
      .map((sc) => [sc.supplier_id, String(sc.name_ua || sc.name || '').trim()] as [string, string])
      .filter(([, n]) => n && !isNumeric(n)),
  )

  let numericNeutralized = 0
  for (const c of cats) {
    if (!isNumeric(c.name_ua)) continue
    const supplierName = c.supplier_category_id ? scNameMap.get(String(c.supplier_category_id)) : undefined
    const curatedName = supplierName ? CATEGORY_NAME_FIXUPS[supplierName.toLowerCase()] : undefined
    const realName = curatedName ?? supplierName
    if (realName && !isNumeric(realName)) {
      const written = await writeCategoryNameSlug(client, c.id, { name_ua: realName, slug: autoSlug(realName) || String(c.slug ?? '') }, usedSlugs)
      if (written) numericNeutralized++
    } else {
      // No name recoverable → archive it. Renaming to a non-numeric label removes
      // it from the public numeric count; unpublishing routes its products into
      // the "Інші товари" catch-all (/catalog/all) so nothing is lost.
      const written = await writeCategoryNameSlug(
        client, c.id,
        { name_ua: `Архів категорії ${c.name_ua}`, slug: `arch-${c.slug}`, is_published: false },
        usedSlugs,
      )
      if (written) numericNeutralized++
    }
  }

  // 4. Relink products to any slugs that changed.
  let productsRelinked = 0
  try {
    const bf = await backfillCategorySlugs()
    productsRelinked = bf.updated
  } catch { /* non-fatal */ }

  // 5. Verify end state.
  const finalCats = await load()
  const numericRemaining = finalCats.filter((c) => isNumeric(c.name_ua)).length
  const numericSlugs = finalCats.filter((c) => isNumeric(c.name_ua)).map((c) => String(c.slug)).filter(Boolean)
  let publishedInNumeric = 0
  if (numericSlugs.length > 0) {
    const { count } = await client
      .from('catalog_products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .in('category_slug', numericSlugs)
    publishedInNumeric = count ?? 0
  }

  return {
    ok: numericRemaining === 0 && publishedInNumeric === 0,
    renamed,
    merged,
    productsMoved,
    numericNeutralized,
    productsRelinked,
    numericRemaining,
    publishedInNumeric,
    message: `Перейменовано ${renamed}, обʼєднано дублікатів ${merged} (переміщено ${productsMoved} товарів), нормалізовано числових ${numericNeutralized}, перепривʼязано ${productsRelinked}. Залишилось числових: ${numericRemaining}, опубл. товарів у числових: ${publishedInNumeric}`,
  }
}

// ─── Catalog image backfill ──────────────────────────────────────────────────
// Copies main_image_url + images from supplier_products → catalog_products for
// rows that are missing an image but whose matching supplier row has one.
//
// Why this is needed (independent of syncProductsToCatalog):
//   • Products imported BEFORE the mainimage extraction (PR #34) landed in
//     catalog_products with main_image_url = null.
//   • syncProductsToCatalog only re-touches supplier rows with is_approved=false,
//     so already-imported catalog rows are not guaranteed to get refreshed.
// This backfill closes that gap directly, matching on supplier_sku.
//
// SAFETY: touches ONLY main_image_url + images (+ updated_at). Never price,
// status, category, stock, or anything order/checkout related. Read-only unless
// `apply` is true — defaults to a dry run that reports exact affected counts.
export interface BackfillImagesResult {
  ok: boolean
  applied: boolean
  limit: number
  catalogTotal: number              // all catalog rows
  catalogMissingImage: number       // non-manual rows with no image (derived, avoids IS NULL timeout)
  selected: number                  // non-manual missing-image catalog rows scanned this run
  matchedSupplier: number           // selected rows that matched a supplier row (by sku or id)
  eligible: number                  // matched rows whose supplier actually has an image
  updated: number                   // rows written (0 on dry run)
  errors: number
  remainingMissing: number          // non-manual rows still missing an image after this run
  noSupplierMatchSample: string[]   // catalog keys with NO supplier row at all
  supplierWithoutImageSample: string[] // catalog keys matched a supplier row that has no image
  eligibleSample: { sku: string; supplier_image: string }[]
  message: string
}

const BACKFILL_IMAGES_DEFAULT_LIMIT = 1000
const BACKFILL_IMAGES_MAX_LIMIT = 1000
const BACKFILL_IMAGES_SUPPLIER_CHUNK = 300
const BACKFILL_IMAGES_UPDATE_CHUNK = 100
const BACKFILL_IMAGES_SELECT_PAGE = 500
// Cap catalog rows scanned per call. Lets us skip past a run of blocked rows
// (supplier match without an image) within one request to still collect a full
// `limit` batch of fillable rows, without risking a serverless timeout.
const BACKFILL_IMAGES_MAX_CATALOG_SCAN = 5000

// Non-manual filter: keep rows whose source is NULL or anything other than
// 'manual'. We never touch manually-curated rows (their images are hand-set).
const NON_MANUAL_OR = 'source.is.null,source.neq.manual'

// Targeted, catalog-first image backfill. Selects catalog rows that are missing
// an image (and are not manual), resolves their supplier rows by supplier_sku
// AND supplier_product_id, and copies the supplier image across when present.
//
// This is the inverse of the earlier supplier-first traversal, which got stuck
// scanning supplier rows that never matched the missing catalog rows
// (eligible=0, supplierScanned=6000 on every run). Here we drive directly off
// the rows that actually need an image, so every run makes progress and the
// unfillable remainder (no supplier match / supplier has no image) is reported
// explicitly instead of silently looking like "nothing to do".
//
// SAFETY: touches ONLY main_image_url + images (+ updated_at). Never overwrites
// an existing catalog image. Read-only unless `apply` is true.
export async function backfillCatalogImages(
  opts: { apply?: boolean; limit?: number } = {},
): Promise<BackfillImagesResult> {
  const apply = opts.apply === true
  const rawLimit = opts.limit && opts.limit > 0 ? opts.limit : BACKFILL_IMAGES_DEFAULT_LIMIT
  const limit = Math.min(rawLimit, BACKFILL_IMAGES_MAX_LIMIT)
  const client = getAdminClient()

  console.log(`[backfill-images-targeted] start — apply=${apply} limit=${limit}`)

  // Counts. Derive catalogMissingImage from NOT NULL counts to avoid the IS NULL
  // full-scan timeout (a timed-out HEAD count returns null → null ?? 0 = 0 would
  // wrongly read as "nothing to backfill").
  const [
    { count: catalogTotalRaw },
    { count: nonManualTotalRaw },
    { count: nonManualWithImageRaw },
  ] = await Promise.all([
    client.from('catalog_products').select('id', { count: 'exact', head: true }),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).or(NON_MANUAL_OR),
    client.from('catalog_products').select('id', { count: 'exact', head: true }).or(NON_MANUAL_OR).not('main_image_url', 'is', null),
  ])
  const catalogTotal = catalogTotalRaw ?? 0
  const nonManualTotal = nonManualTotalRaw ?? 0
  const catalogMissingImage = Math.max(0, nonManualTotal - (nonManualWithImageRaw ?? 0))

  console.log(`[backfill-images-targeted] catalogTotal=${catalogTotal} nonManualTotal=${nonManualTotal} missingImage=${catalogMissingImage}`)

  // ── Catalog-first scan ────────────────────────────────────────────────────────
  // Page through missing-image rows (ordered by id so .range paging is stable),
  // resolving each page's supplier images, until we collect `limit` fillable rows
  // or hit the scan cap. SELECT … IS NULL LIMIT short-circuits — no full scan.
  const eligibleMap = new Map<string, { sku: string; supplier_image: string; images: unknown }>()
  const noSupplierMatchSample: string[] = []
  const supplierWithoutImageSample: string[] = []
  let selected = 0
  let matchedSupplier = 0
  let offset = 0

  while (eligibleMap.size < limit && selected < BACKFILL_IMAGES_MAX_CATALOG_SCAN) {
    const { data: page } = await client
      .from('catalog_products')
      .select('id, supplier_sku, supplier_product_id')
      .is('main_image_url', null)
      .or(NON_MANUAL_OR)
      .order('id', { ascending: true })
      .range(offset, offset + BACKFILL_IMAGES_SELECT_PAGE - 1)

    if (!page || page.length === 0) break
    selected += page.length
    offset += page.length

    // Collect the keys to resolve against supplier_products.
    const pageSkus = [...new Set(page.map((r) => r.supplier_sku as string | null).filter(Boolean))] as string[]
    const pageIds = [...new Set(page.map((r) => r.supplier_product_id as string | null).filter(Boolean))] as string[]

    // Resolve supplier rows (image MAY be null — we need to tell "no match" apart
    // from "matched but supplier has no image").
    const supBySku = new Map<string, { main: string | null; images: unknown }>()
    for (let i = 0; i < pageSkus.length; i += BACKFILL_IMAGES_SUPPLIER_CHUNK) {
      const { data } = await client
        .from('supplier_products')
        .select('supplier_sku, main_image_url, images')
        .in('supplier_sku', pageSkus.slice(i, i + BACKFILL_IMAGES_SUPPLIER_CHUNK))
      for (const s of data ?? []) {
        const sku = s.supplier_sku as string | null
        if (sku) supBySku.set(sku, { main: s.main_image_url as string | null, images: s.images })
      }
    }
    const supById = new Map<string, { main: string | null; images: unknown }>()
    for (let i = 0; i < pageIds.length; i += BACKFILL_IMAGES_SUPPLIER_CHUNK) {
      const { data } = await client
        .from('supplier_products')
        .select('id, main_image_url, images')
        .in('id', pageIds.slice(i, i + BACKFILL_IMAGES_SUPPLIER_CHUNK))
      for (const s of data ?? []) {
        const id = s.id as string
        if (id) supById.set(id, { main: s.main_image_url as string | null, images: s.images })
      }
    }

    for (const row of page) {
      const sku = row.supplier_sku as string | null
      const spId = row.supplier_product_id as string | null
      const key = sku || spId || (row.id as string)

      // Prefer a supplier_sku match, fall back to supplier_product_id.
      const sup = (sku ? supBySku.get(sku) : undefined) ?? (spId ? supById.get(spId) : undefined)

      if (!sup) {
        if (noSupplierMatchSample.length < 10) noSupplierMatchSample.push(key)
        continue
      }
      matchedSupplier++

      if (!sup.main) {
        if (supplierWithoutImageSample.length < 10) supplierWithoutImageSample.push(key)
        continue
      }

      if (eligibleMap.size < limit && !eligibleMap.has(row.id as string)) {
        eligibleMap.set(row.id as string, { sku: sku ?? '', supplier_image: sup.main, images: sup.images })
      }
    }

    console.log(`[backfill-images-targeted] scanned ${selected} catalog rows → matched=${matchedSupplier} eligible=${eligibleMap.size}`)
  }

  const eligible = eligibleMap.size
  const entries = [...eligibleMap.entries()]
  const eligibleSample = entries.slice(0, 10).map(([, v]) => ({ sku: v.sku, supplier_image: v.supplier_image }))

  const blockedNote =
    `Зіставлено з постачальником: ${matchedSupplier}, з них без зображення: ${supplierWithoutImageSample.length >= 10 ? '10+' : supplierWithoutImageSample.length}. ` +
    `Без збігу з постачальником: ${noSupplierMatchSample.length >= 10 ? '10+' : noSupplierMatchSample.length}.`

  if (!apply) {
    return {
      ok: true, applied: false, limit, catalogTotal, catalogMissingImage,
      selected, matchedSupplier, eligible, updated: 0, errors: 0,
      remainingMissing: catalogMissingImage,
      noSupplierMatchSample, supplierWithoutImageSample, eligibleSample,
      message: `DRY RUN — переглянуто ${selected} товарів без зображення, ${eligible} можна заповнити. ${blockedNote} Усього без зображення: ${catalogMissingImage}. Запустіть POST (apply) для запису.`,
    }
  }

  // APPLY — write image columns only, in small chunks so a single bad row never
  // aborts the whole backfill and the request stays within the serverless timeout.
  let updated = 0, errors = 0
  const now = new Date().toISOString()
  for (let i = 0; i < entries.length; i += BACKFILL_IMAGES_UPDATE_CHUNK) {
    const chunkEntries = entries.slice(i, i + BACKFILL_IMAGES_UPDATE_CHUNK)
    for (const [catalogId, img] of chunkEntries) {
      const { error } = await client
        .from('catalog_products')
        .update({ main_image_url: img.supplier_image, images: img.images, updated_at: now })
        .eq('id', catalogId)
        .is('main_image_url', null) // never overwrite an existing image
      if (error) errors++
      else updated++
    }
    console.log(`[backfill-images-targeted] progress: ${Math.min(i + BACKFILL_IMAGES_UPDATE_CHUNK, entries.length)}/${entries.length}, updated=${updated} errors=${errors}`)
  }

  // Derive remaining from NOT NULL count — same pattern as above to avoid IS NULL timeout.
  const { count: withImageAfterRaw } = await client
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })
    .or(NON_MANUAL_OR)
    .not('main_image_url', 'is', null)
  const remainingMissing = withImageAfterRaw != null
    ? Math.max(0, nonManualTotal - withImageAfterRaw)
    : Math.max(0, catalogMissingImage - updated)

  console.log(`[backfill-images-targeted] done: updated=${updated} errors=${errors} remainingMissing=${remainingMissing}`)

  return {
    ok: errors === 0, applied: true, limit, catalogTotal, catalogMissingImage,
    selected, matchedSupplier, eligible, updated, errors, remainingMissing,
    noSupplierMatchSample, supplierWithoutImageSample, eligibleSample,
    message: `Заповнено зображення для ${updated} товарів. ${blockedNote} Залишилось без зображення: ${remainingMissing}${errors > 0 ? `. Помилок: ${errors}` : ''}.`,
  }
}

// ─── Orphaned approved products ──────────────────────────────────────────────
// Finds supplier_products rows where is_approved=true but NO matching row exists
// in catalog_products (by supplier_product_id or supplier_sku). This happens when
// an import batch fails mid-way but all processed IDs are marked approved anyway.
export async function findOrphanedApprovedProducts(): Promise<OrphanedApprovedResult> {
  const client = getAdminClient()

  const { count: totalApproved } = await client
    .from('supplier_products')
    .select('id', { count: 'exact', head: true })
    .eq('is_approved', true)

  if (!totalApproved) {
    return { ok: true, total_approved: 0, orphaned: 0, orphaned_ids: [], samples: [], message: 'Немає схвалених рядків постачальника' }
  }

  // Load all approved rows (paginated).
  const approvedRows = await selectAllRows<{ id: string; supplier_sku: string; name: string | null }>(
    (from, to) => client.from('supplier_products')
      .select('id, supplier_sku, name')
      .eq('is_approved', true)
      .order('id', { ascending: true })
      .range(from, to),
  )

  if (approvedRows.length === 0) {
    return { ok: true, total_approved: totalApproved, orphaned: 0, orphaned_ids: [], samples: [], message: 'Немає схвалених рядків постачальника' }
  }

  // Determine which supplier_products are represented in catalog_products.
  const spIds = approvedRows.map((r) => r.id).filter(Boolean)
  const spSkus = approvedRows.map((r) => r.supplier_sku).filter(Boolean)

  const inCatalogSpIds = new Set<string>()
  const inCatalogSkus = new Set<string>()

  for (let i = 0; i < spIds.length; i += 300) {
    const { data } = await client
      .from('catalog_products')
      .select('supplier_product_id')
      .in('supplier_product_id', spIds.slice(i, i + 300))
      .not('supplier_product_id', 'is', null)
    for (const r of data ?? []) {
      if (r.supplier_product_id) inCatalogSpIds.add(r.supplier_product_id as string)
    }
  }

  for (let i = 0; i < spSkus.length; i += 300) {
    const { data } = await client
      .from('catalog_products')
      .select('supplier_sku')
      .in('supplier_sku', spSkus.slice(i, i + 300))
    for (const r of data ?? []) {
      if (r.supplier_sku) inCatalogSkus.add(r.supplier_sku as string)
    }
  }

  const orphaned = approvedRows.filter((r) => !inCatalogSpIds.has(r.id) && !inCatalogSkus.has(r.supplier_sku))

  return {
    ok: true,
    total_approved: totalApproved,
    orphaned: orphaned.length,
    orphaned_ids: orphaned.map((r) => r.id),
    samples: orphaned.slice(0, 20).map((r) => ({ id: r.id, supplier_sku: r.supplier_sku, name: r.name ?? '' })),
    message: `Знайдено ${orphaned.length} схвалених рядків без відповідного каталогового товару (з ${totalApproved} схвалених)`,
  }
}

// Resets is_approved=false for orphaned rows so they re-enter the import queue.
// Dry-run by default — pass apply=true to write.
export async function recoverOrphanedProducts(opts: { apply?: boolean } = {}): Promise<RecoverOrphanedResult> {
  const apply = opts.apply === true
  const diag = await findOrphanedApprovedProducts()

  if (diag.orphaned === 0) {
    return { ok: true, orphaned: 0, recovered: 0, message: 'Осиротілих рядків не знайдено — всі схвалені мають відповідний товар у каталозі' }
  }

  if (!apply) {
    return {
      ok: true,
      orphaned: diag.orphaned,
      recovered: 0,
      message: `DRY RUN — ${diag.orphaned} осиротілих схвалених рядків буде скинуто до is_approved=false і повернуто в чергу. Запустіть з apply=true.`,
    }
  }

  const client = getAdminClient()
  const ids = diag.orphaned_ids
  let recovered = 0

  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await client
      .from('supplier_products')
      .update({ is_approved: false })
      .in('id', ids.slice(i, i + 500))
    if (!error) recovered += Math.min(500, ids.length - i)
  }

  return {
    ok: true,
    orphaned: diag.orphaned,
    recovered,
    message: `Скинуто is_approved=false для ${recovered} осиротілих рядків — вони знову в черзі на імпорт`,
  }
}

// ─── Supplier image extraction ────────────────────────────────────────────────
// Scans supplier_products.raw_data for image URLs (images.zone domain) and
// backfills main_image_url for rows that are still missing one.
// Never overwrites an existing main_image_url. Dry-run by default.
const IMAGES_ZONE_PREFIX = 'https://images.zone/'

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)$/i

// Validate a candidate supplier image URL. Returns the normalized URL only when
// it is a real images.zone file: correct host, a non-empty filename, and a
// supported image extension. Rejects junk like `https://images.zone/images/.jpg`
// (empty filename) or paths with no real extension.
function validImageZoneUrl(raw: unknown): string | null {
  if (!raw) return null
  const url = String(raw).trim()
  if (!url.startsWith(IMAGES_ZONE_PREFIX)) return null

  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }
  // strip query/hash already removed by URL.pathname; get the last path segment
  const filename = pathname.split('/').filter(Boolean).pop() ?? ''
  if (!filename) return null
  // must have a supported extension
  const ext = IMAGE_EXT_RE.exec(filename)
  if (!ext) return null
  // the part before the extension must be a real name, not empty (".jpg")
  const stem = filename.slice(0, filename.length - ext[0].length)
  if (!stem.trim()) return null

  return url
}

function extractImageFromRawData(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== 'object') return null
  const p = rawData as Record<string, unknown>

  const scalar: unknown[] = [p.mainimage, p.main_image, p.image, p.photo, p.picture, p.thumbnail, p.img]
  for (const v of scalar) {
    const url = validImageZoneUrl(v)
    if (url) return url
  }

  for (const field of ['images', 'pictures', 'photos']) {
    if (Array.isArray(p[field])) {
      for (const item of p[field] as unknown[]) {
        const url = validImageZoneUrl(item)
        if (url) return url
      }
    }
  }

  return null
}

const SUPPLIER_IMAGES_DEFAULT_LIMIT = 1000
// PostgREST silently caps a single SELECT at 1000 rows. Rather than pretend a
// larger limit is honored (it returned selected:1000 for limit:5000), we clamp
// the effective batch to 1000 and report effectiveLimit so the response is
// honest. A bigger batch needs repeated calls, not a bigger limit.
const SUPPLIER_IMAGES_MAX_LIMIT = 1000
const SUPPLIER_IMAGES_CHUNK = 100
const SUPPLIER_IMAGES_DRY_SAMPLE = 500

export async function extractSupplierImages(opts: { apply?: boolean; limit?: number } = {}): Promise<ExtractImagesResult> {
  const apply = opts.apply === true
  const rawLimit = opts.limit && opts.limit > 0 ? opts.limit : SUPPLIER_IMAGES_DEFAULT_LIMIT
  const limit = Math.min(rawLimit, SUPPLIER_IMAGES_MAX_LIMIT)
  const effectiveLimit = limit
  const client = getAdminClient()

  console.log(`[supplier-images] start — apply=${apply} limit=${limit}`)

  const { count: totalCount } = await client
    .from('supplier_products')
    .select('id', { count: 'exact', head: true })

  // Derive missing as total − withImage. The NOT NULL count is O(k) where k is
  // the number of rows that already have an image (often 0 early in a backfill),
  // making it fast even without an index. Counting IS NULL on a 200k-row column
  // with no index is a full sequential scan and can time out on serverless.
  const { count: withImageCount } = await client
    .from('supplier_products')
    .select('id', { count: 'exact', head: true })
    .not('main_image_url', 'is', null)

  const total = totalCount ?? 0
  const withImage = withImageCount ?? 0
  const missing = Math.max(0, total - withImage)

  console.log(`[supplier-images] counts: total=${total} withImage=${withImage} missing=${missing}`)

  if (!apply) {
    // Dry-run: sample up to SUPPLIER_IMAGES_DRY_SAMPLE rows to estimate extractable rate
    const { data: sampleRows } = await client
      .from('supplier_products')
      .select('id, supplier_sku, raw_data')
      .is('main_image_url', null)
      .order('id', { ascending: true })
      .limit(SUPPLIER_IMAGES_DRY_SAMPLE)

    const sampleCandidates = sampleRows ?? []
    let sampleExtractable = 0
    const samples: Array<{ sku: string; url: string }> = []
    for (const row of sampleCandidates) {
      const url = extractImageFromRawData(row.raw_data)
      if (url) {
        sampleExtractable++
        if (samples.length < 10) samples.push({ sku: row.supplier_sku, url })
      }
    }

    const rate = sampleCandidates.length > 0 ? sampleExtractable / sampleCandidates.length : 0
    const remainingExtractable = Math.round(missing * rate)

    console.log(`[supplier-images] dry-run: sample=${sampleCandidates.length} extractable_in_sample=${sampleExtractable} rate=${(rate * 100).toFixed(1)}% est_extractable=${remainingExtractable}`)

    return {
      ok: true, applied: false,
      limit, effectiveLimit, selected: sampleCandidates.length,
      total, missing,
      extractable: sampleExtractable,
      remainingMissing: missing,
      remainingExtractable,
      updated: 0, errors: 0, samples,
      message: `DRY RUN — всього ${total}, без зображення ~${missing}. У вибірці ${sampleCandidates.length}: ${sampleExtractable} мають images.zone URL (~${(rate * 100).toFixed(0)}%). Оцінка extractable: ~${remainingExtractable}.`,
    }
  }

  // Apply: load only `limit` rows, update in chunks
  const { data: candidateRows } = await client
    .from('supplier_products')
    .select('id, supplier_sku, raw_data')
    .is('main_image_url', null)
    .order('id', { ascending: true })
    .limit(limit)

  const candidates = candidateRows ?? []
  console.log(`[supplier-images] apply: loaded ${candidates.length} candidates`)

  const extractable: Array<{ id: string; sku: string; url: string }> = []
  for (const row of candidates) {
    const url = extractImageFromRawData(row.raw_data)
    if (url) extractable.push({ id: row.id, sku: row.supplier_sku, url })
  }

  console.log(`[supplier-images] apply: ${extractable.length} extractable from ${candidates.length} loaded`)

  const samples = extractable.slice(0, 10).map((r) => ({ sku: r.sku, url: r.url }))
  let updated = 0, errors = 0

  for (let i = 0; i < extractable.length; i += SUPPLIER_IMAGES_CHUNK) {
    const chunk = extractable.slice(i, i + SUPPLIER_IMAGES_CHUNK)
    for (const { id, url } of chunk) {
      const { error } = await client
        .from('supplier_products')
        .update({ main_image_url: url, images: [url], updated_at: new Date().toISOString() })
        .eq('id', id)
        .is('main_image_url', null)
      if (error) errors++
      else updated++
    }
    console.log(`[supplier-images] progress: ${Math.min(i + SUPPLIER_IMAGES_CHUNK, extractable.length)}/${extractable.length} processed, updated=${updated} errors=${errors}`)
  }

  // Post-apply NOT NULL count → derive remaining (fast: growing from 0 upward)
  const { count: withImageAfterCount } = await client
    .from('supplier_products')
    .select('id', { count: 'exact', head: true })
    .not('main_image_url', 'is', null)
  const withImageAfter = withImageAfterCount ?? (withImage + updated)
  const remainingMissing = Math.max(0, total - withImageAfter)

  console.log(`[supplier-images] done: updated=${updated} errors=${errors} withImageAfter=${withImageAfter} remainingMissing=${remainingMissing}`)

  return {
    ok: errors === 0, applied: true,
    limit, effectiveLimit, selected: candidates.length,
    total, missing,
    extractable: extractable.length,
    remainingMissing,
    updated, errors, samples,
    message: `Заповнено зображення для ${updated} рядків. Залишилось без зображення: ~${remainingMissing}${errors > 0 ? `. Помилок: ${errors}` : ''}.`,
  }
}

// ─── SEO-sheet priority import ────────────────────────────────────────────────
// Imports ONLY the products listed in the PRODUCT_SEO_CSV_URL sheet that are
// present in supplier_products but absent from catalog_products. Running this
// first lets the SEO sheet import run immediately after without waiting for the
// full 190k-row backlog to drain through importBatch.
// Dry-run by default — pass apply=true to write.
export async function importSeoSheetPriorityProducts(opts: {
  apply?: boolean
  limit?: number
} = {}): Promise<SeoSheetPriorityResult> {
  const apply = opts.apply === true
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 5000

  const csvUrl = (process.env.PRODUCT_SEO_CSV_URL ?? '').trim()
  if (!csvUrl) {
    return {
      ok: false, applied: false, sheet_skus: 0, in_supplier: 0, already_in_catalog: 0,
      importable: 0, imported: 0, errors: 0, samples: [],
      message: 'PRODUCT_SEO_CSV_URL не налаштовано',
    }
  }

  // Load the sheet and extract SKUs (first recognizable column).
  const { fetchCsvText, parseCsv, normalizeHeaders, getCol } = await import('./csv-utils')
  const fetched = await fetchCsvText(csvUrl)
  if (!fetched.ok) {
    return {
      ok: false, applied: false, sheet_skus: 0, in_supplier: 0, already_in_catalog: 0,
      importable: 0, imported: 0, errors: 0, samples: [],
      message: `Не вдалося завантажити SEO-таблицю: ${fetched.error}`,
    }
  }

  const allRows = parseCsv(fetched.text)
  if (allRows.length < 2) {
    return {
      ok: false, applied: false, sheet_skus: 0, in_supplier: 0, already_in_catalog: 0,
      importable: 0, imported: 0, errors: 0, samples: [],
      message: 'SEO-таблиця порожня',
    }
  }

  const headers = normalizeHeaders(allRows[0])
  const dataRows = allRows.slice(1)
  const sheetSkus = [...new Set(
    dataRows.map((row) => getCol(row, headers, 'sku').trim()).filter(Boolean)
  )]

  const client = getAdminClient()

  // Find sheet SKUs in supplier_products
  const inSupplierSkus = new Set<string>()
  for (let i = 0; i < sheetSkus.length; i += 300) {
    const { data } = await client
      .from('supplier_products')
      .select('supplier_sku')
      .in('supplier_sku', sheetSkus.slice(i, i + 300))
    for (const r of data ?? []) inSupplierSkus.add(r.supplier_sku as string)
  }

  // Find which are already in catalog_products
  const inCatalogSkus = new Set<string>()
  for (let i = 0; i < sheetSkus.length; i += 300) {
    const { data } = await client
      .from('catalog_products')
      .select('supplier_sku')
      .in('supplier_sku', sheetSkus.slice(i, i + 300))
    for (const r of data ?? []) inCatalogSkus.add(r.supplier_sku as string)
  }

  const importable = [...inSupplierSkus].filter((sku) => !inCatalogSkus.has(sku))

  const base = {
    sheet_skus: sheetSkus.length,
    in_supplier: inSupplierSkus.size,
    already_in_catalog: inCatalogSkus.size,
    importable: importable.length,
  }

  if (importable.length === 0) {
    return {
      ok: true, applied: apply, ...base, imported: 0, errors: 0, samples: [],
      message: `Усі ${inSupplierSkus.size} товари з SEO-таблиці вже є в каталозі`,
    }
  }

  if (!apply) {
    const samples = importable.slice(0, 10).map((sku) => ({ sku, name: '' }))
    return {
      ok: true, applied: false, ...base, imported: 0, errors: 0, samples,
      message: `DRY RUN — ${importable.length} товарів з SEO-таблиці можна імпортувати. Запустіть з apply=true.`,
    }
  }

  // Run targeted import for those SKUs
  const result = await syncProductsToCatalog(limit, { skuFilter: importable })

  return {
    ok: result.ok, applied: true, ...base,
    imported: result.inserted,
    errors: result.errors,
    samples: (result.samples ?? []).map((s) => ({ sku: s.sku, name: s.name })),
    message: `Імпортовано ${result.inserted} з ${importable.length} пріоритетних товарів з SEO-таблиці${result.errors > 0 ? `, помилок: ${result.errors}` : ''}`,
  }
}
