// ─── Supplier feed sync — durable resume cursor ───────────────────────────────
// supplier_sync_log is append-only run history; it cannot answer "where should
// the next scheduled invocation resume?". This module persists a one-row-per-
// sync_type cursor in supplier_sync_state so the daily cron continues the current
// cycle across invocations instead of always restarting at offset 0, and marks a
// cycle complete when the feed end is reached.
//
// The planning + progress logic is written as PURE functions so resume and
// completion are unit-testable without a database.

import { randomUUID } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSupabaseOk, type SupplierSyncState, type ResumePlan, type NextStateFields } from './sync-cycle'

// Re-export the pure cycle logic so existing importers keep the same entrypoint.
export {
  planResume, computeNextState, completedCycleWithin24h, finalizeFields, assertSupabaseOk,
  type SupplierSyncState, type ResumePlan, type NextStateFields,
  type SyncCycleStatus, type SyncRunResultLike,
} from './sync-cycle'

// ── DB helpers (thin; the pure logic lives in sync-cycle.ts) ──────────────────
// Every Supabase response error is surfaced via assertSupabaseOk — a load/save
// failure must never be silently swallowed (that would let a run silently
// restart at offset 0).
export async function loadSyncState(syncType: string): Promise<SupplierSyncState | null> {
  const client = getAdminClient()
  const { data, error } = await client
    .from('supplier_sync_state')
    .select('*')
    .eq('sync_type', syncType)
    .maybeSingle()
  assertSupabaseOk(error, `loadSyncState(${syncType})`)
  return (data as SupplierSyncState | null) ?? null
}

// Persist the cursor. Returns the offset that was persisted so the caller can
// echo it in diagnostics. Throws on any upsert error (caller decides how to
// report it) — never returns success on a failed write.
export async function saveSyncState(
  syncType: string,
  plan: ResumePlan,
  fields: NextStateFields,
): Promise<number | null> {
  const client = getAdminClient()
  const row: Record<string, unknown> = { sync_type: syncType, ...fields }
  // Resuming keeps the running cycle's id; a new cycle gets a fresh one (the
  // column default only fires on INSERT, so set it explicitly for UPDATE too).
  row.cycle_id = !plan.isNewCycle && plan.cycleId ? plan.cycleId : randomUUID()
  const { error } = await client.from('supplier_sync_state').upsert(row, { onConflict: 'sync_type' })
  assertSupabaseOk(error, `saveSyncState(${syncType})`)
  return fields.next_offset
}
