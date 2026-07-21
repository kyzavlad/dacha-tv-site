// ─── diagnose-automation.ts — READ-ONLY automation/pipeline health check ──────
// Never writes. Verifies the daily automation invariants against the live DB:
// sync cursor persistence, counts, manual/metal protection, stock columns,
// price/image locks. Uses HEAD counts (no row transfer). Prints a report; also
// writes audit/catalog-v3/automation-diagnosis.json. Secrets are never printed.
//
//   npx tsx scripts/diagnose-automation.ts

import { loadCurrentEnv, makeClient, sanitizeRef, writeArtifact, log, fail } from './lib/current.ts'

// A HEAD count query builder (chainable filter methods). Typed via the client so
// no `any` is needed for the optional filter callback.
type CountQuery = ReturnType<ReturnType<ReturnType<typeof makeClient>['from']>['select']>

async function headCount(client: ReturnType<typeof makeClient>, table: string, build?: (q: CountQuery) => CountQuery): Promise<number | null> {
  let q = client.from(table).select('id', { count: 'exact', head: true }) as CountQuery
  if (build) q = build(q)
  const { count, error } = await q
  if (error) return null
  return count ?? 0
}

async function main() {
  let env
  try { env = loadCurrentEnv() } catch (e) { fail(e instanceof Error ? e.message : String(e)) }
  const client = makeClient(env)
  log(`[diagnose-automation] READ-ONLY · ${sanitizeRef(env.url)}`)

  const report: Record<string, unknown> = {}

  // 1. Sync cursor persistence.
  const { data: syncState, error: ssErr } = await client
    .from('supplier_sync_state')
    .select('sync_type, status, feed_total, processed, current_offset, next_offset, started_at, completed_at')
  report.supplier_sync_state = ssErr ? { error: ssErr.message, hint: 'apply 20260720_catalog_manual_ownership_and_sync_state.sql' } : syncState
  report.cursor_persisted = Array.isArray(syncState) && syncState.some((r: { next_offset?: unknown; completed_at?: unknown }) => r.next_offset != null || r.completed_at != null)

  // 2. Counts.
  report.counts = {
    supplier_products: await headCount(client, 'supplier_products'),
    supplier_products_approved: await headCount(client, 'supplier_products', (q) => q.eq('is_approved', true)),
    supplier_backlog: await headCount(client, 'supplier_products', (q) => q.eq('is_approved', false).not('name', 'is', null).gt('price_uah', 0)),
    catalog_products: await headCount(client, 'catalog_products'),
    catalog_published: await headCount(client, 'catalog_products', (q) => q.eq('status', 'published')),
    catalog_draft: await headCount(client, 'catalog_products', (q) => q.eq('status', 'draft')),
    catalog_categories: await headCount(client, 'catalog_categories'),
  }

  // 3. Manual + metal protection: these must never be supplier-owned.
  report.protection = {
    manual_rows: await headCount(client, 'catalog_products', (q) => q.eq('source', 'manual')),
    metal_rows: await headCount(client, 'catalog_products', (q) => q.eq('lead_type', 'metal')),
    metal_not_manual: await headCount(client, 'catalog_products', (q) => q.eq('lead_type', 'metal').neq('source', 'manual')), // expect 0
    metal_not_inquiry: await headCount(client, 'catalog_products', (q) => q.eq('lead_type', 'metal').neq('inquiry_only', true)), // expect 0
  }

  // 4. Manual ownership locks.
  report.locks = {
    price_locked: await headCount(client, 'catalog_products', (q) => q.eq('price_manual_lock', true)),
    image_locked: await headCount(client, 'catalog_products', (q) => q.eq('image_manual_lock', true)),
  }

  // 5. Stock columns present + basic sanity (never negative, propagation).
  const { error: stockErr } = await client
    .from('catalog_products')
    .select('id, stock_quantity, is_in_stock, stock_synced_at')
    .limit(1)
  report.stock = stockErr
    ? { error: stockErr.message, hint: 'apply 20260720230000_final_catalog_i18n_stock_media_v4.sql' }
    : {
        columns_present: true,
        negative_stock: await headCount(client, 'catalog_products', (q) => q.lt('stock_quantity', 0)), // expect 0
        synced_rows: await headCount(client, 'catalog_products', (q) => q.not('stock_synced_at', 'is', null)),
        in_stock_true: await headCount(client, 'catalog_products', (q) => q.eq('is_in_stock', true)),
      }

  // 6. Translation-row coverage (RU/EN) for readiness verdicts.
  const trOk = async (loc: string) => headCount(client, 'catalog_product_translations', (q) => q.eq('locale', loc))
  report.translations = {
    ru_rows: await trOk('ru').catch(() => null),
    en_rows: await trOk('en').catch(() => null),
  }

  // 7. Last sync log (completed_with_errors + errorGroups presence).
  const { data: lastLog } = await client
    .from('supplier_sync_log')
    .select('sync_type, status, products_total, products_errors, error_details, started_at, completed_at')
    .order('started_at', { ascending: false }).limit(1)
  report.last_sync_log = lastLog?.[0] ?? null

  const path = writeArtifact('automation-diagnosis.json', report)
  log(JSON.stringify(report, null, 2))
  log(`\n  report: ${path}`)
  // Flag invariant violations loudly.
  const p = report.protection as Record<string, number | null>
  if (p.metal_not_manual) log(`  ⚠ ${p.metal_not_manual} metal rows are NOT source=manual — investigate`)
  if (p.metal_not_inquiry) log(`  ⚠ ${p.metal_not_inquiry} metal rows are NOT inquiry_only — investigate`)
  const s = report.stock as Record<string, number | null>
  if (s && s.negative_stock) log(`  ⚠ ${s.negative_stock} rows have negative stock_quantity — investigate`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
