import { getAdminClient } from '@/lib/supabase/admin'
import { loadSyncState } from '@/lib/supplier/sync-state'

// Compact supplier→catalog diagnostics for the admin dashboard. Resource-safe:
// HEAD counts and single-row, selected-column reads only — it NEVER pulls the
// supplier or catalog tables into memory. Replaces the old "download 50 pending
// supplier rows and call their length the count" approval panel.

export interface LastRun {
  at: string | null
  status: string | null
}

export interface SupplierImportDiagnostics {
  // Supplier rows not yet promoted into catalog_products (is_approved = false).
  newSupplierProducts: number
  // Of those, how many are actually importable (named + priced).
  importable: number
  lastSupplierSync: LastRun    // supplier feed sync (sync_type = 'products')
  lastCatalogImport: LastRun   // supplier→catalog import (sync_type = 'import_batch')
  recentErrors: number
  // Honest feed-cycle progress (Part D). We report facts — status, last completed
  // cycle, current progress, next resume offset, last error — and never claim a
  // full refresh is guaranteed within 24h (the once-daily schedule does not prove
  // it; see the route/report for the real cadence math).
  cycle: {
    status: string | null
    lastCompletedAt: string | null
    processed: number
    feedTotal: number
    nextOffset: number | null
    lastError: string | null
  }
  available: boolean
}

async function lastLog(
  client: ReturnType<typeof getAdminClient>,
  syncType: string,
): Promise<{ run: LastRun; errors: number; errorMessage: string | null }> {
  const { data } = await client
    .from('supplier_sync_log')
    .select('status, completed_at, started_at, products_errors, error_details')
    .eq('sync_type', syncType)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const details = data?.error_details as { message?: unknown } | null
  const errorMessage = data?.status === 'failed' && details?.message ? String(details.message).slice(0, 200) : null
  return {
    run: { at: data?.completed_at ?? data?.started_at ?? null, status: data?.status ?? null },
    errors: (data?.products_errors as number | null) ?? 0,
    errorMessage,
  }
}

export async function getSupplierImportDiagnostics(): Promise<SupplierImportDiagnostics> {
  const empty: SupplierImportDiagnostics = {
    newSupplierProducts: 0,
    importable: 0,
    lastSupplierSync: { at: null, status: null },
    lastCatalogImport: { at: null, status: null },
    recentErrors: 0,
    cycle: { status: null, lastCompletedAt: null, processed: 0, feedTotal: 0, nextOffset: null, lastError: null },
    available: false,
  }
  try {
    const client = getAdminClient()
    const [newHead, importableHead, supplierRun, importRun, state] = await Promise.all([
      client.from('supplier_products').select('id', { count: 'exact', head: true }).eq('is_approved', false),
      client.from('supplier_products').select('id', { count: 'exact', head: true })
        .eq('is_approved', false).not('name', 'is', null).gt('price_uah', 0),
      lastLog(client, 'products'),
      lastLog(client, 'import_batch'),
      loadSyncState('products').catch(() => null),
    ])
    return {
      newSupplierProducts: newHead.count ?? 0,
      importable: importableHead.count ?? 0,
      lastSupplierSync: supplierRun.run,
      lastCatalogImport: importRun.run,
      recentErrors: supplierRun.errors + importRun.errors,
      cycle: {
        status: state?.status ?? null,
        lastCompletedAt: state?.completed_at ?? null,
        processed: state?.processed ?? 0,
        feedTotal: state?.feed_total ?? 0,
        nextOffset: state?.next_offset ?? null,
        lastError: supplierRun.errorMessage,
      },
      available: true,
    }
  } catch {
    return empty
  }
}
