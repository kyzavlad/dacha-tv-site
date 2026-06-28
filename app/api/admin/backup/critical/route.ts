export const dynamic = 'force-dynamic'

import { type SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'

// ─── Protected critical-data backup ───────────────────────────────────────────
// Exports ONLY critical operational/business tables as downloadable JSON. The
// large catalog feeds (supplier_products, full catalog_products) are excluded by
// design — use the catalog-snapshot endpoint for a lightweight catalog dump.
// Protected by CRON_SECRET. Never reveals secrets.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://<site>/api/admin/backup/critical -o critical-backup.json

const PAGE_SIZE = 1000
const MAX_ROWS = 20_000

// Tables to export. `alternatives` lets a logical table resolve to whichever
// physical name exists (settings vs site_settings) without failing.
const CRITICAL_TABLES: { key: string; names: string[] }[] = [
  { key: 'bookings', names: ['bookings'] },
  { key: 'inquiries', names: ['inquiries'] },
  { key: 'services', names: ['services'] },
  { key: 'catalog_categories', names: ['catalog_categories'] },
  { key: 'orders', names: ['orders'] },
  { key: 'settings', names: ['site_settings', 'settings'] },
]

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const msg = (error.message ?? '').toLowerCase()
  return error.code === '42P01' || (msg.includes('does not exist') && msg.includes('relation')) || msg.includes('could not find the table')
}

// Page through one table up to MAX_ROWS. Returns rows + whether the table was
// missing. Throws only on a genuine (non-missing) error so the caller can record
// it without aborting the whole backup.
async function exportTable(
  client: SupabaseClient,
  name: string,
): Promise<{ rows: Record<string, unknown>[]; missing: boolean }> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, MAX_ROWS) - 1
    const { data, error } = await client.from(name).select('*').range(from, to)
    if (error) {
      if (isMissingTable(error)) return { rows: [], missing: true }
      throw new Error(error.message)
    }
    if (!data || data.length === 0) break
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE_SIZE) break
  }
  return { rows, missing: false }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  let client: SupabaseClient
  try {
    client = getAdminClient()
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Supabase admin client unavailable' },
      { status: 500 },
    )
  }

  const data: Record<string, Record<string, unknown>[]> = {}
  const counts: Record<string, number> = {}
  const missingTables: string[] = []
  const errors: string[] = []

  for (const { key, names } of CRITICAL_TABLES) {
    let resolved = false
    for (const name of names) {
      try {
        const { rows, missing } = await exportTable(client, name)
        if (missing) continue // try the next alternative name
        data[key] = rows
        counts[key] = rows.length
        resolved = true
        break
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
        resolved = true // a real error — don't also mark as missing
        break
      }
    }
    if (!resolved) missingTables.push(key)
  }

  const body = {
    project: 'dacha-tv-site',
    exportedAt: new Date().toISOString(),
    counts,
    missingTables,
    errors,
    data,
  }

  const filename = `critical-backup-${body.exportedAt.slice(0, 10)}.json`
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
