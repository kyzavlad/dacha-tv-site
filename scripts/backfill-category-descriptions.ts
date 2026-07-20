// ─── backfill-category-descriptions.ts — one-time short-description backfill ───
// Fills the SHORT intro (catalog_categories.description) for PUBLISHED categories
// that have none, using the same deterministic name-based generator the daily
// sync uses for NEW categories. Never overwrites a non-empty description, never a
// numeric/code-like name, never source='manual'. Marks generated rows
// description_auto_generated=true so legacy/hand content can replace them later.
// DRY-RUN by default; APPLY needs --apply --current-ref. Bounded batched writes.
//
//   Dry run: node scripts/backfill-category-descriptions.ts
//   Apply:   node scripts/backfill-category-descriptions.ts --apply --current-ref=<ref>

import { loadCurrentEnv, makeClient, sanitizeRef, projectRef, parseArgs, verifyApply, readAll, chunk, writeArtifact, log, fail } from './lib/current.ts'

function isCodeLike(name: string | null | undefined): boolean {
  const n = (name ?? '').trim()
  if (!n) return true
  if (/^\d+$/.test(n)) return true
  if (/^(cat|category|categoria|id|c|k)[-_ ]?\d+$/i.test(n)) return true
  if (!/\p{L}{2,}/u.test(n)) return true
  return false
}
// Mirror of lib/catalog/category-fallback.ts deterministicCategoryIntro.
function intro(nameUa: string | null | undefined): string {
  const name = (nameUa ?? '').trim().replace(/\s+/g, ' ')
  if (!name || isCodeLike(name)) return ''
  const display = name === name.toUpperCase() && name.length > 3 ? name.charAt(0) + name.slice(1).toLowerCase() : name
  return `Товари категорії «${display}» у наявності — доставка Новою Поштою по всій Україні.`
}

interface Cat { id: string; name_ua: string | null; slug: string | null; description: string | null; source: string | null; is_published: boolean }

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let env
  try { env = loadCurrentEnv() } catch (e) { fail(e instanceof Error ? e.message : String(e)) }
  const refErr = verifyApply(env, args)
  if (refErr) fail(refErr)

  const client = makeClient(env)
  log(`[backfill-desc] ${args.apply ? 'APPLY' : 'DRY RUN'} · ${sanitizeRef(env.url)}`)

  const cats = await readAll<Cat>(client, 'catalog_categories', 'id, name_ua, slug, description, source, is_published')
  const targets = cats.filter((c) => c.is_published && c.source !== 'manual' && !(c.description ?? '').trim() && intro(c.name_ua) !== '')
  const skippedNonPublished = cats.filter((c) => !c.is_published && !(c.description ?? '').trim()).length
  const skippedCodeLike = cats.filter((c) => c.is_published && !(c.description ?? '').trim() && intro(c.name_ua) === '').length

  log(`[backfill-desc] ${cats.length} categories · ${targets.length} to fill · skipped non-published ${skippedNonPublished}, code-like ${skippedCodeLike}`)
  const rows = targets.map((c) => ({ id: c.id, name_ua: c.name_ua, slug: c.slug, description: intro(c.name_ua), description_auto_generated: true, updated_at: new Date().toISOString() }))
  writeArtifact('category-description-backfill-plan.json', { mode: args.apply ? 'APPLY' : 'DRY RUN', ref: sanitizeRef(env.url), toFill: rows.length, sample: rows.slice(0, 20) })

  if (!args.apply) {
    log(`\n[backfill-desc] DRY RUN complete. No writes. To apply:`)
    log(`  pnpm backfill:category-descriptions -- --apply --current-ref=${projectRef(env.url) || '<ref>'}`)
    return
  }

  // Re-check every row at write time. This prevents a description entered by an
  // admin after the dry-run/read phase from being overwritten. Small concurrency
  // batches keep the one-time operation bounded without an N+1 public-page cost.
  const appliedIds: string[] = []
  const errors: string[] = []
  for (const part of chunk(rows, 20)) {
    const results = await Promise.all(part.map(async (row) => {
      const { data, error } = await client
        .from('catalog_categories')
        .update({
          description: row.description,
          description_auto_generated: true,
          updated_at: row.updated_at,
        })
        .eq('id', row.id)
        .or('source.is.null,source.neq.manual')
        .or('description.is.null,description.eq.')
        .select('id')
      return { row, data, error }
    }))
    for (const result of results) {
      if (result.error) errors.push(`${result.row.id}: ${result.error.message}`)
      else if ((result.data ?? []).length > 0) appliedIds.push(result.row.id)
    }
  }
  writeArtifact('category-description-backfill-report.json', {
    mode: 'APPLY',
    ref: sanitizeRef(env.url),
    appliedAt: new Date().toISOString(),
    filled: appliedIds.length,
    errors,
    ids: appliedIds,
  })
  log(`\n[backfill-desc] APPLIED: filled ${appliedIds.length}, ${errors.length} errors. Rollback: set description=NULL, description_auto_generated=false only for ids in the report.`)
}

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)))
