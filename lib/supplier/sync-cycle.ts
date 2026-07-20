// ─── Supplier feed sync — PURE cycle logic ────────────────────────────────────
// No imports (no DB, no env) so resume + completion are unit-testable. The DB
// wiring lives in sync-state.ts, which re-exports everything here.

export type SyncCycleStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface SupplierSyncState {
  sync_type: string
  cycle_id: string
  status: SyncCycleStatus
  feed_total: number
  processed: number
  inserted: number
  updated: number
  errors: number
  current_offset: number
  next_offset: number | null
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

export interface ResumePlan {
  offset: number
  cycleId: string | null // null → let the DB default a fresh cycle_id
  isNewCycle: boolean
}

// Decide where an AUTOMATIC (no-offset) invocation should start.
//   • An UNFINISHED cycle — 'running' OR 'failed' — that still has a safe resume
//     offset (next_offset > 0) resumes from it. A transient failure must NOT
//     throw away progress and restart the whole 112k feed at 0.
//   • Otherwise (no state / idle / completed / no safe offset) start a fresh
//     cycle at offset 0. A completed cycle begins its successor on the next run.
export function planResume(state: SupplierSyncState | null): ResumePlan {
  const unfinished = state != null && (state.status === 'running' || state.status === 'failed')
  const hasSafeOffset = state?.next_offset != null && state.next_offset > 0
  if (unfinished && hasSafeOffset) {
    return { offset: state!.next_offset as number, cycleId: state!.cycle_id, isNewCycle: false }
  }
  return { offset: 0, cycleId: null, isNewCycle: true }
}

export interface SyncRunResultLike {
  totalInFeed?: number | null
  processed?: number
  synced?: number
  inserted?: number | null
  updated?: number | null
  errors?: number
  nextOffset?: number | null
  done?: boolean | null
  ok?: boolean
}

export interface NextStateFields {
  status: SyncCycleStatus
  feed_total: number
  processed: number
  inserted: number
  updated: number
  errors: number
  current_offset: number
  next_offset: number | null
  started_at: string
  completed_at: string | null
}

// Fold one invocation's result into the cycle's cumulative state. Counters reset
// on a new cycle and accumulate across the windows of an ongoing cycle.
export function computeNextState(args: {
  prev: SupplierSyncState | null
  isNewCycle: boolean
  offset: number
  result: SyncRunResultLike
  nowIso: string
}): NextStateFields {
  const { prev, isNewCycle, offset, result, nowIso } = args
  const base = isNewCycle
    ? { processed: 0, inserted: 0, updated: 0, errors: 0 }
    : {
        processed: prev?.processed ?? 0,
        inserted: prev?.inserted ?? 0,
        updated: prev?.updated ?? 0,
        errors: prev?.errors ?? 0,
      }
  const processedThisRun = result.processed ?? result.synced ?? 0
  const done = result.done === true
  return {
    status: done ? 'completed' : 'running',
    feed_total: result.totalInFeed ?? prev?.feed_total ?? 0,
    processed: base.processed + processedThisRun,
    inserted: base.inserted + (result.inserted ?? 0),
    updated: base.updated + (result.updated ?? 0),
    errors: base.errors + (result.errors ?? 0),
    current_offset: offset,
    next_offset: done ? null : (result.nextOffset ?? null),
    started_at: isNewCycle ? nowIso : (prev?.started_at ?? nowIso),
    completed_at: done ? nowIso : (prev?.completed_at ?? null),
  }
}

// A complete feed cycle finished within the last 24h? A factual helper (used for
// display), NOT a guarantee — the once-daily schedule does not prove daily
// completion, so callers must not present this as a health guarantee.
export function completedCycleWithin24h(state: SupplierSyncState | null, nowMs: number): boolean {
  if (!state || state.status !== 'completed' || !state.completed_at) return false
  const done = Date.parse(state.completed_at)
  return Number.isFinite(done) && nowMs - done <= 24 * 60 * 60 * 1000
}

// Surface a Supabase response error instead of swallowing it. State load/save
// failures MUST throw so a run never silently restarts at offset 0.
export function assertSupabaseOk(error: { message?: string } | null | undefined, context: string): void {
  if (error) throw new Error(`${context}: ${error.message ?? 'unknown error'}`)
}

// Finalize the persisted state given the run outcome. On failure the cycle is
// marked 'failed' but KEEPS a safe resume offset (its own next_offset, else the
// previous cursor, else where this run started) so the next scheduled run
// continues instead of restarting the whole feed at 0.
export function finalizeFields(
  base: NextStateFields,
  resultOk: boolean | undefined,
  prevState: SupplierSyncState | null,
  planOffset: number,
): NextStateFields {
  if (resultOk === false) {
    return { ...base, status: 'failed', next_offset: base.next_offset ?? prevState?.next_offset ?? planOffset }
  }
  return base
}
