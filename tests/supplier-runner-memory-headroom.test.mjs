import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const runner = await readFile(new URL('../deploy/self-host/run-supplier-pipeline.sh', import.meta.url), 'utf8')
const route = await readFile(new URL('../app/api/admin/cron/sync-products/route.ts', import.meta.url), 'utf8')
const rrpRoute = await readFile(new URL('../app/api/admin/cron/refresh-rrp/route.ts', import.meta.url), 'utf8')
const syncState = await readFile(new URL('../lib/supplier/sync-state.ts', import.meta.url), 'utf8')
const rrp = await readFile(new URL('../lib/supplier/rrp-sync.ts', import.meta.url), 'utf8')
const ecosystem = await readFile(new URL('../deploy/self-host/ecosystem.config.js', import.meta.url), 'utf8')

test('heavy supplier calls proactively recycle a high-RSS PM2 worker between requests', () => {
  assert.match(runner, /MEMORY_RECYCLE_KB=350000/)
  assert.match(runner, /ensure_memory_headroom/)
  assert.match(runner, /pm2 reload "\$APP_NAME" --update-env/)
  assert.match(runner, /wait_for_health \|\| fail/)
  assert.match(runner, /ensure_memory_headroom\n    log "\$label call/)
  assert.match(runner, /--max-time 90/)
})

test('scheduled product sync can recover a worker-abandoned running log without waiting ten minutes', () => {
  assert.match(route, /ABANDONED_RUN_GRACE_MS = 90_000/)
  assert.match(route, /markAbandonedProductRunsStale/)
  assert.match(route, /\.eq\('sync_type', SYNC_TYPE\)/)
  assert.match(route, /\.eq\('status', 'running'\)/)
  assert.match(route, /\.lt\('started_at', cutoff\)/)
  assert.match(route, /alreadyRunning: result\.alreadyRunning \?\? false/)
})

test('runner waits and retries when a surviving active product request is still within the grace window', () => {
  assert.match(runner, /ACTIVE_RUN_RETRY_SLEEP_S=55/)
  assert.match(runner, /json_field alreadyRunning/)
  assert.match(runner, /found an earlier in-flight run/)
  assert.match(runner, /sleep "\$ACTIVE_RUN_RETRY_SLEEP_S"/)
})

test('already-running auto product calls return before durable cursor persistence', () => {
  const busy = route.indexOf('if (result.alreadyRunning)')
  const compute = route.indexOf('const base = computeNextState')
  assert.ok(busy >= 0, 'auto route must detect alreadyRunning')
  assert.ok(compute > busy, 'busy handling must happen before state computation')
  const busyBlock = route.slice(busy, compute)
  assert.match(busyBlock, /return Response\.json/)
  assert.match(busyBlock, /stateSaved: false/)
  assert.doesNotMatch(busyBlock, /saveSyncState\(/)
})

test('official RRP fallback fetch has measured headroom and bounds body parsing', () => {
  assert.match(rrp, /const SUPPLIER_TIMEOUT_MS = 52_000/)
  const tryStart = rrp.indexOf('try {', rrp.indexOf('async function loadOfficialRrpFeed'))
  const jsonRead = rrp.indexOf('const raw = await response.json()', tryStart)
  const catchStart = rrp.indexOf('} catch (error) {', tryStart)
  assert.ok(tryStart >= 0 && jsonRead > tryStart && catchStart > jsonRead, 'response.json() must remain inside the timeout-protected try/catch')
})

test('RRP recovery downloads one stable snapshot and uses small DB-safe slices', () => {
  assert.match(rrp, /const DEFAULT_BATCH_SIZE = 1_000/)
  assert.match(rrp, /supplier-rrp-cache\.json/)
  assert.match(rrp, /readFile\(RRP_CACHE_FILE, 'utf8'\)/)
  assert.match(rrp, /safeUrl: 'local-rrp-cache'/)
  assert.match(runner, /RRP_CACHE_FILE="\$ROOT\/shared\/supplier-rrp-cache\.json"/)
  assert.match(runner, /MAX_RRP_CALLS=120/)
  assert.match(runner, /RRP_BATCH_SIZE=1000/)
  assert.match(runner, /ensure_rrp_cache/)
  assert.match(runner, /prefetching one official RRP feed snapshot/)
  assert.match(runner, /batchSize=\$\{RRP_BATCH_SIZE\}/)
  assert.match(runner, /rm -f "\$RRP_CACHE_FILE"/)
})

test('a fresh RRP snapshot crash-safely resets any cursor from an older ordering', () => {
  assert.match(runner, /RRP_CACHE_RESET_MARKER="\$ROOT\/shared\/supplier-rrp-cache\.needs-reset"/)
  assert.match(runner, /official RRP snapshot requires durable cursor reset/)
  assert.match(runner, /refresh-rrp\?reset=1/)
  assert.match(runner, /rm -f "\$RRP_CACHE_RESET_MARKER"/)

  const resetBranch = rrpRoute.indexOf("url.searchParams.get('reset') === '1'")
  const normalStateLoad = rrpRoute.indexOf('state = await loadSyncState(SYNC_TYPE)')
  assert.ok(resetBranch >= 0 && normalStateLoad > resetBranch, 'reset must occur before normal cursor planning')
  assert.match(rrpRoute, /await resetSyncState\(SYNC_TYPE\)/)
  assert.match(syncState, /export async function resetSyncState/)
  assert.match(syncState, /\.delete\(\)/)
  assert.match(syncState, /\.eq\('sync_type', syncType\)/)
})

test('repository PM2 ceiling matches the production 750 MiB safety limit', () => {
  assert.match(ecosystem, /max_memory_restart: '750M'/)
})
