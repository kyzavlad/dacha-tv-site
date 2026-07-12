import { getAdminClient } from '@/lib/supabase/admin'
import { MANUAL_CATEGORIES, MANUAL_PRODUCTS } from '@/lib/catalog/manual-catalog-data'

export interface ManualSeedResult {
  ok: boolean
  categoriesUpserted: number
  productsUpserted: number
  message: string
}

type AdminClient = ReturnType<typeof getAdminClient>

// Turn a Supabase/PostgREST error into a clear, admin-friendly Ukrainian message.
// Raw codes / stack traces never reach the seed card — the owner sees an action.
function friendlyDbError(context: string, e: unknown): string {
  const err = e as { code?: string; message?: string } | null | undefined
  const code = err?.code
  const raw = (err?.message ?? (e instanceof Error ? e.message : String(e ?? ''))).trim()
  if (code === '42703' || /column .* does not exist/i.test(raw)) {
    return `${context}: у базі бракує колонки ручного каталогу — застосуйте міграції 051–055 у Supabase → SQL editor.`
  }
  if (code === '42P01' || /relation .* does not exist/i.test(raw)) {
    return `${context}: таблиця каталогу не існує — застосуйте міграції каталогу (048–055).`
  }
  if (code === '42P10') {
    return `${context}: конфлікт унікального індексу — застосуйте міграцію 052_pipeline_safety.sql.`
  }
  return `${context}: ${raw || 'невідома помилка бази даних'}`
}

// Idempotent upsert keyed by `slug` WITHOUT relying on a Postgres ON CONFLICT
// target. The original implementation used `.upsert(..., { onConflict: 'slug' })`,
// which requires a UNIQUE index on slug. That index never existed before migration
// 052, and 052 only creates it when no duplicate slugs are present — so on a
// production catalog full of slug collisions the upsert failed hard with PostgREST
// 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
// specification"). Combined with a non-serializable value crossing the RSC
// boundary, that surfaced in the admin UI as the opaque "An error occurred in the
// Server Components render…" message inside the manual-seed card.
//
// Select-then-update/insert works regardless of whether the unique index exists.
// Crucially the existing-row lookup is scoped to `source = 'manual'`, so a manual
// slug that happens to collide with a supplier product's slug can never cause this
// seed to overwrite (and mis-tag) a supplier row. The manual set is tiny
// (~4 categories + ~30 products) so the per-row writes are cheap.
async function upsertBySlug(
  client: AdminClient,
  table: 'catalog_categories' | 'catalog_products',
  rows: Array<Record<string, unknown>>,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const slugs = rows.map((r) => r.slug as string)
  const { data: existing, error: selErr } = await client
    .from(table)
    .select('id, slug')
    .eq('source', 'manual')
    .in('slug', slugs)
  if (selErr) return { ok: false, count: 0, error: friendlyDbError('Читання', selErr) }

  const idBySlug = new Map((existing ?? []).map((r) => [r.slug as string, r.id as string]))
  let count = 0
  for (const row of rows) {
    const id = idBySlug.get(row.slug as string)
    if (id) {
      const { error } = await client.from(table).update(row).eq('id', id)
      if (error) return { ok: false, count, error: friendlyDbError('Оновлення', error) }
    } else {
      const { error } = await client.from(table).insert(row)
      if (error) return { ok: false, count, error: friendlyDbError('Вставка', error) }
    }
    count++
  }
  return { ok: true, count }
}

// Probe every column the seed actually writes (not just a subset). A partially
// migrated DB — e.g. the manual-catalog columns from 051 exist but the
// shop-structure columns (product_group, sort_order) from 055 do not — would
// otherwise pass a narrow precheck and then fail mid-write with a cryptic error.
async function missingColumns(client: AdminClient): Promise<boolean> {
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
  const missing = (e: unknown) => (e as { code?: string } | null)?.code === '42703'
  return missing(prodProbe) || missing(catProbe)
}

// Idempotently create/update the manual catalog categories and products. Never
// throws: any failure is returned as { ok: false, message } so the calling server
// action (and the admin card) render a clear message instead of crashing.
export async function seedManualCatalog(): Promise<ManualSeedResult> {
  try {
    const client = getAdminClient()

    if (await missingColumns(client)) {
      return {
        ok: false,
        categoriesUpserted: 0,
        productsUpserted: 0,
        message:
          'Відсутні колонки ручного каталогу — застосуйте міграції 051–055 у Supabase → SQL editor, після чого повторіть.',
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
      return { ok: false, categoriesUpserted: 0, productsUpserted: 0, message: `Категорії — ${catResult.error}` }
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
        message: `Товари — ${prodResult.error}`,
      }
    }

    return {
      ok: true,
      categoriesUpserted: catResult.count,
      productsUpserted: prodResult.count,
      message: `Створено/оновлено ${catResult.count} категорій та ${prodResult.count} товарів ручного каталогу`,
    }
  } catch (e) {
    return {
      ok: false,
      categoriesUpserted: 0,
      productsUpserted: 0,
      message: friendlyDbError('Ручний каталог', e),
    }
  }
}
