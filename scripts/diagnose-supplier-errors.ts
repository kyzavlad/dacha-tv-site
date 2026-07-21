// ─── diagnose-supplier-errors.ts — READ-ONLY 1767-error classification ────────
// Never writes. Reads the most recent supplier_sync_log rows and surfaces the
// stored errorGroups / error_details (counts + safe sample SKUs + DB code +
// feed offset) that the raw sync now records. No full payloads, no secrets.
// Also re-derives an invalid_price count directly from supplier_products (rows
// that will be silently excluded from the catalog import).
//
//   npx tsx scripts/diagnose-supplier-errors.ts

import { loadCurrentEnv, makeClient, sanitizeRef, writeArtifact, log, fail } from './lib/current.ts'

const GROUPS = ['missing_sku', 'duplicate_sku_in_feed', 'invalid_record', 'invalid_price', 'database_constraint', 'upsert_failed', 'unknown']

async function main() {
  let env
  try { env = loadCurrentEnv() } catch (e) { fail(e instanceof Error ? e.message : String(e)) }
  const client = makeClient(env)
  log(`[diagnose-supplier-errors] READ-ONLY · ${sanitizeRef(env.url)}`)

  // Latest sync logs (append-only history). The raw sync writes completed_with_errors
  // + errorGroups + errorDetails into error_details.
  const { data: logs, error } = await client
    .from('supplier_sync_log')
    .select('id, sync_type, status, products_total, products_errors, error_details, started_at, completed_at')
    .order('started_at', { ascending: false })
    .limit(10)
  if (error) fail(`read supplier_sync_log: ${error.message}`)

  const report: Record<string, unknown> = { source: sanitizeRef(env.url), logs: [] }
  const logsOut: unknown[] = []

  for (const row of logs ?? []) {
    const details = (row.error_details ?? {}) as Record<string, unknown>
    const groups = (details.errorGroups ?? details.groups ?? {}) as Record<string, number>
    // Normalize into the canonical 7 groups.
    const counts: Record<string, number> = {}
    for (const g of GROUPS) counts[g] = Number(groups[g] ?? 0)
    // A row is a LEGACY run if it predates the classifier (errorGroups absent /
    // null while products_errors > 0). Its exact classification is UNAVAILABLE —
    // never fabricate it. New runs always carry errorGroups.
    const hasGroups = details.errorGroups != null && Object.keys(groups).length > 0
    const legacyUnclassified = !hasGroups && Number(row.products_errors) > 0
    logsOut.push({
      sync_type: row.sync_type,
      status: row.status,
      legacy_unclassified: legacyUnclassified,
      classification_available: hasGroups,
      completed_with_errors: details.completed_with_errors ?? details.completedWithErrors ?? null,
      hard_errors: details.hard_errors ?? null,
      diagnostic_issues: details.diagnostic_issues ?? null,
      products_total: row.products_total,
      products_errors: row.products_errors,
      errorGroups: hasGroups ? counts : null,
      // Sample details are already bounded + sanitized by recordError.
      details: details.errorDetails ?? details.details ?? null,
      started_at: row.started_at,
      completed_at: row.completed_at,
    })
  }
  report.logs = logsOut

  // Live re-derivation of invalid_price: supplier rows that built but have no
  // usable price → excluded from the catalog import (price_uah > 0).
  const { count: noPrice } = await client
    .from('supplier_products')
    .select('id', { count: 'exact', head: true })
    .or('price_uah.is.null,price_uah.lte.0')
  const { count: missingName } = await client
    .from('supplier_products')
    .select('id', { count: 'exact', head: true })
    .is('name', null)
  report.live_data_quality = {
    invalid_price_rows: noPrice ?? null,
    missing_name_rows: missingName ?? null,
    note: 'invalid_price rows are harmless UNSELLABLE supplier rows (no price) — excluded from the catalog import, not a failure. missing_name rows likewise.',
  }

  const anyLegacy = logsOut.some((l) => (l as { legacy_unclassified?: boolean }).legacy_unclassified)
  report.historical_note = anyLegacy
    ? 'One or more legacy runs have products_errors > 0 but NO stored errorGroups. Their exact classification (e.g. the historical 1767) is UNAVAILABLE and was not reconstructed. New runs always emit errorGroups + hard_errors/diagnostic_issues; live_data_quality below counts no-price/missing-name rows independently.'
    : 'All inspected runs carry errorGroups (classifier active).'

  const path = writeArtifact('supplier-error-diagnosis.json', report)
  log(JSON.stringify(report, null, 2))
  log(`\n  report: ${path}`)
  log(`\n  Historical note: ${report.historical_note}`)
  log(`\n  Interpretation:`)
  log(`   • missing_sku / invalid_record       → malformed feed records (skipped, safe)`)
  log(`   • invalid_price / missing_name        → unsellable supplier rows (excluded from import, safe)`)
  log(`   • duplicate_sku_in_feed               → benign feed dupes (first wins)`)
  log(`   • database_constraint / upsert_failed → REAL failures — inspect code/message; bounded retry runs for retryable ones`)
  log(`   • unknown                             → no code/message — inspect samples`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
