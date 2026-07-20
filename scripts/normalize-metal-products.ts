// ─── normalize-metal-products.ts — enforce metal invariants (one-time) ────────
// Ensures every metal-profile product has source='manual', lead_type='metal',
// inquiry_only=true. Preserves names, slugs, descriptions, prices, attributes,
// SEO, images, status, display order (only the three invariant fields are ever
// written, and only when they differ). DRY-RUN by default; APPLY requires
// --apply AND --current-ref=<ref>. Writes a report + rollback artifact.
//
//   Dry run: node scripts/normalize-metal-products.ts
//   Apply:   node scripts/normalize-metal-products.ts --apply --current-ref=<ref>

import { loadCurrentEnv, makeClient, sanitizeRef, projectRef, parseArgs, verifyApply, writeArtifact, log, fail } from './lib/current.ts'

const METAL_CATEGORY_SLUG = 'metaloprofil-pokrivlia-komplektuiuchi'

interface Row {
  id: string
  name_ua: string | null
  slug: string | null
  source: string | null
  lead_type: string | null
  inquiry_only: boolean | null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let env
  try { env = loadCurrentEnv() } catch (e) { fail(e instanceof Error ? e.message : String(e)) }
  const refErr = verifyApply(env, args)
  if (refErr) fail(refErr)

  const client = makeClient(env)
  log(`[normalize-metal] ${args.apply ? 'APPLY' : 'DRY RUN'} · ${sanitizeRef(env.url)}`)

  // The metal set: either the metal category OR an explicit metal lead_type.
  const { data, error } = await client
    .from('catalog_products')
    .select('id, name_ua, slug, source, lead_type, inquiry_only')
    .or(`category_slug.eq.${METAL_CATEGORY_SLUG},lead_type.eq.metal`)
    .limit(1000)
  if (error) fail(`read metal rows: ${error.message}`)
  const rows = (data ?? []) as Row[]

  const target = { source: 'manual', lead_type: 'metal', inquiry_only: true }
  const plan = rows.map((r) => {
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (r.source !== target.source) changes.source = { from: r.source, to: target.source }
    if (r.lead_type !== target.lead_type) changes.lead_type = { from: r.lead_type, to: target.lead_type }
    if (r.inquiry_only !== target.inquiry_only) changes.inquiry_only = { from: r.inquiry_only, to: target.inquiry_only }
    return { id: r.id, name_ua: r.name_ua, slug: r.slug, changes, needsUpdate: Object.keys(changes).length > 0 }
  })

  log(`[normalize-metal] found ${rows.length} metal rows; ${plan.filter((p) => p.needsUpdate).length} need normalization`)
  for (const p of plan) {
    const summary = p.needsUpdate ? Object.entries(p.changes).map(([k, v]) => `${k}: ${JSON.stringify(v.from)}→${JSON.stringify(v.to)}`).join(', ') : 'ok'
    log(`  • ${p.id} (${p.slug ?? p.name_ua}) — ${summary}`)
  }

  writeArtifact('metal-normalization-plan.json', { mode: args.apply ? 'APPLY' : 'DRY RUN', ref: sanitizeRef(env.url), count: rows.length, plan })

  if (!args.apply) {
    log(`\n[normalize-metal] DRY RUN complete. No writes. To apply:`)
    log(`  pnpm normalize:metal -- --apply --current-ref=${projectRef(env.url) || '<ref>'}`)
    return
  }

  const rollback: { id: string; before: Record<string, unknown> }[] = []
  let updated = 0
  const errors: string[] = []
  for (const p of plan) {
    if (!p.needsUpdate) continue
    const before: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(p.changes)) before[k] = v.from
    const { error: upErr } = await client
      .from('catalog_products')
      .update({ ...target, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (upErr) { errors.push(`${p.id}: ${upErr.message}`); continue }
    updated++
    rollback.push({ id: p.id, before })
  }

  writeArtifact('metal-normalization-report.json', {
    mode: 'APPLY', ref: sanitizeRef(env.url), appliedAt: new Date().toISOString(),
    affectedIds: rollback.map((r) => r.id), updated, errors, rollback,
  })
  log(`\n[normalize-metal] APPLIED: updated ${updated} rows, ${errors.length} errors.`)
  log(`[normalize-metal] rollback data: audit/catalog-v3/metal-normalization-report.json`)
}

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)))
