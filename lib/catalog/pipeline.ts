import { getAdminClient } from '@/lib/supabase/admin'
import { autoSlug } from '@/lib/catalog/csv-utils'
import { fetchSupplierCategoryMap } from '@/lib/supplier/sync'

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
  message: string
  // Populated on dry-run only
  wouldInsert?: number
  wouldUpdate?: number
  backlogImportable?: number
  samples?: Array<{ sku: string; name: string }>
}

export interface PublishResult {
  ok: boolean
  updated: number
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

    toInsert.push({
      supplier_category_id: supplierId,
      slug: autoSlug(displayName),
      name_ua: displayName,
      is_published: false,
      display_order: 0,
    })
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

  let inserted = 0
  const errors: string[] = []
  const CHUNK = 100

  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error } = await client
      .from('catalog_categories')
      .upsert(chunk, { onConflict: 'supplier_category_id', ignoreDuplicates: true })
    if (error) {
      for (const row of chunk) {
        const r = row as Record<string, unknown>
        const { error: e2 } = await client.from('catalog_categories').upsert(
          { ...r, slug: `${r.slug}-${Date.now()}` },
          { onConflict: 'supplier_category_id', ignoreDuplicates: true },
        )
        if (e2) errors.push(e2.message)
        else inserted++
      }
    } else {
      inserted += chunk.length
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
// mark is_approved=true. Returns wouldInsert/wouldUpdate/backlogImportable/samples.
export async function syncProductsToCatalog(
  limit: number,
  opts: { dryRun?: boolean } = {},
): Promise<SyncProductsResult> {
  const dryRun = opts.dryRun === true
  const client = getAdminClient()

  const { data: supplierProducts, error: fetchErr } = await client
    .from('supplier_products')
    .select('id, supplier_sku, name, name_ua, slug, supplier_category_id, price_uah, supplier_price_usd, main_image_url, images')
    .eq('is_approved', false)
    .not('name', 'is', null)
    .gt('price_uah', 0)
    .limit(limit)

  if (fetchErr || !supplierProducts) {
    return { ok: false, inserted: 0, updated: 0, skipped: 0, errors: 0, errorGroups: {}, message: fetchErr?.message ?? 'Failed to fetch supplier products' }
  }

  if (supplierProducts.length === 0) {
    return { ok: true, inserted: 0, updated: 0, skipped: 0, errors: 0, errorGroups: {}, message: 'Нових товарів для синхронізації немає' }
  }

  // Resolve category slug via supplier_category_id → catalog_categories.slug
  const catIds = [...new Set(supplierProducts.map((p) => p.supplier_category_id).filter(Boolean))]
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

  // Check which SKUs already exist in catalog_products
  const skus = supplierProducts.map((p) => p.supplier_sku as string)
  const [{ data: existingRows }, { data: allSlugs }] = await Promise.all([
    client.from('catalog_products').select('supplier_sku').in('supplier_sku', skus),
    client.from('catalog_products').select('slug'),
  ])
  const existingSkus = new Set((existingRows ?? []).map((r) => r.supplier_sku as string))
  // Track all slugs (existing + reserved in this batch) to prevent collisions
  const usedSlugs = new Set((allSlugs ?? []).map((r) => r.slug as string))

  const toInsert: Record<string, unknown>[] = []
  const toUpdatePrice: { sku: string; price_uah: number; main_image_url: string | null; images: unknown }[] = []

  for (const sp of supplierProducts) {
    const sku = sp.supplier_sku as string
    if (existingSkus.has(sku)) {
      // Already in catalog — update price and images from API only
      toUpdatePrice.push({
        sku,
        price_uah: sp.price_uah as number,
        main_image_url: sp.main_image_url as string | null,
        images: sp.images,
      })
      continue
    }
    const name = (sp.name_ua || sp.name || '') as string
    const categorySlug = sp.supplier_category_id ? (catSlugMap.get(sp.supplier_category_id) ?? null) : null

    // Collision-safe slug: try name → name+sku → sku alone (guaranteed unique since supplier_sku is unique)
    const candidateA = autoSlug(name)
    const candidateB = autoSlug(`${name} ${sku}`)
    const candidateC = autoSlug(sku) || sku.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const slug = !usedSlugs.has(candidateA) ? candidateA
      : !usedSlugs.has(candidateB) ? candidateB
      : candidateC
    usedSlugs.add(slug)

    const priceUah = sp.price_uah as number
    const isPriceSuspicious = priceUah < 100 && priceUah >= 10 && (sp.supplier_price_usd == null)

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
      message: `DRY RUN — додати ${toInsert.length}, оновити ${toUpdatePrice.length}. Черга: ${backlogImportable ?? '?'} готових`,
      wouldInsert: toInsert.length,
      wouldUpdate: toUpdatePrice.length,
      backlogImportable: backlogImportable ?? 0,
      samples,
    }
  }

  let inserted = 0, updated = 0
  const errors: string[] = []
  const CHUNK = 200

  // Insert new products
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const { error } = await client
      .from('catalog_products')
      .upsert(toInsert.slice(i, i + CHUNK), { onConflict: 'supplier_sku', ignoreDuplicates: true })
    if (error) errors.push(error.message)
    else inserted += Math.min(CHUNK, toInsert.length - i)
  }

  // Update prices for existing products (API data wins — never from sheet)
  for (const { sku, price_uah, main_image_url, images } of toUpdatePrice) {
    const { error } = await client
      .from('catalog_products')
      .update({ price_uah, main_image_url, images, updated_at: new Date().toISOString() })
      .eq('supplier_sku', sku)
    if (error) errors.push(error.message)
    else updated++
  }

  // Mark all processed supplier_products as approved (excludes from next batch)
  const processedIds = supplierProducts.map((p) => p.id as string)
  for (let i = 0; i < processedIds.length; i += 500) {
    await client
      .from('supplier_products')
      .update({ is_approved: true })
      .in('id', processedIds.slice(i, i + 500))
  }

  const errorGroups: Record<string, number> = {}
  for (const e of errors) errorGroups[e] = (errorGroups[e] ?? 0) + 1

  if (errors.length) {
    return { ok: false, inserted, updated, skipped: 0, errors: errors.length, errorGroups, message: `${errors.length} DB помилок: ${errors[0]}` }
  }
  return {
    ok: true, inserted, updated, skipped: 0, errors: 0, errorGroups: {},
    message: `Додано ${inserted} нових товарів, оновлено ціни у ${updated} існуючих`,
  }
}

// Step 7: Publish all unpublished catalog categories
export async function publishAllCatalogCategories(): Promise<PublishResult> {
  const client = getAdminClient()
  const { data, error } = await client
    .from('catalog_categories')
    .update({ is_published: true })
    .eq('is_published', false)
    .select('id')
  if (error) return { ok: false, updated: 0, message: error.message }
  return { ok: true, updated: data?.length ?? 0, message: `Опубліковано ${data?.length ?? 0} категорій` }
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

// Repair category names using the REAL supplier feed (YML/XML <categories> block)
// as the deterministic source of truth, with supplier_products.raw_data as a
// fallback. Propagates names to supplier_categories + catalog_categories.
// Idempotent — only overwrites null/empty/numeric names, never human-readable ones.
export async function repairCategoryNamesFromProducts(): Promise<RepairCategoryNamesResult> {
  const client = getAdminClient()
  const PAGE = 1000

  // 0. Deterministic id→name map straight from the supplier feed (YML/XML).
  let ymlMap = new Map<string, string>()
  let nameSource = 'none'
  try {
    const res = await fetchSupplierCategoryMap()
    ymlMap = res.map
    nameSource = res.source
  } catch { /* feed unavailable — fall back to raw_data sampling below */ }

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
  // Load ALL rows (paginated) so the slug set below is complete.
  const catRows = await selectAllRows<{ id: string; supplier_category_id: string | null; name_ua: string | null; slug: string | null }>((f, t) =>
    client.from('catalog_categories').select('id, supplier_category_id, name_ua, slug').order('id', { ascending: true }).range(f, t))
  const numericCatRows = catRows.filter((r) => /^\d+$/.test(String(r.name_ua ?? '')))

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
  catalogTotal: number
  catalogMissingImage: number
  eligible: number              // missing-image catalog rows whose supplier has an image
  updated: number               // rows actually written (0 on dry run)
  errors: number
  samples: { sku: string; supplier_image: string }[]
  message: string
}

export async function backfillCatalogImages(
  opts: { apply?: boolean; limit?: number } = {},
): Promise<BackfillImagesResult> {
  const apply = opts.apply === true
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 100000
  const client = getAdminClient()

  const { count: catalogTotal } = await client
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })

  // Catalog rows missing a primary image — candidates for backfill.
  const missing = await selectAllRows<{ id: string; supplier_sku: string }>(
    (from, to) =>
      client
        .from('catalog_products')
        .select('id, supplier_sku')
        .is('main_image_url', null)
        .not('supplier_sku', 'is', null)
        .order('supplier_sku', { ascending: true })
        .range(from, to),
  )
  const candidates = missing.slice(0, limit)

  if (candidates.length === 0) {
    return {
      ok: true, applied: apply, catalogTotal: catalogTotal ?? 0,
      catalogMissingImage: 0, eligible: 0, updated: 0, errors: 0, samples: [],
      message: 'Усі товари каталогу вже мають зображення (або немає кандидатів).',
    }
  }

  // Resolve supplier images for those SKUs, in chunks, keeping only rows where
  // the supplier actually has a main_image_url.
  const supplierImg = new Map<string, { main: string; images: unknown }>()
  const skus = candidates.map((c) => c.supplier_sku)
  for (let i = 0; i < skus.length; i += 300) {
    const { data } = await client
      .from('supplier_products')
      .select('supplier_sku, main_image_url, images')
      .in('supplier_sku', skus.slice(i, i + 300))
      .not('main_image_url', 'is', null)
    for (const r of data ?? []) {
      const sku = r.supplier_sku as string
      const main = r.main_image_url as string | null
      if (sku && main) supplierImg.set(sku, { main, images: r.images })
    }
  }

  const eligible = candidates.filter((c) => supplierImg.has(c.supplier_sku))
  const samples = eligible.slice(0, 10).map((c) => ({
    sku: c.supplier_sku,
    supplier_image: supplierImg.get(c.supplier_sku)!.main,
  }))

  if (!apply) {
    return {
      ok: true, applied: false, catalogTotal: catalogTotal ?? 0,
      catalogMissingImage: missing.length, eligible: eligible.length,
      updated: 0, errors: 0, samples,
      message: `DRY RUN — ${eligible.length} з ${missing.length} товарів без зображення можна заповнити з supplier_products. Запустіть з apply=true, щоб застосувати.`,
    }
  }

  // APPLY — write image columns only, one SKU at a time so a single bad row
  // never aborts the whole backfill.
  let updated = 0, errors = 0
  for (const c of eligible) {
    const img = supplierImg.get(c.supplier_sku)!
    const { error } = await client
      .from('catalog_products')
      .update({ main_image_url: img.main, images: img.images, updated_at: new Date().toISOString() })
      .eq('id', c.id)
      .is('main_image_url', null) // never overwrite an image already set
    if (error) errors++
    else updated++
  }

  return {
    ok: errors === 0, applied: true, catalogTotal: catalogTotal ?? 0,
    catalogMissingImage: missing.length, eligible: eligible.length,
    updated, errors, samples,
    message: `Заповнено зображення для ${updated} товарів${errors > 0 ? `, помилок: ${errors}` : ''}.`,
  }
}
