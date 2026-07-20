// ─── audit-legacy-catalog.ts — READ-ONLY, EGRESS-SAFE legacy vs current audit ─
// Streams legacy in bounded pages and queries current only by each page's stable
// keys — the 105k+ catalog_products table is never loaded whole. Writes a local
// JSON + Markdown report. Never writes to either DB; never prints service keys.
//
//   Run:  node scripts/audit-legacy-catalog.ts
//   Env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//         LEGACY_SUPABASE_URL, LEGACY_SUPABASE_SERVICE_ROLE_KEY

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadEnv, makeClient, sanitizeRef, TABLES, existingColumns, headCount,
  pageRows, fetchCurrentByKeys, streamCompare, planFills, checkUrl, dedupeMedia, writeArtifact,
  type TableConfig, type Row,
} from './legacy/lib.ts'

const MEDIA_CHECK_CAP = 40

function uniq(a: string[]): string[] { return [...new Set(a)] }

function collectMedia(cfg: TableConfig, row: Row): string[] {
  const urls: string[] = []
  for (const f of cfg.mediaFields) if (typeof row[f] === 'string' && row[f]) urls.push(row[f] as string)
  for (const f of cfg.arrayMediaFields) urls.push(...dedupeMedia(row[f]))
  return urls
}

interface TableReport {
  table: string; label: string
  legacyRows: number; legacyScanned: number; currentRows: number | null
  matched: number; fillableRows: number; fieldFillCounts: Record<string, number>
  restoreCandidates: number; ambiguous: number
  estNewRows: number; estBytes: number
  mediaChecked: number; mediaBroken: number; brokenSample: string[]
  note: string
}

async function auditTable(current: SupabaseClient, legacy: SupabaseClient, cfg: TableConfig): Promise<TableReport> {
  const legacyWanted = uniq([...cfg.matchKeys, ...cfg.fillFields, ...(cfg.restoreColumns ?? []), 'source', 'category_slug'])
  const currentWanted = uniq([...cfg.matchKeys, ...cfg.fillFields, 'id', 'description_auto_generated'])
  const [presentLegacy, presentCurrent] = await Promise.all([
    existingColumns(legacy, cfg.table, legacyWanted),
    existingColumns(current, cfg.table, currentWanted),
  ])
  for (const k of cfg.matchKeys) if (k === 'id' || k === 'slug') { presentLegacy.add(k); presentCurrent.add(k) }
  const legacyCols = [...presentLegacy].join(', ')
  const currentCols = [...presentCurrent].join(', ')
  const legacyFilter = cfg.legacyFilterOr ? cfg.legacyFilterOr(presentLegacy) : null

  const [legacyCount, currentCount] = await Promise.all([
    headCount(legacy, cfg.table, legacyFilter),
    headCount(current, cfg.table),
  ])

  const fieldFillCounts: Record<string, number> = {}
  let fillableRows = 0, matched = 0, restoreCandidates = 0, ambiguous = 0, estBytes = 0
  const mediaUrls: string[] = []

  const { legacyRows } = await streamCompare(cfg, {
    pageLegacy: (from, size) => pageRows(legacy, cfg.table, legacyCols, from, size, legacyFilter),
    fetchCurrentByKeys: (keys) => fetchCurrentByKeys(current, cfg.table, currentCols, keys, cfg.matchKeys),
  }, {
    onMatched: (legacyRow, currentRow) => {
      matched++
      const { fills, values } = planFills(cfg, legacyRow, currentRow, presentCurrent)
      if (fills.length) fillableRows++
      for (const f of fills) {
        fieldFillCounts[f.field] = (fieldFillCounts[f.field] ?? 0) + 1
        estBytes += f.bytes
        if (f.isMedia && mediaUrls.length < MEDIA_CHECK_CAP) mediaUrls.push(...collectMedia(cfg, { [f.field]: values[f.field] }))
      }
    },
    onLegacyOnly: (legacyRow) => {
      if (!cfg.restoreMissing) return
      if (cfg.restoreWhen && !cfg.restoreWhen(legacyRow)) return
      restoreCandidates++
      for (const col of cfg.restoreColumns ?? []) if (presentCurrent.has(col)) estBytes += Buffer.byteLength(String(legacyRow[col] ?? ''))
      if (mediaUrls.length < MEDIA_CHECK_CAP) mediaUrls.push(...collectMedia(cfg, legacyRow))
    },
    onAmbiguous: () => { ambiguous++ },
  })

  const toCheck = uniq(mediaUrls).slice(0, MEDIA_CHECK_CAP)
  const checks = await Promise.all(toCheck.map(checkUrl))
  const broken = checks.filter((c) => !c.ok)

  return {
    table: cfg.table, label: cfg.label,
    legacyRows: legacyCount ?? legacyRows, legacyScanned: legacyRows, currentRows: currentCount,
    matched, fillableRows, fieldFillCounts,
    restoreCandidates, ambiguous, estNewRows: restoreCandidates, estBytes,
    mediaChecked: checks.length, mediaBroken: broken.length, brokenSample: broken.slice(0, 5).map((b) => b.url),
    note: cfg.note,
  }
}

function toMarkdown(refs: { current: string; legacy: string }, reports: TableReport[], totals: { newRows: number; bytes: number }): string {
  const lines: string[] = []
  lines.push('# Legacy → current catalog audit (DRY RUN — read-only, egress-safe)', '')
  lines.push(`> Current: ${refs.current} · Legacy: ${refs.legacy} (refs redacted). No writes. Legacy streamed in bounded pages; current queried by key only.`, '')
  lines.push('## Totals', '')
  lines.push(`- Estimated new rows to restore: **${totals.newRows}**`)
  lines.push(`- Estimated added text/media-reference size: **${(totals.bytes / 1024).toFixed(1)} KiB** (URLs only — no binaries stored in Postgres)`, '')
  lines.push('| table | legacy(count) | scanned | current | matched | fill rows | restore | ambiguous | est.KiB | media broken/checked |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const r of reports) {
    lines.push(`| ${r.table} | ${r.legacyRows} | ${r.legacyScanned} | ${r.currentRows ?? '?'} | ${r.matched} | ${r.fillableRows} | ${r.restoreCandidates} | ${r.ambiguous} | ${(r.estBytes / 1024).toFixed(1)} | ${r.mediaBroken}/${r.mediaChecked} |`)
  }
  lines.push('')
  for (const r of reports) {
    lines.push(`### ${r.label} (\`${r.table}\`)`, `- ${r.note}`)
    const ff = Object.entries(r.fieldFillCounts)
    if (ff.length) lines.push(`- Fields to fill (empty-in-current): ${ff.map(([k, n]) => `${k} (${n})`).join(', ')}`)
    if (r.ambiguous) lines.push(`- ⚠ ${r.ambiguous} ambiguous legacy rows (matched >1 current row) — manual review, never auto-applied.`)
    if (r.brokenSample.length) lines.push(`- Broken/inaccessible legacy media sample: ${r.brokenSample.join(', ')}`)
    lines.push('')
  }
  lines.push('## Next step', '', 'Review, then run the migration dry-run:', '', '```', 'node scripts/migrate-legacy-catalog.ts', '```', '')
  return lines.join('\n')
}

async function main() {
  let env
  try { env = loadEnv() } catch (e) {
    process.stderr.write(`\n[audit-legacy] FATAL: ${e instanceof Error ? e.message : String(e)}\n\n`); process.exit(1)
  }
  const current = makeClient(env.current)
  const legacy = makeClient(env.legacy)
  const refs = { current: sanitizeRef(env.current.url), legacy: sanitizeRef(env.legacy.url) }
  process.stdout.write(`[audit-legacy] comparing ${refs.legacy} → ${refs.current} (read-only, bounded pages of ${300})…\n`)

  const reports: TableReport[] = []
  for (const cfg of TABLES) {
    process.stdout.write(`  • ${cfg.table}…\n`)
    reports.push(await auditTable(current, legacy, cfg))
  }
  const totals = {
    newRows: reports.reduce((a, r) => a + r.estNewRows, 0),
    bytes: reports.reduce((a, r) => a + r.estBytes, 0),
  }
  const jsonPath = writeArtifactJson(refs, totals, reports)
  const mdPath = writeArtifactMd(refs, reports, totals)
  process.stdout.write(`\n[audit-legacy] done. Estimated ${totals.newRows} new rows, ${(totals.bytes / 1024).toFixed(1)} KiB.\n`)
  process.stdout.write(`[audit-legacy] artifacts: ${jsonPath}, ${mdPath}\n`)
}

function writeArtifactJson(refs: unknown, totals: unknown, reports: unknown): string {
  return writeArtifact('audit-report.json', { generatedFrom: 'real read-only execution', refs, totals, reports })
}
function writeArtifactMd(refs: { current: string; legacy: string }, reports: TableReport[], totals: { newRows: number; bytes: number }): string {
  return writeArtifact('audit-report.md', toMarkdown(refs, reports, totals))
}

main().catch((e) => {
  process.stderr.write(`\n[audit-legacy] ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`); process.exit(1)
})
