// ─── diagnose-catalog.ts — READ-ONLY production diagnostics ───────────────────
// Bounded, read-only snapshot for the catalog/category/metal/supplier-sync state.
// Never reads the full 105k product table (HEAD counts + small selects only).
// Writes a JSON + Markdown report. Never writes to the DB; never prints keys.
//
//   pnpm diagnose:catalog

import { loadCurrentEnv, makeClient, sanitizeRef, readAll, writeArtifact, log, fail } from './lib/current.ts'

const METAL_CATEGORY_SLUG = 'metaloprofil-pokrivlia-komplektuiuchi'

// Mirror of lib/catalog/category-fallback.ts isCodeLikeCategoryName (kept inline
// so the script stays self-contained).
function isCodeLike(name: string | null | undefined): boolean {
  const n = (name ?? '').trim()
  if (!n) return true
  if (/^\d+$/.test(n)) return true
  if (/^(cat|category|categoria|id|c|k)[-_ ]?\d+$/i.test(n)) return true
  if (!/\p{L}{2,}/u.test(n)) return true
  return false
}

async function main() {
  let env
  try { env = loadCurrentEnv() } catch (e) { fail(e instanceof Error ? e.message : String(e)) }
  const client = makeClient(env)
  log(`[diagnose] read-only · ${sanitizeRef(env.url)}`)

  // Categories — bounded full read (hundreds of rows), analyzed in memory.
  const cats = await readAll<{ id: string; name_ua: string | null; source: string | null; description: string | null; is_published: boolean }>(
    client, 'catalog_categories', 'id, name_ua, source, description, is_published',
  )
  const bySource: Record<string, number> = {}
  for (const c of cats) bySource[c.source ?? 'null'] = (bySource[c.source ?? 'null'] ?? 0) + 1
  const categories = {
    total: cats.length,
    published: cats.filter((c) => c.is_published).length,
    codeLikeNames: cats.filter((c) => isCodeLike(c.name_ua)).length,
    publishedCodeLikeNames: cats.filter((c) => c.is_published && isCodeLike(c.name_ua)).length,
    emptyShortDescription: cats.filter((c) => !(c.description ?? '').trim()).length,
    publishedEmptyShortDescription: cats.filter((c) => c.is_published && !(c.description ?? '').trim()).length,
    bySource,
  }

  // Metal rows.
  const { data: metalData, error: metalErr } = await client
    .from('catalog_products')
    .select('id, name_ua, slug, source, lead_type, inquiry_only, status, price_uah')
    .or(`category_slug.eq.${METAL_CATEGORY_SLUG},lead_type.eq.metal`)
    .limit(1000)
  const metalRows = (metalData ?? []) as Array<{ id: string; source: string | null; lead_type: string | null; inquiry_only: boolean | null; status: string }>
  const metal = {
    total: metalRows.length,
    error: metalErr?.message ?? null,
    sourceManual: metalRows.filter((r) => r.source === 'manual').length,
    leadTypeMetal: metalRows.filter((r) => r.lead_type === 'metal').length,
    inquiryOnly: metalRows.filter((r) => r.inquiry_only === true).length,
    published: metalRows.filter((r) => r.status === 'published').length,
    rows: metalData ?? [],
  }

  // supplier_sync_state.
  const { data: stateData, error: stateError } = await client.from('supplier_sync_state').select('*').limit(10)

  // Latest supplier_sync_log per sync_type.
  const { data: logData, error: logError } = await client
    .from('supplier_sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(40)
  const latestByType: Record<string, unknown> = {}
  for (const row of (logData ?? []) as Array<{ sync_type: string }>) {
    if (!latestByType[row.sync_type]) latestByType[row.sync_type] = row
  }

  const report = {
    ref: sanitizeRef(env.url),
    generatedFrom: 'real read-only execution',
    categories,
    metal,
    syncState: stateData ?? [],
    latestSyncLogByType: latestByType,
    syncReadErrors: {
      state: stateError?.message ?? null,
      log: logError?.message ?? null,
    },
  }
  const jsonPath = writeArtifact('diagnostics.json', report)

  const md: string[] = ['# Catalog diagnostics (read-only)', '', `> ${sanitizeRef(env.url)} — no writes.`, '', '## Categories']
  md.push(`- total: ${categories.total} · published: ${categories.published}`)
  md.push(`- code-like names: ${categories.codeLikeNames} (published: ${categories.publishedCodeLikeNames})`)
  md.push(`- empty short descriptions: ${categories.emptyShortDescription} (published: ${categories.publishedEmptyShortDescription})`)
  md.push(`- by source: ${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join(', ')}`, '')
  md.push('## Metal products')
  md.push(`- total: ${metal.total} · source=manual: ${metal.sourceManual} · lead_type=metal: ${metal.leadTypeMetal} · inquiry_only: ${metal.inquiryOnly} · published: ${metal.published}`, '')
  md.push(
    '## Supplier sync',
    `- state rows: ${(stateData ?? []).length}`,
    `- sync_type latest: ${Object.keys(latestByType).join(', ') || 'none'}`,
    `- state read error: ${stateError?.message ?? 'none'}`,
    `- log read error: ${logError?.message ?? 'none'}`,
    '',
  )
  const mdPath = writeArtifact('diagnostics.md', md.join('\n'))

  log(`[diagnose] categories total=${categories.total} published=${categories.published} codeLike=${categories.codeLikeNames} emptyDesc=${categories.emptyShortDescription}`)
  log(`[diagnose] metal total=${metal.total} manual=${metal.sourceManual} metalLead=${metal.leadTypeMetal} inquiryOnly=${metal.inquiryOnly}`)
  log(`[diagnose] artifacts: ${jsonPath}, ${mdPath}`)
}

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)))
