import { getAdminClient } from '@/lib/supabase/admin'
import { MANUAL_CATEGORIES, MANUAL_PRODUCTS } from '@/lib/catalog/manual-catalog-data'

export interface ManualSeedResult {
  ok: boolean
  categoriesUpserted: number
  productsUpserted: number
  message: string
}

type AdminClient = ReturnType<typeof getAdminClient>

// Idempotent upsert keyed by `slug` WITHOUT relying on a Postgres ON CONFLICT
// target. The previous implementation used `.upsert(..., { onConflict: 'slug' })`,
// which requires a UNIQUE index on slug. That index never existed before
// migration 052, and 052 only creates it when no duplicate slugs are present —
// so on a production catalog full of slug collisions the upsert failed hard with
// PostgREST 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
// specification"), which is what surfaced as the manual-seed card error.
//
// Select-then-update/insert works regardless of whether the unique index exists,
// and the manual set is tiny (~3 categories + ~25 products) so the per-row writes
// are cheap. Manual rows carry source='manual' + supplier_sku=NULL, so supplier
// sync / pipeline promotion (which match on supplier_sku) never touch them.
async function upsertBySlug(
  client: AdminClient,
  table: 'catalog_categories' | 'catalog_products',
  rows: Array<Record<string, unknown>>,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const slugs = rows.map((r) => r.slug as string)
  const { data: existing, error: selErr } = await client.from(table).select('id, slug').in('slug', slugs)
  if (selErr) return { ok: false, count: 0, error: selErr.message }

  const idBySlug = new Map((existing ?? []).map((r) => [r.slug as string, r.id as string]))
  let count = 0
  for (const row of rows) {
    const id = idBySlug.get(row.slug as string)
    if (id) {
      const { error } = await client.from(table).update(row).eq('id', id)
      if (error) return { ok: false, count, error: error.message }
    } else {
      const { error } = await client.from(table).insert(row)
      if (error) return { ok: false, count, error: error.message }
    }
    count++
  }
  return { ok: true, count }
}

// Idempotently create/update the manual catalog categories and products.
export async function seedManualCatalog(): Promise<ManualSeedResult> {
  const client = getAdminClient()

  // Precheck: the manual-catalog columns must exist or the writes below fail with
  // a cryptic PostgREST error. Surface an actionable message instead.
  const [{ error: prodProbe }, { error: catProbe }] = await Promise.all([
    client.from('catalog_products').select('source, options, inquiry_only, lead_type, price_prefix, unit_label', { head: true }).limit(1),
    client.from('catalog_categories').select('source, lead_type', { head: true }).limit(1),
  ])
  const missingCol = (e: unknown) => (e as { code?: string } | null)?.code === '42703'
  if (missingCol(prodProbe) || missingCol(catProbe)) {
    return {
      ok: false,
      categoriesUpserted: 0,
      productsUpserted: 0,
      message: 'Відсутні колонки ручного каталогу — застосуйте міграції 051_manual_catalog.sql, 052_pipeline_safety.sql та 053_catalog_dedupe.sql у Supabase SQL editor.',
    }
  }

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

  const catResult = await upsertBySlug(client, 'catalog_categories', categoryRows)
  if (!catResult.ok) {
    return { ok: false, categoriesUpserted: 0, productsUpserted: 0, message: `Категорії: ${catResult.error}` }
  }

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

  const prodResult = await upsertBySlug(client, 'catalog_products', productRows)
  if (!prodResult.ok) {
    return {
      ok: false,
      categoriesUpserted: catResult.count,
      productsUpserted: 0,
      message: `Товари: ${prodResult.error}`,
    }
  }

  return {
    ok: true,
    categoriesUpserted: catResult.count,
    productsUpserted: prodResult.count,
    message: `Створено/оновлено ${catResult.count} категорій та ${prodResult.count} товарів ручного каталогу`,
  }
}
