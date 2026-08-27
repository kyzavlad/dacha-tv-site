import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../deploy/self-host/run-supplier-pipeline.sh', import.meta.url), 'utf8')

test('daily supplier runner has bounded headroom to drain the full products feed', () => {
  assert.match(src, /MAX_PRODUCT_CALLS=20/)
  assert.match(src, /run_resumable_stage "base products" "\/api\/admin\/cron\/sync-products" "\$MAX_PRODUCT_CALLS"/)
})
