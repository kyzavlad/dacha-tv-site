export const dynamic = 'force-dynamic'

import { type SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'

// ─── Protected lightweight catalog snapshot ───────────────────────────────────
// A SMALL, field-limited dump of catalog_products for a quick restore reference.
// Not a full backup — only the columns needed to identify/re-key a product.
// Protected by CRON_SECRET. Never reveals secrets.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://<site>/api/admin/backup/catalog-snapshot?limit=5000" -o catalog-snapshot.json

const PAGE_SIZE = 1000
const DEFAULT_LIMIT = 5000
const MAX_LIMIT = 20_000

// Only lightweight identity/SEO fields. `price` is aliased from price_uah so the
// export key stays stable regardless of the underlying column name.
const SNAPSHOT_FIELDS =
  'id, supplier_sku, slug, name_ua, category_slug, price:price_uah, status, main_image_url, meta_title, meta_description, updated_at'

function parseLimit(req: Request): number {
  const raw = new URL(req.url).searchParams.get('limit')
  const n = raw ? parseInt(raw, 10) : DEFAULT_LIMIT
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

async function snapshot(client: SupabaseClient, limit: number): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < limit; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, limit) - 1
    const { data, error } = await client
      .from('catalog_products')
      .select(SNAPSHOT_FIELDS)
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const limit = parseLimit(req)

  let client: SupabaseClient
  try {
    client = getAdminClient()
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Supabase admin client unavailable' },
      { status: 500 },
    )
  }

  let rows: Record<string, unknown>[]
  try {
    rows = await snapshot(client, limit)
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  const exportedAt = new Date().toISOString()
  const body = {
    project: 'dacha-tv-site',
    exportedAt,
    limit,
    count: rows.length,
    data: rows,
  }

  const filename = `catalog-snapshot-${exportedAt.slice(0, 10)}.json`
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
