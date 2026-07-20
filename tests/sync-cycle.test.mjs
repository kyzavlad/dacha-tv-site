import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planResume, computeNextState, completedCycleWithin24h, assertSupabaseOk, finalizeFields } from '../lib/supplier/sync-cycle.ts'

const running = {
  sync_type: 'products', cycle_id: 'c1', status: 'running',
  feed_total: 112000, processed: 3000, inserted: 2000, updated: 1000, errors: 0,
  current_offset: 2000, next_offset: 3000, started_at: '2026-07-20T03:00:00Z',
  completed_at: null, updated_at: '2026-07-20T03:00:45Z',
}

test('planResume resumes an in-progress cycle from next_offset', () => {
  assert.deepEqual(planResume(running), { offset: 3000, cycleId: 'c1', isNewCycle: false })
})

test('planResume starts a fresh cycle when no state', () => {
  assert.deepEqual(planResume(null), { offset: 0, cycleId: null, isNewCycle: true })
})

test('planResume starts fresh after a clean completion', () => {
  assert.equal(planResume({ ...running, status: 'completed', next_offset: null }).isNewCycle, true)
})

// ── Failed-run resume (requirement: a transient failure must not restart the
// whole 112k feed at offset 0 when a safe next_offset survived) ───────────────

test('planResume RESUMES a failed cycle that has a valid next_offset', () => {
  const failed = { ...running, status: 'failed', next_offset: 3000 }
  assert.deepEqual(planResume(failed), { offset: 3000, cycleId: 'c1', isNewCycle: false })
})

test('planResume starts fresh when a failed cycle has no safe offset', () => {
  assert.equal(planResume({ ...running, status: 'failed', next_offset: null }).isNewCycle, true)
  assert.equal(planResume({ ...running, status: 'failed', next_offset: 0 }).isNewCycle, true)
})

test('planResume starts fresh for idle state', () => {
  assert.equal(planResume({ ...running, status: 'idle', next_offset: 3000 }).isNewCycle, true)
})

test('computeNextState accumulates across an ongoing cycle', () => {
  const next = computeNextState({
    prev: running, isNewCycle: false, offset: 3000,
    result: { totalInFeed: 112000, processed: 1500, inserted: 1000, updated: 500, errors: 2, nextOffset: 4500, done: false },
    nowIso: '2026-07-20T03:01:30Z',
  })
  assert.equal(next.status, 'running')
  assert.equal(next.processed, 4500)      // 3000 + 1500
  assert.equal(next.inserted, 3000)       // 2000 + 1000
  assert.equal(next.next_offset, 4500)
  assert.equal(next.started_at, running.started_at) // preserved
})

test('computeNextState resets counters on a new cycle', () => {
  const next = computeNextState({
    prev: running, isNewCycle: true, offset: 0,
    result: { totalInFeed: 112000, processed: 1000, inserted: 900, updated: 100, errors: 0, nextOffset: 1000, done: false },
    nowIso: '2026-07-21T03:00:20Z',
  })
  assert.equal(next.processed, 1000)      // not 4000
  assert.equal(next.started_at, '2026-07-21T03:00:20Z')
})

test('computeNextState completes the cycle at feed end', () => {
  const next = computeNextState({
    prev: running, isNewCycle: false, offset: 111000,
    result: { totalInFeed: 112000, processed: 1000, inserted: 0, updated: 1000, errors: 0, nextOffset: null, done: true },
    nowIso: '2026-07-25T03:00:40Z',
  })
  assert.equal(next.status, 'completed')
  assert.equal(next.next_offset, null)
  assert.equal(next.completed_at, '2026-07-25T03:00:40Z')
})

test('completedCycleWithin24h', () => {
  const now = Date.parse('2026-07-25T12:00:00Z')
  assert.equal(completedCycleWithin24h({ ...running, status: 'completed', completed_at: '2026-07-25T06:00:00Z' }, now), true)
  assert.equal(completedCycleWithin24h({ ...running, status: 'completed', completed_at: '2026-07-23T06:00:00Z' }, now), false)
  assert.equal(completedCycleWithin24h(running, now), false) // still running
  assert.equal(completedCycleWithin24h(null, now), false)
})

// ── assertSupabaseOk: load/save errors must never be silently swallowed ───────

test('assertSupabaseOk is a no-op when there is no error', () => {
  assert.doesNotThrow(() => assertSupabaseOk(null, 'loadSyncState(products)'))
  assert.doesNotThrow(() => assertSupabaseOk(undefined, 'loadSyncState(products)'))
})

test('assertSupabaseOk throws with the context and message on error', () => {
  assert.throws(
    () => assertSupabaseOk({ message: 'connection reset' }, 'saveSyncState(products)'),
    /saveSyncState\(products\): connection reset/,
  )
})

test('assertSupabaseOk throws even when the error has no message', () => {
  assert.throws(() => assertSupabaseOk({}, 'loadSyncState(products)'), /loadSyncState\(products\): unknown error/)
})

// ── finalizeFields: persistence-safe outcome finalization ────────────────────

test('finalizeFields leaves a successful run untouched', () => {
  const base = computeNextState({ prev: running, isNewCycle: false, offset: 3000, result: { done: false, nextOffset: 4500 }, nowIso: 'T' })
  assert.deepEqual(finalizeFields(base, true, running, 3000), base)
})

test('finalizeFields marks a failed run failed but keeps its own next_offset', () => {
  const base = computeNextState({ prev: running, isNewCycle: false, offset: 3000, result: { done: false, nextOffset: 4200, ok: false }, nowIso: 'T' })
  const final = finalizeFields(base, false, running, 3000)
  assert.equal(final.status, 'failed')
  assert.equal(final.next_offset, 4200) // this run's own progress wins
})

test('finalizeFields falls back to the previous cursor when this run made no progress', () => {
  const base = computeNextState({ prev: running, isNewCycle: false, offset: 3000, result: { done: false, nextOffset: null, ok: false }, nowIso: 'T' })
  const final = finalizeFields(base, false, running, 3000)
  assert.equal(final.status, 'failed')
  assert.equal(final.next_offset, running.next_offset) // 3000, never lost
})

test('finalizeFields falls back to the plan offset when there is no previous state', () => {
  const base = computeNextState({ prev: null, isNewCycle: true, offset: 0, result: { done: false, nextOffset: null, ok: false }, nowIso: 'T' })
  const final = finalizeFields(base, false, null, 0)
  assert.equal(final.status, 'failed')
  assert.equal(final.next_offset, 0) // never null → next run does not restart blindly past data
})
