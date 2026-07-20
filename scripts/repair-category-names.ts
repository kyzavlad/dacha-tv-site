// ─── repair-category-names.ts — one-time deterministic category-name repair ───
// Renames catalog_categories whose name is numeric/code-like, using the REAL
// human name from supplier_categories (populated from the supplier YML/XML feed
// by the daily cron). Maps by the stable supplier key
// (catalog_categories.supplier_category_id = supplier_categories.supplier_id).
// Applies ONLY exact, unambiguous, valid mappings; never touches source='manual'
// or already-valid names. DRY-RUN by default; APPLY needs --apply --current-ref.
// Writes a report + rollback artifact. The public slug is deliberately preserved:
// catalog_products.category_slug references it, so renaming the slug here would
// orphan products unless performed as a separate transactional migration.
//
//   Dry run: node scripts/repair-category-names.ts
//   Apply:   node scripts/repair-category-names.ts --apply --current-ref=<ref>

import { loadCurrentEnv, makeClient, sanitizeRef, projectRef, parseArgs, verifyApply, readAll, writeArtifact, log, fail } from './lib/current.ts'

function isCodeLike(name: string | null | undefined): boolean {
  const n = (name ?? '').trim()
  if (!n) return true
  if (/^\d+$/.test(n)) return true
  if (/^(cat|category|categoria|id|c|k)[-_ ]?\d+$/i.test(n)) return true
  if (!/\p{L}{2,}/u.test(n)) return true
  return false
}

interface Cat { id: string; supplier_category_id: string | null; name_ua: string | null; slug: string | null; source: string | null }
interface Sup { supplier_id: string; name: string | null; name_ua: string | null }

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let env
  try { env = loadCurrentEnv() } catch (e) { fail(e instanceof Error ? e.message : String(e)) }
  const refErr = verifyApply(env, args)
  if (refErr) fail(refErr)

  const client = makeClient(env)
  log(`[repair-names] ${args.apply ? 'APPLY' : 'DRY RUN'} · ${sanitizeRef(env.url)}`)

  const cats = await readAll<Cat>(client, 'catalog_categories', 'id, supplier_category_id, name_ua, slug, source')
  const sups = await readAll<Sup>(client, 'supplier_categories', 'supplier_id, name, name_ua')
  const supMap = new Map<string, Sup>()
  for (const s of sups) if (s.supplier_id) supMap.set(String(s.supplier_id), s)

  const proposals: { id: string; supplier_id: string | null; from: string | null; to: string; slug: string | null }[] = []
  // supplier_id is unique in supplier_categories, so a code-like catalog row maps
  // to at most one source row — mappings are always exact/unambiguous here.
  let skippedManual = 0, skippedValid = 0, remainingInvalid = 0

  for (const c of cats) {
    if (!isCodeLike(c.name_ua)) { skippedValid++; continue }        // already a real name
    if (c.source === 'manual') { skippedManual++; continue }        // never touch manual
    const sup = c.supplier_category_id ? supMap.get(String(c.supplier_category_id)) : undefined
    const real = ((sup?.name_ua || sup?.name) ?? '').trim()
    if (!sup || !real || isCodeLike(real)) { remainingInvalid++; continue } // no valid deterministic source → skip
    // Exact + unambiguous. Keep the existing slug because products reference
    // catalog categories by category_slug rather than category id.
    proposals.push({ id: c.id, supplier_id: c.supplier_category_id, from: c.name_ua, to: real, slug: c.slug })
  }

  log(`[repair-names] ${cats.length} categories · propose ${proposals.length} renames · skipped valid ${skippedValid}, manual ${skippedManual}, remaining-invalid ${remainingInvalid}`)
  for (const p of proposals.slice(0, 50)) log(`  • ${p.id} (sup ${p.supplier_id}): ${JSON.stringify(p.from)} → ${JSON.stringify(p.to)} [slug preserved: ${p.slug}]`)
  writeArtifact('category-name-repair-plan.json', { mode: args.apply ? 'APPLY' : 'DRY RUN', ref: sanitizeRef(env.url), counts: { categories: cats.length, propose: proposals.length, skippedValid, skippedManual, remainingInvalid }, proposals })

  if (!args.apply) {
    log(`\n[repair-names] DRY RUN complete. No writes. To apply:`)
    log(`  pnpm repair:category-names -- --apply --current-ref=${projectRef(env.url) || '<ref>'}`)
    return
  }

  const rollback: { id: string; before: { name_ua: string | null } }[] = []
  let repaired = 0
  const errors: string[] = []
  const catById = new Map(cats.map((c) => [c.id, c]))
  for (const p of proposals) {
    const cur = catById.get(p.id)!
    const { error } = await client.from('catalog_categories').update({ name_ua: p.to, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (error) { errors.push(`${p.id}: ${error.message}`); continue }
    repaired++
    rollback.push({ id: p.id, before: { name_ua: cur.name_ua } })
  }

  writeArtifact('category-name-repair-report.json', { mode: 'APPLY', ref: sanitizeRef(env.url), appliedAt: new Date().toISOString(), repaired, errors, rollback })
  log(`\n[repair-names] APPLIED: repaired ${repaired}, ${errors.length} errors. Rollback: audit/catalog-v3/category-name-repair-report.json`)
}

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)))
