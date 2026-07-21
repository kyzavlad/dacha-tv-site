// ─── rollback-metal-content.ts — restore metal rows from the fill rollback ────
// Reverses scripts/fill-metal-content.ts using the rollback artifact it wrote
// (audit/catalog-v3/metal-fill-rollback.json). Restores base fields, attributes,
// image_metadata, and the RU + EN translation rows to their exact prior state.
// DRY-RUN by default; APPLY requires --apply AND --current-ref=<ref>.
//
//   Dry run: npx tsx scripts/rollback-metal-content.ts
//   Apply:   npx tsx scripts/rollback-metal-content.ts --apply --current-ref=<ref>

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadCurrentEnv, makeClient, sanitizeRef, parseArgs, verifyApply, ARTIFACT_DIR, log, fail } from './lib/current.ts'

interface Snapshot {
  id: string
  base_prior: Record<string, unknown>
  ru_prior: Record<string, unknown> | null
  en_prior: Record<string, unknown> | null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let env
  try { env = loadCurrentEnv() } catch (e) { fail(e instanceof Error ? e.message : String(e)) }
  const refErr = verifyApply(env, args)
  if (refErr) fail(refErr)

  const path = resolve(ARTIFACT_DIR, 'metal-fill-rollback.json')
  let snapshot: Record<string, Snapshot>
  try { snapshot = JSON.parse(readFileSync(path, 'utf8')) } catch (e) {
    fail(`cannot read rollback artifact ${path}: ${e instanceof Error ? e.message : String(e)}`)
  }

  const client = makeClient(env)
  const slugs = Object.keys(snapshot)
  log(`[rollback-metal-content] ${args.apply ? 'APPLY' : 'DRY RUN'} · ${sanitizeRef(env.url)} · ${slugs.length} rows`)

  for (const slug of slugs) {
    const snap = snapshot[slug]
    log(`  ${slug} (${snap.id}) → restore base + ${snap.ru_prior ? 'ru' : 'ru(delete)'} + ${snap.en_prior ? 'en' : 'en(delete)'}`)
    if (!args.apply) continue

    // 1. Base fields (including attributes + image_metadata) back to prior values.
    const { error: baseErr } = await client.from('catalog_products')
      .update({ ...snap.base_prior, updated_at: new Date().toISOString() })
      .eq('id', snap.id)
    if (baseErr) fail(`restore base ${slug}: ${baseErr.message}`)

    // 2. Translation rows: restore prior state, or delete if there was none before.
    for (const [locale, prior] of [['ru', snap.ru_prior], ['en', snap.en_prior]] as const) {
      if (prior) {
        const { error } = await client.from('catalog_product_translations')
          .upsert({ ...prior, product_id: snap.id, locale, updated_at: new Date().toISOString() }, { onConflict: 'product_id,locale' })
        if (error) fail(`restore ${slug} ${locale}: ${error.message}`)
      } else {
        // No row existed before the fill → delete the one the fill created.
        const { error } = await client.from('catalog_product_translations')
          .delete().eq('product_id', snap.id).eq('locale', locale)
        if (error) fail(`delete ${slug} ${locale}: ${error.message}`)
      }
    }
  }

  log(`\n  ${args.apply ? 'ROLLBACK APPLIED' : 'DRY RUN complete — re-run with --apply --current-ref=<ref>'}.`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
