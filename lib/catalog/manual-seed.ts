import { getAdminClient } from '@/lib/supabase/admin'
import { MANUAL_CATEGORIES, MANUAL_PRODUCTS } from '@/lib/catalog/manual-catalog-data'

// A fully plain, serializable error record. No raw Error or Supabase response
// object ever crosses a Server Component / route boundary — only these fields do.
export interface ManualSeedError {
  scope: string
  slug?: string
  code?: string
  message: string
  details?: string
  hint?: string
}

// The canonical serializable result. Every field is a primitive/array of plain
// objects, so JSON-serializing it (route response, or a client fetch) can never
// throw and can never surface the generic "Server Components render" error.
export interface ManualSeedResult {
  ok: boolean
  createdCategories: number
  updatedCategories: number
  createdProducts: number
  updatedProducts: number
  visibleProductsPath: string
  errors?: ManualSeedError[]
}

type AdminClient = ReturnType<typeof getAdminClient>

// Convert ANY error (Supabase PostgrestError, thrown Error, string) into a plain
// ManualSeedError with a friendly Ukrainian hint. Supabase errors already expose
// { code, message, details, hint }; we copy those and add a hint when we can map
// the code to an actionable migration step.
function toSeedError(scope: string, slug: string | undefined, e: unknown): ManualSeedError {
  const err = e as { code?: string; message?: string; details?: string | null; hint?: string | null } | null | undefined
  const code = err?.code
  const message =
    (err?.message ?? (e instanceof Error ? e.message : String(e ?? ''))).trim() || 'Невідома помилка'
  const details = err?.details != null ? String(err.details) : undefined
  let hint = err?.hint != null ? String(err.hint) : undefined
  if (!hint) {
    if (code === '42703' || /column .* does not exist/i.test(message)) {
      hint = 'Застосуйте міграції 051–055 у Supabase → SQL editor, після чого повторіть.'
    } else if (code === '42P01' || /relation .* does not exist/i.test(message)) {
      hint = 'Застосуйте міграції каталогу (048–055).'
    } else if (code === '42P10') {
      hint = 'Застосуйте міграцію 052_pipeline_safety.sql.'
    }
  }
  return { scope, slug, code, message, details, hint }
}

// Idempotent upsert keyed by `slug` WITHOUT a Postgres ON CONFLICT target. The
// original code used `.upsert(..., { onConflict: 'slug' })`, which requires a
// UNIQUE index on slug that may not exist (it is created only by migration 052,
// and only when there are no duplicate slugs). On production that failed hard with
// PostgREST 42P10 — which, combined with a non-serializable value crossing the RSC
// boundary, produced the opaque "An error occurred in the Server Components
// render" 500 on the pipeline route. Select-then-update/insert avoids the index
// entirely; the lookup is scoped to source='manual' so a manual slug can never
// overwrite a supplier row. Per-row errors are collected (never thrown) so one bad
// row does not abort the rest.
async function upsertRows(
  client: AdminClient,
  table: 'catalog_categories' | 'catalog_products',
  rows: Array<Record<string, unknown>>,
  scope: string,
): Promise<{ created: number; updated: number; errors: ManualSeedError[] }> {
  const errors: ManualSeedError[] = []
  let created = 0
  let updated = 0

  const slugs = rows.map((r) => r.slug as string)
  const { data: existing, error: selErr } = await client
    .from(table)
    .select('id, slug')
    .eq('source', 'manual')
    .in('slug', slugs)
  if (selErr) {
    errors.push(toSeedError(scope, undefined, selErr))
    return { created, updated, errors }
  }

  const idBySlug = new Map((existing ?? []).map((r) => [r.slug as string, r.id as string]))
  for (const row of rows) {
    const slug = row.slug as string
    const id = idBySlug.get(slug)
    if (id) {
      const { error } = await client.from(table).update(row).eq('id', id)
      if (error) errors.push(toSeedError(scope, slug, error))
      else updated++
    } else {
      const { error } = await client.from(table).insert(row)
      if (error) errors.push(toSeedError(scope, slug, error))
      else created++
    }
  }
  return { created, updated, errors }
}

// Probe every column the seed actually writes (not just a subset). A partially
// migrated DB — e.g. the manual-catalog columns from 051 exist but the
// shop-structure columns (product_group, sort_order) from 055 do not — would
// otherwise pass a narrow precheck and then fail mid-write with a cryptic error.
async function missingColumns(client: AdminClient): Promise<ManualSeedError | null> {
  const [{ error: prodProbe }, { error: catProbe }] = await Promise.all([
    client
      .from('catalog_products')
      .select('source, options, inquiry_only, lead_type, price_prefix, unit_label, product_group, sort_order', { head: true })
      .limit(1),
    client
      .from('catalog_categories')
      .select('source, lead_type, sort_order, meta_auto_generated', { head: true })
      .limit(1),
  ])
  const hit = (e: unknown) => ((e as { code?: string } | null)?.code === '42703' ? e : null)
  const bad = hit(prodProbe) ?? hit(catProbe)
  return bad ? toSeedError('schema', undefined, bad) : null
}

const EMPTY: ManualSeedResult = {
  ok: false,
  createdCategories: 0,
  updatedCategories: 0,
  createdProducts: 0,
  updatedProducts: 0,
  visibleProductsPath: '/products',
}

// Idempotently create/update the manual catalog categories and products. NEVER
// throws and ALWAYS returns a plain ManualSeedResult — safe to JSON-serialize into
// a route response or a client fetch. Re-running never duplicates (upsert by slug).
export async function seedManualCatalog(): Promise<ManualSeedResult> {
  try {
    const client = getAdminClient()

    const schemaError = await missingColumns(client)
    if (schemaError) return { ...EMPTY, errors: [schemaError] }

    // ── Categories ──────────────────────────────────────────────────────────
    const categoryRows = MANUAL_CATEGORIES.map((c) => ({
      supplier_category_id: null,
      slug: c.slug,
      name_ua: c.name_ua,
      description: c.description,
      meta_title: c.meta_title,
      meta_description: c.meta_description,
      is_published: c.is_published,
      display_order: c.display_order,
      sort_order: c.sort_order,
      source: 'manual',
      lead_type: c.lead_type,
      meta_auto_generated: false,
    }))
    const cat = await upsertRows(client, 'catalog_categories', categoryRows, 'categories')

    // ── Products ────────────────────────────────────────────────────────────
    const productRows = MANUAL_PRODUCTS.map((p) => ({
      supplier_product_id: null,
      supplier_sku: null,
      name_ua: p.name_ua,
      slug: p.slug,
      category_slug: p.category_slug,
      short_description: p.short_description,
      description: p.description,
      price_uah: p.price_uah,
      compare_price_uah: null,
      main_image_url: null,
      images: null,
      attributes: null,
      status: 'published',
      is_featured: false,
      is_price_suspicious: false,
      display_order: p.display_order,
      meta_title: p.meta_title,
      meta_description: p.meta_description,
      source: 'manual',
      price_prefix: p.price_prefix,
      unit_label: p.unit_label,
      inquiry_only: p.inquiry_only,
      lead_type: p.lead_type,
      options: p.options,
      sort_order: p.display_order,
      product_group: p.lead_type === 'metal' ? 'metal' : 'natural',
    }))
    const prod = await upsertRows(client, 'catalog_products', productRows, 'products')

    const errors = [...cat.errors, ...prod.errors]
    return {
      ok: errors.length === 0,
      createdCategories: cat.created,
      updatedCategories: cat.updated,
      createdProducts: prod.created,
      updatedProducts: prod.updated,
      visibleProductsPath: '/products',
      errors: errors.length ? errors : undefined,
    }
  } catch (e) {
    return { ...EMPTY, errors: [toSeedError('seed', undefined, e)] }
  }
}
