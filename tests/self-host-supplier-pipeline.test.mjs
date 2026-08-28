import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const runnerUrl = new URL('../deploy/self-host/run-supplier-pipeline.sh', import.meta.url)
const runner = await readFile(runnerUrl, 'utf8')
const workflow = await readFile(new URL('../.github/workflows/build-standalone-linux.yml', import.meta.url), 'utf8')

test('supplier runner is valid bash syntax', () => {
  const result = spawnSync('bash', ['-n', fileURLToPath(runnerUrl)], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('self-host supplier runner is locked, authenticated and never prints the cron secret', () => {
  assert.match(runner, /ROOT="\/var\/www\/dacha-tv"/)
  assert.match(runner, /ENV_FILE="\$ROOT\/shared\/\.env\.production"/)
  assert.match(runner, /flock -n 9/)
  assert.match(runner, /Authorization: Bearer \$\{CRON_SECRET\}/)
  assert.match(runner, /\[ -n "\$\{CRON_SECRET:-\}" \]/)

  const executableLines = runner
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  for (const line of executableLines) {
    if (/^(echo|printf)\b/.test(line)) {
      assert.doesNotMatch(line, /CRON_SECRET/, `runner must not print CRON_SECRET: ${line}`)
    }
  }
})

test('supplier stages run in the required economic and data-integrity order', () => {
  const start = runner.indexOf('log "starting full supplier pipeline"')
  assert.ok(start >= 0, 'pipeline orchestration block must exist')
  const orchestration = runner.slice(start)

  const products = orchestration.indexOf('run_resumable_stage "base products"')
  const categories = orchestration.indexOf("call_api '/api/admin/cron/sync-categories'")
  const rrp = orchestration.indexOf('ensure_rrp_cache')
  const rrpCall = orchestration.indexOf('"official RRP"', rrp)
  const existing = orchestration.indexOf('\n  run_existing_catalog_refresh_stage\n')
  const imported = orchestration.indexOf('\n  run_import_stage\n')
  const published = orchestration.indexOf("call_api '/api/admin/cron/publish-products'")

  for (const [name, index] of Object.entries({ products, categories, rrp, rrpCall, existing, imported, published })) {
    assert.ok(index >= 0, `${name} stage must exist`)
  }

  assert.ok(products < categories, 'base products must finish before category reconciliation')
  assert.ok(categories < rrp, 'category reconciliation must precede official RRP')
  assert.ok(rrp < rrpCall, 'RRP snapshot must exist before resumable RRP DB batches')
  assert.ok(rrpCall < existing, 'official RRP must finish before existing catalog refresh')
  assert.ok(existing < imported, 'existing catalog refresh must drain before new-product finalization')
  assert.ok(imported < published, 'new-product finalization must drain before publish')
})

test('resumable product and RRP stages require persisted completion before advancing', () => {
  assert.match(runner, /json_field cycleComplete/)
  assert.match(runner, /json_field stateSaved/)
  assert.match(runner, /\[ "\$state_saved" = "true" \] \|\| fail/)
  assert.match(runner, /\[ "\$complete" = "true" \]/)
  assert.match(runner, /MAX_PRODUCT_CALLS=20/)
  assert.match(runner, /MAX_RRP_CALLS=120/)
  assert.match(runner, /RRP_BATCH_SIZE=1000/)
  assert.match(runner, /maxBatches=1/)
})

test('manual recovery can start from RRP without replaying completed product stages', () => {
  assert.match(runner, /START_STAGE="\$\{1:-products\}"/)
  assert.match(runner, /products\) printf '1'/)
  assert.match(runner, /rrp\) printf '3'/)
  assert.match(runner, /existing\) printf '4'/)
  assert.match(runner, /should_run_stage "products"/)
  assert.match(runner, /should_run_stage "rrp"/)
  assert.match(runner, /should_run_stage "existing"/)
  assert.match(runner, /start stage=\$START_STAGE/)
})

test('resumable stages retry transient HTTP failures from the durable cursor', () => {
  assert.match(runner, /MAX_STAGE_HTTP_FAILURES=3/)
  assert.match(runner, /http_failures=\$\(\(http_failures \+ 1\)\)/)
  assert.match(runner, /retrying from durable cursor/)
  assert.match(runner, /HTTP request failed \$http_failures consecutive times/)
})

test('existing catalog refresh keeps full queue capacity while applying DB backpressure', () => {
  assert.match(runner, /MAX_CATALOG_REFRESH_CALLS=400/)
  assert.match(runner, /CATALOG_REFRESH_SUCCESS_SLEEP_S=2/)
  assert.match(runner, /CATALOG_REFRESH_RETRY_BASE_SLEEP_S=10/)
  assert.match(runner, /POST_RRP_DB_COOLDOWN_S=30/)
  assert.match(runner, /\/api\/admin\/cron\/refresh-catalog-existing/)
  assert.match(runner, /existing catalog refresh HTTP request failed \(\$http_failures\/\$MAX_STAGE_HTTP_FAILURES\)/)
  assert.match(runner, /retrying the remaining diff queue/)
  assert.match(runner, /sleep "\$CATALOG_REFRESH_SUCCESS_SLEEP_S"/)
  assert.match(runner, /cooling \$\{POST_RRP_DB_COOLDOWN_S\}s after RRP writes/)
  assert.match(runner, /json_field done/)
  assert.match(runner, /existing catalog refresh drained/)
  assert.match(runner, /fail "existing catalog refresh did not drain/)
})

test('new-product finalization remains bounded and drains on the explicit done signal', () => {
  assert.match(runner, /MAX_IMPORT_CALLS=40/)
  assert.match(runner, /\/api\/admin\/cron\/import-products/)
  assert.match(runner, /if \[ "\$done" = "true" \]; then/)
  assert.match(runner, /fail "new-product import finalization did not drain/)
})

test('runner health-checks before and after mutating the supplier pipeline', () => {
  const start = runner.indexOf('log "starting full supplier pipeline"')
  assert.ok(start >= 0, 'pipeline orchestration block must exist')
  const orchestration = runner.slice(start)
  const first = orchestration.indexOf('health_check || fail "pre-flight health check failed"')
  const products = orchestration.indexOf('run_resumable_stage "base products"')
  const final = orchestration.indexOf('health_check || fail "final health check failed"')
  assert.ok(first >= 0 && products >= 0 && final >= 0)
  assert.ok(first < products)
  assert.ok(final > products)
})

test('GitHub concurrency cancels stale PR runs but preserves exact-main release builds', () => {
  assert.match(workflow, /concurrency:/)
  assert.match(workflow, /group: dacha-tv-build-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/)
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/)
  assert.match(workflow, /push:[\s\S]*branches:[\s\S]*- main/)
})
