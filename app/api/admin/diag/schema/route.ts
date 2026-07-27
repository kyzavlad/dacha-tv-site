export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'

// ─── Live schema proof for the category name sources (CRON_SECRET) ────────────
// Proves, against the RUNNING production database, which columns actually exist
// before any code depends on them. `catalog_categories.name` is reported but
// NEVER read by the storefront: no production code path selects it, so the
// category localization deliberately uses only the proven sources below.
//
//   curl -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3030/api/admin/diag/schema
const PROBES: Array<{ table: string; columns: string[] }> = [
  { table: 'catalog_categories', columns: ['id', 'slug', 'name_ua', 'name', 'h1', 'description', 'description_ua', 'meta_title', 'meta_description', 'seo_title', 'seo_description', 'seo_keywords', 'seo_status', 'seo_manual_lock', 'source', 'supplier_category_id', 'is_published'] },
  { table: 'supplier_categories', columns: ['id', 'supplier_id', 'name', 'name_ua'] },
  { table: 'catalog_category_translations', columns: ['category_id', 'locale', 'h1', 'meta_title', 'meta_description', 'description', 'seo_status', 'seo_manual_lock'] },
]

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const client = getAdminClient()
  const result: Record<string, Record<string, boolean>> = {}
  const errors: string[] = []

  // Probes run concurrently: ~29 serial round-trips would multiply any single
  // request timeout by the column count and hang the whole diagnostic.
  await Promise.all(
    PROBES.map(async ({ table, columns }) => {
      const columnResults: Record<string, boolean> = {}
      await Promise.all(
        columns.map(async (column) => {
          // limit(0) transfers no rows; an unknown column fails with PostgREST 42703.
          const { error } = await client.from(table).select(column).limit(0)
          columnResults[column] = !error
          if (error && (error as { code?: string }).code !== '42703') {
            errors.push(`${table}.${column}: ${error.message}`)
          }
        }),
      )
      result[table] = columnResults
    }),
  )

  const cc = result['catalog_categories'] ?? {}
  return Response.json({
    ok: true,
    columns: result,
    // The explicit answer the category fix depends on.
    verdict: {
      catalog_categories_name_exists: cc.name === true,
      storefront_reads_catalog_categories_name: false,
      ukrainian_name_sources_used: [
        'catalog_categories.name_ua',
        'catalog_categories.h1',
        'catalog_category_translations(locale=uk).h1/meta_title',
        'catalog_category_translations(locale=ru).h1/meta_title',
        'supplier_categories.name_ua',
        'supplier_categories.name',
        'curated exact mappings (lib/catalog/uk-category-name.ts)',
      ],
    },
    errors,
    timestamp: new Date().toISOString(),
  })
}
