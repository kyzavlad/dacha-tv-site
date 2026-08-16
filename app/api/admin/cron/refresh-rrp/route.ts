export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { syncSupplierRrpPrices } from '@/lib/supplier/rrp-sync'
import { loadSyncState, saveSyncState, planResume, computeNextState, finalizeFields } from '@/lib/supplier/sync-state'

const SYNC_TYPE = 'rrp'

function intParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key)
  if (raw == null || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? Math.floor(n) : undefined
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const explicitOffset = intParam(url, 'offset')
  const batchSize = intParam(url, 'batchSize')
  const maxBatches = intParam(url, 'maxBatches')
  const maxMillis = intParam(url, 'maxMillis')

  // Explicit offset keeps the bounded/stateless recovery and pilot behaviour.
  // This is intentionally separate from the automatic cursor so an operator can
  // inspect or replay a known feed window without corrupting scheduled progress.
  if (explicitOffset != null) {
    const result = await syncSupplierRrpPrices({
      offset: intParam(url, 'offset'),
      batchSize,
      maxBatches,
      maxMillis,
    })
    return Response.json({ mode: 'manual', ...result }, { status: result.ok ? 200 : 500 })
  }

  // Plain scheduled calls are durable and resumable. Reuse the same canonical
  // supplier_sync_state table as the base product feed rather than introducing
  // a second cursor/source of truth. A failed state read must never silently
  // restart a 112k-row RRP cycle from offset 0.
  let state
  try {
    state = await loadSyncState(SYNC_TYPE)
  } catch (error) {
    return Response.json({
      mode: 'auto',
      ok: false,
      stage: 'load-state',
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }

  const plan = planResume(state)
  const result = await syncSupplierRrpPrices({
    offset: plan.offset,
    batchSize,
    maxBatches,
    maxMillis,
  })
  const nowIso = new Date().toISOString()
  const base = computeNextState({
    prev: state,
    isNewCycle: plan.isNewCycle,
    offset: plan.offset,
    result: {
      ok: result.ok,
      totalInFeed: result.totalInFeed,
      processed: result.processed,
      updated: result.supplierUpdated,
      errors: result.missingPrice,
      nextOffset: result.nextOffset,
      done: result.done,
    },
    nowIso,
  })
  const finalFields = finalizeFields(base, result.ok, state, plan.offset)

  let stateSaved = false
  let stateError: string | null = null
  let persistedNextOffset: number | null = null
  try {
    persistedNextOffset = await saveSyncState(SYNC_TYPE, plan, finalFields)
    stateSaved = true
  } catch (error) {
    stateError = error instanceof Error ? error.message : String(error)
    console.error('[refresh-rrp] state persistence failed', { syncType: SYNC_TYPE, message: stateError })
  }

  const ok = result.ok && stateSaved
  return Response.json({
    mode: 'auto',
    ...result,
    ok,
    cycleNew: plan.isNewCycle,
    resumedFrom: plan.offset,
    processedThisRun: result.processed,
    processedThisCycle: finalFields.processed,
    cycleComplete: finalFields.status === 'completed',
    stateSaved,
    stateError,
    persistedNextOffset,
  }, { status: ok ? 200 : 500 })
}
