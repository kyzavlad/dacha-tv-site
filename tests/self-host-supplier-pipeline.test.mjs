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
  const rrp = orchestration.indexOf('run_resumable_stage "official RRP"')
  const existing = orchestration.indexOf('\nrun_existing_catalog_refresh_stage\n')
  const imported = orchestration.indexOf('\nrun_import_stage\n')
  const published = orchestration.indexOf("call_api '/api/admin/cron/publish-products'")

  for (const [name, index] of Object.entries({ products, categories, rrp, existing, imported, published })) {
    assert.ok(index >= 0, `${name} stage must exist`)
  }

  assert.ok(products < categories, 'base products must finish before category reconciliation')
  assert.ok(categories < rrp, 'category reconciliation must precede official RRP')
  assert.ok(rrp < existing, 'official RRP must finish before existing catalog refresh')
  assert.ok(existing < imported, 'existing catalog refresh must drain before new-product finalization')
  assert.ok(imported < published, 'new-product finalization must drain before publish')
})

test('resumable product and RRP stages require persisted completion before advancing', () => {
  assert.match(runner, /json_field cycleComplete/)
  assert.match(runner, /json_field stateSaved/)
  assert.match(runner, /\[ "\$state_saved" = "true" \] \|\| fail/)
  assert.match(runner, /\[ "\$complete" = "true" \]/)
  assert.match(runner, /MAX_PRODUCT_CALLS=20/)
  assert.match(runner, /MAX_RRP_CALLS=30/)
})

test('existing catalog refresh has enough bounded calls for the full 112k queue', () => {
  assert.match(runner, /MAX_CATALOG_REFRESH_CALLS=400/)
  assert.match(runner, /\/api\/admin\/cron\/refresh-catalog-existing/)
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
