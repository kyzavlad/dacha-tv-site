// ─── migrate-legacy-catalog.ts — legacy → current fill/restore migration ──────
// DRY RUN by default (writes nothing). APPLY requires --apply, --confirm=<token>
// AND --current-ref=<project ref> matching the live current project. Current
// production is authoritative: only FILL fields empty in current and RESTORE
// genuinely-missing manual rows. Egress-safe (legacy streamed in bounded pages,
// current queried by key only). Idempotent; re-running does not duplicate rows.
//
//   Dry run: node scripts/migrate-legacy-catalog.ts
//   Apply:   node scripts/migrate-legacy-catalog.ts --apply \
//              --confirm=I-UNDERSTAND-WRITE-TO-CURRENT --current-ref=<ref> [--allow-ambiguous]

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadEnv, makeClient, sanitizeRef, projectRef, TABLES, existingColumns,
  pageRows, fetchCurrentByKeys, streamCompare, planFills, chunk, isEmpty, writeArtifact,
  APPLY_CONFIRM_TOKEN, ARTIFACT_DIR, type TableConfig, type Row,
} from './legacy/lib.ts'

const BATCH = 100
function uniq(a: string[]): string[] { return [...new Set(a)] }

interface Args { apply: boolean; confirm: string | null; currentRef: string | null; allowAmbiguous: boolean }
function parseArgs(argv: string[]): Args {
  const get = (p: string) => { const a = argv.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null }
  return {
    apply: argv.includes('--apply'),
    confirm: get('--confirm='),
    currentRef: get('--current-ref='),
    allowAmbiguous: argv.includes('--allow-ambiguous'),
  }
}

interface FillAction { id: unknown; fields: string[]; values: Row }
interface TablePlan {
  table: string; label: string
  presentCurrent: string[]
  fills: FillAction[]
  restores: Row[]
  ambiguous: number
  note: string
}

async function planTable(current: SupabaseClient, legacy: SupabaseClient, cfg: TableConfig): Promise<TablePlan> {
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

  const fills: FillAction[] = []
  const restores: Row[] = []
  let ambiguous = 0

  await streamCompare(cfg, {
    pageLegacy: (from, size) => pageRows(legacy, cfg.table, legacyCols, from, size, legacyFilter),
    fetchCurrentByKeys: (keys) => fetchCurrentByKeys(current, cfg.table, currentCols, keys, cfg.matchKeys),
  }, {
    onMatched: (legacyRow, currentRow) => {
      if (currentRow.id == null) return
      const { fills: ff, values } = planFills(cfg, legacyRow, currentRow, presentCurrent)
      if (ff.length) fills.push({ id: currentRow.id, fields: ff.map((f) => f.field), values })
    },
    onLegacyOnly: (legacyRow) => {
      if (!cfg.restoreMissing) return
      if (cfg.restoreWhen && !cfg.restoreWhen(legacyRow)) return
      const row: Row = {}
      for (const col of cfg.restoreColumns ?? []) if (presentCurrent.has(col) && legacyRow[col] !== undefined) row[col] = legacyRow[col]
      if (row.slug) restores.push(row)
    },
    onAmbiguous: () => { ambiguous++ },
  })

  return { table: cfg.table, label: cfg.label, presentCurrent: [...presentCurrent], fills, restores, ambiguous, note: cfg.note }
}

interface Applied {
  table: string
  filledRows: number
  fillRollback: { id: unknown; before: Row }[]   // real before-values (may be null)
  restored: { id: unknown; slug: string }[]      // ONLY rows actually inserted
  errors: string[]
}

async function applyTable(client: SupabaseClient, cfg: TableConfig, plan: TablePlan): Promise<Applied> {
  const applied: Applied = { table: cfg.table, filledRows: 0, fillRollback: [], restored: [], errors: [] }

  // Fills: re-read the row IMMEDIATELY before writing so we only ever fill fields
  // that are STILL empty — a field populated after planning is never overwritten.
  const readCols = uniq(['id', ...plan.fills.flatMap((f) => f.fields), 'description_auto_generated']).join(', ')
  for (const f of plan.fills) {
    const { data: freshRaw, error: readErr } = await client.from(cfg.table).select(readCols).eq('id', f.id).maybeSingle()
    if (readErr) { applied.errors.push(`reread ${String(f.id)}: ${readErr.message}`); continue }
    if (!freshRaw) continue
    const fresh = freshRaw as unknown as Row
    const write: Row = {}
    const before: Row = {}
    for (const field of f.fields) {
      const generatedFallback = field === 'description' && fresh.description_auto_generated === true
      if (!isEmpty(fresh[field]) && !generatedFallback) continue // populated since planning → skip
      write[field] = f.values[field]
      before[field] = fresh[field] ?? null   // record real before-value, even if null
    }
    if (Object.keys(write).length === 0) continue
    if (cfg.table === 'catalog_categories' && 'description' in write) write.description_auto_generated = false
    const { error } = await client.from(cfg.table).update({ ...write, updated_at: new Date().toISOString() }).eq('id', f.id)
    if (error) { applied.errors.push(`fill ${String(f.id)}: ${error.message}`); continue }
    applied.filledRows++
    applied.fillRollback.push({ id: f.id, before })
  }

  // Restores: upsert on slug with ignoreDuplicates and .select() → the returned
  // rows are ONLY the ones actually inserted (conflicts return nothing), so we
  // record real inserted id+slug and never a merely-attempted slug.
  for (const part of chunk(plan.restores, BATCH)) {
    const { data, error } = await client.from(cfg.table)
      .upsert(part, { onConflict: 'slug', ignoreDuplicates: true })
      .select('id, slug')
    if (error) { applied.errors.push(`restore batch: ${error.message}`); continue }
    for (const r of (data ?? []) as Row[]) applied.restored.push({ id: r.id, slug: String(r.slug) })
  }

  return applied
}

function planMarkdown(refs: { current: string; legacy: string }, plans: TablePlan[], apply: boolean): string {
  const lines: string[] = []
  lines.push(`# Legacy → current migration ${apply ? 'APPLIED' : 'PLAN (dry run)'}`, '')
  lines.push(`> Current: ${refs.current} · Legacy: ${refs.legacy}. ${apply ? 'Writes were applied to CURRENT.' : 'No writes — dry run.'} Egress-safe streaming.`, '')
  const totalFills = plans.reduce((a, p) => a + p.fills.length, 0)
  const totalRestore = plans.reduce((a, p) => a + p.restores.length, 0)
  const totalAmbiguous = plans.reduce((a, p) => a + p.ambiguous, 0)
  lines.push(`- Rows with empty fields to fill: **${totalFills}**`)
  lines.push(`- Missing manual rows to restore: **${totalRestore}**`)
  lines.push(`- Ambiguous (blocked): **${totalAmbiguous}**`, '')
  lines.push('| table | fills | restores | ambiguous |', '| --- | ---: | ---: | ---: |')
  for (const p of plans) lines.push(`| ${p.table} | ${p.fills.length} | ${p.restores.length} | ${p.ambiguous} |`)
  lines.push('', '## Rollback', '',
    'Fills recorded real before-values (`migration-report.json → fillRollback[].before`); revert by writing those values back for each id.',
    'Restores recorded ONLY actually-inserted rows (`restored[].id`); revert by deleting exactly those ids. No pre-existing row is ever deleted.', '')
  return lines.join('\n')
}

// Abort APPLY unless the live current project matches BOTH the --current-ref flag
// and the audited project ref (from a prior audit-report.json, when present).
function verifyRef(env: ReturnType<typeof loadEnv>, args: Args): string | null {
  const liveRef = projectRef(env.current.url)
  if (!args.currentRef) return 'APPLY requires --current-ref=<current project ref> (explicit confirmation).'
  if (args.currentRef !== liveRef) return `--current-ref (${args.currentRef}) does not match the live current project ref.`
  const auditPath = resolve(ARTIFACT_DIR, 'audit-report.json')
  if (existsSync(auditPath)) {
    try {
      const audit = JSON.parse(readFileSync(auditPath, 'utf8')) as { refs?: { current?: string } }
      if (audit.refs?.current && audit.refs.current !== sanitizeRef(env.current.url)) {
        return `audited project ref (${audit.refs.current}) != live current ref (${sanitizeRef(env.current.url)}). Re-audit before applying.`
      }
    } catch { /* unreadable audit → rely on --current-ref only */ }
  }
  return null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let env
  try { env = loadEnv() } catch (e) {
    process.stderr.write(`\n[migrate-legacy] FATAL: ${e instanceof Error ? e.message : String(e)}\n\n`); process.exit(1)
  }
  if (args.apply && args.confirm !== APPLY_CONFIRM_TOKEN) {
    process.stderr.write(`\n[migrate-legacy] REFUSED: --apply requires --confirm=${APPLY_CONFIRM_TOKEN}\n\n`); process.exit(1)
  }
  if (args.apply) {
    const refErr = verifyRef(env, args)
    if (refErr) { process.stderr.write(`\n[migrate-legacy] REFUSED: ${refErr}\n\n`); process.exit(1) }
  }

  const current = makeClient(env.current)
  const legacy = makeClient(env.legacy)
  const refs = { current: sanitizeRef(env.current.url), legacy: sanitizeRef(env.legacy.url) }
  process.stdout.write(`[migrate-legacy] ${args.apply ? 'APPLY' : 'DRY RUN'} · ${refs.legacy} → ${refs.current}\n`)

  // Plan (read-only stream) for every table first.
  const plans: TablePlan[] = []
  for (const cfg of TABLES) {
    process.stdout.write(`  • planning ${cfg.table}…\n`)
    plans.push(await planTable(current, legacy, cfg))
  }

  writeArtifact('migration-plan.md', planMarkdown(refs, plans, args.apply))
  writeArtifact('migration-plan.json', { mode: args.apply ? 'APPLY' : 'DRY RUN', refs, plans })

  if (!args.apply) {
    process.stdout.write(`\n[migrate-legacy] DRY RUN complete. Plan in audit/legacy-catalog/. No writes.\n`)
    process.stdout.write(`[migrate-legacy] To apply: node scripts/migrate-legacy-catalog.ts --apply --confirm=${APPLY_CONFIRM_TOKEN} --current-ref=${projectRef(env.current.url) || '<ref>'}\n`)
    return
  }

  // Abort APPLY if the plan references ambiguous records (unless overridden).
  const totalAmbiguous = plans.reduce((a, p) => a + p.ambiguous, 0)
  if (totalAmbiguous > 0 && !args.allowAmbiguous) {
    process.stderr.write(`\n[migrate-legacy] REFUSED: ${totalAmbiguous} ambiguous records in plan. Resolve them or pass --allow-ambiguous.\n\n`)
    process.exit(1)
  }

  const applied: Applied[] = []
  for (const cfg of TABLES) {
    const plan = plans.find((p) => p.table === cfg.table)!
    process.stdout.write(`  • applying ${cfg.table}…\n`)
    applied.push(await applyTable(current, cfg, plan))
  }
  writeArtifact('migration-report.json', { mode: 'APPLY', refs, appliedAt: new Date().toISOString(), applied })
  const fills = applied.reduce((a, r) => a + r.filledRows, 0)
  const restores = applied.reduce((a, r) => a + r.restored.length, 0)
  const errors = applied.reduce((a, r) => a + r.errors.length, 0)
  process.stdout.write(`\n[migrate-legacy] APPLIED: filled ${fills} rows, restored ${restores} rows, ${errors} errors.\n`)
  process.stdout.write(`[migrate-legacy] rollback data: audit/legacy-catalog/migration-report.json\n`)
}

main().catch((e) => {
  process.stderr.write(`\n[migrate-legacy] ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`); process.exit(1)
})
