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
  assert.match(runner, /\/var\/www\/dacha-tv\/shared\/\.env\.production/)
  assert.match(runner, /flock -n 9/)
  assert.match(runner, /Authorization: Bearer \$\{CRON_SECRET\}/)
  assert.match(runner, /\[ -n "\$\{CRON_SECRET:-\}" \]/)
  assert.doesNotMatch(runner, /echo[^\n]*CRON_SECRET/)
  assert.doesNotMatch(runner, /printf[^\n]*CRON_SECRET/)
})

test('supplier stages run in the required economic and data-integrity order', () => {
  const start = runner.indexOf('log "starting full supplier pipeline"')
  assert.ok(start >= 0, 'pipeline orchestration block must exist')
  const orchestration = runner.slice(start)

  const products = orchestration.indexOf('run_resumable_stage "base products"')
  const categories = orchestration.indexOf("call_api '/api/admin/cron/sync-categories'")
  const rrp = orchestration.indexOf('run_resumable_stage "official RRP"')
  const imported = orchestration.indexOf('\nrun_import_stage\n')
  const published = orchestration.indexOf("call_api '/api/admin/cron/publish-products'")

  for (const [name, index] of Object.entries({ products, categories, rrp, imported, published })) {
    assert.ok(index >= 0, `${name} stage must exist`)
  }

  assert.ok(products < categories, 'base products must finish before category reconciliation')
  assert.ok(categories < rrp, 'category reconciliation must precede official RRP')
  assert.ok(rrp < imported, 'official RRP must finish before catalog import')
  assert.ok(imported < published, 'catalog import must drain before publish')
})

test('resumable product and RRP stages require persisted completion before advancing', () => {
  assert.match(runner, /json_field cycleComplete/)
  assert.match(runner, /json_field stateSaved/)
  assert.match(runner, /\[ "\$state_saved" = "true" \] \|\| fail/)
  assert.match(runner, /\[ "\$complete" = "true" \]/)
  assert.match(runner, /MAX_PRODUCT_CALLS=6/)
  assert.match(runner, /MAX_RRP_CALLS=30/)
})

test('catalog import is bounded and drains on the explicit done signal', () => {
  assert.match(runner, /MAX_IMPORT_CALLS=40/)
  assert.match(runner, /json_field done/)
  assert.match(runner, /if \[ "\$done" = "true" \]; then/)
  assert.match(runner, /fail "catalog import did not drain/)
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
