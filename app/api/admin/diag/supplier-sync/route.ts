export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getAdminClient } from '@/lib/supabase/admin'

// ─── Supplier sync + stock freshness diagnostic (CRON_SECRET) ─────────────────
// Answers the production question raised by supplier order 046064 (AT-0132 shown
// available locally, then unfulfilled): remaining_total=0 only means the catalog
// matches the LAST raw snapshot — it does not prove the snapshot is fresh. This
// reports the actual raw-cycle state + catalog stock freshness so an operator can
// tell whether checkout is safe.
//
//   curl -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3030/api/admin/diag/supplier-sync
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const client = getAdminClient()
  const staleHours = Number(process.env.SUPPLIER_STOCK_MAX_AGE_HOURS ?? '48')
  const staleCutoffIso = new Date(Date.now() - (Number.isFinite(staleHours) ? staleHours : 48) * 3600_000).toISOString()
  const now = Date.now()

  // Raw supplier product cycle cursor.
  const { data: stateRow } = await client
    .from('supplier_sync_state')
    .select('cycle_id, status, feed_total, processed, current_offset, next_offset, started_at, completed_at, updated_at')
    .eq('sync_type', 'products')
    .maybeSingle()

  const started = stateRow?.started_at ? Date.parse(stateRow.started_at as string) : null
  const completed = stateRow?.completed_at ? Date.parse(stateRow.completed_at as string) : null
  const lastCycleDurationS = started && completed && completed >= started ? Math.round((completed - started) / 1000) : null
  const lastFullCycleAgeH = completed ? Math.round(((now - completed) / 3600_000) * 10) / 10 : null

  // Catalog stock freshness: forwarded supplier rows (non-manual) whose stock is
  // older than the checkout freshness threshold (or never synced) — HEAD count.
  const staleCount = await client
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })
    .neq('source', 'manual')
    .not('supplier_sku', 'is', null)
    .or(`stock_synced_at.is.null,stock_synced_at.lt.${staleCutoffIso}`)
    .then((r) => r.count ?? 0, () => 0)

  // Sample stale SKUs (bounded).
  const { data: staleSample } = await client
    .from('catalog_products')
    .select('supplier_sku, stock_synced_at, is_in_stock')
    .neq('source', 'manual')
    .not('supplier_sku', 'is', null)
    .or(`stock_synced_at.is.null,stock_synced_at.lt.${staleCutoffIso}`)
    .limit(10)

  // Last catalog stock refresh: newest stock_synced_at across supplier rows.
  const { data: freshest } = await client
    .from('catalog_products')
    .select('stock_synced_at')
    .neq('source', 'manual')
    .not('stock_synced_at', 'is', null)
    .order('stock_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastStockRefreshIso = (freshest?.stock_synced_at as string | undefined) ?? null
  const lastStockRefreshAgeH = lastStockRefreshIso ? Math.round(((now - Date.parse(lastStockRefreshIso)) / 3600_000) * 10) / 10 : null

  // Checkout safety: a cycle completed within the threshold AND stock not stale.
  const cycleFresh = lastFullCycleAgeH != null && lastFullCycleAgeH <= (Number.isFinite(staleHours) ? staleHours : 48)
  const stockFresh = lastStockRefreshAgeH != null && lastStockRefreshAgeH <= (Number.isFinite(staleHours) ? staleHours : 48)
  const safeForCheckout = Boolean(cycleFresh && stockFresh)

  return Response.json({
    ok: true,
    stale_threshold_hours: staleHours,
    cycle: {
      cycle_id: stateRow?.cycle_id ?? null,
      status: stateRow?.status ?? 'unknown',
      feed_total: stateRow?.feed_total ?? null,
      processed: stateRow?.processed ?? null,
      current_offset: stateRow?.current_offset ?? null,
      next_offset: stateRow?.next_offset ?? null,
      last_full_cycle_completed_at: stateRow?.completed_at ?? null,
      last_full_cycle_age_hours: lastFullCycleAgeH,
      last_cycle_duration_seconds: lastCycleDurationS,
    },
    stock: {
      last_catalog_stock_refresh_at: lastStockRefreshIso,
      last_catalog_stock_refresh_age_hours: lastStockRefreshAgeH,
      stale_stock_rows: staleCount,
      sample_stale_skus: (staleSample ?? []).map((r) => ({ sku: r.supplier_sku, stock_synced_at: r.stock_synced_at, is_in_stock: r.is_in_stock })),
    },
    safe_for_checkout: safeForCheckout,
    note: 'remaining_total=0 proves catalog matches the last raw snapshot, NOT that the snapshot is fresh. safe_for_checkout requires a recent completed cycle AND recent stock refresh within stale_threshold_hours.',
    timestamp: new Date().toISOString(),
  })
}
