import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const route = await readFile(new URL('../app/api/admin/cron/refresh-catalog-existing/route.ts', import.meta.url), 'utf8')

test('existing catalog cron route is protected and bypasses new-SKU discovery', () => {
  assert.match(route, /verifyCronAuth\(req\)/)
  assert.match(route, /refreshExistingCatalogFromSupplier/)
  assert.match(route, /EXISTING_REFRESH_BATCH_SIZE/)
  assert.match(route, /done:\s*result\.ok\s*&&\s*!result\.hasMore/)
  assert.doesNotMatch(route, /importBatch/)
  assert.doesNotMatch(route, /insertNewSupplierProducts/)
})
