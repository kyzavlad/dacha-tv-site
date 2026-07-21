// ─── fill-metal-content.ts — complete UA/RU/EN content for the 11 metal rows ──
// Bounded to the 11 known metal slugs (lib/catalog/metal-content.ts). DRY-RUN by
// default; APPLY requires --apply AND --current-ref=<liveref>. PRESERVES every
// non-empty existing value and fills ONLY empty/missing fields. Never invents
// specs (unknown characteristics stay empty and are listed for manual entry).
// Enforces the metal invariants (source=manual, lead_type=metal, inquiry_only).
// Writes a dry-run report (JSON + Markdown) and, on apply, a rollback artifact.
//
//   Dry run: node scripts/fill-metal-content.ts        (or: npx tsx scripts/fill-metal-content.ts)
//   Apply:   node scripts/fill-metal-content.ts --apply --current-ref=<ref>

import {
  loadCurrentEnv, makeClient, sanitizeRef, projectRef, parseArgs, verifyApply,
  writeArtifact, log, fail,
} from './lib/current.ts'
import {
  METAL_CONTENT, METAL_CONTENT_SLUGS, METAL_UNKNOWN_SPECS, METAL_CHARACTERISTIC_FIELDS,
  type MetalContentEntry, type LocalizedContent,
} from '../lib/catalog/metal-content.ts'

// Characteristic key → the Ukrainian attributes[] key the storefront renders
// (mirrors METAL_ATTR_FIELDS in lib/catalog/metal.ts). Keys render generically.
const CHAR_ATTR_KEY: Record<string, string> = {
  profile: 'Профіль',
  thickness: 'Товщина',
  coating: 'Покриття',
  color: 'Колір',
  width_total: 'Загальна ширина',
  width_useful: 'Корисна ширина',
  length: 'Довжина',
  manufacturer: 'Виробник',
}

const isEmpty = (v: unknown): boolean => v == null || String(v).trim() === ''

interface Change { field: string; from: unknown; to: unknown }

interface Row {
  id: string
  slug: string | null
  name_ua: string | null
  short_description: string | null
  description: string | null
  description_ua: string | null
  seo_description: string | null
  meta_title: string | null
  meta_description: string | null
  seo_keywords: string | null
  main_image_url: string | null
  main_image_alt: string | null
  images: string[] | null
  image_metadata: unknown
  attributes: Record<string, unknown> | null
  source: string | null
  lead_type: string | null
  inquiry_only: boolean | null
}

interface TransRow {
  product_id: string
  locale: string
  name: string | null
  short_description: string | null
  description: string | null
  seo_description: string | null
  meta_title: string | null
  meta_description: string | null
  seo_keywords: string | null
}

// UA base fields to fill (only when empty). Maps metal-content → catalog_products.
function planBaseChanges(row: Row, entry: MetalContentEntry): { changes: Change[]; update: Record<string, unknown> } {
  const changes: Change[] = []
  const update: Record<string, unknown> = {}
  const ua = entry.ua
  const fill = (col: keyof Row, val: string) => {
    if (isEmpty(row[col]) && !isEmpty(val)) { changes.push({ field: col as string, from: row[col], to: val }); update[col] = val }
  }
  fill('name_ua', ua.name)
  fill('short_description', ua.short_description)
  fill('description', ua.description)
  fill('description_ua', ua.seo_description)   // editor's "Довгий SEO-текст"
  fill('seo_description', ua.seo_description)   // dedicated long-SEO column
  fill('meta_title', ua.meta_title)
  fill('meta_description', ua.meta_description)
  fill('seo_keywords', ua.seo_keywords)
  fill('main_image_alt', entry.main_image_alt.uk)

  // Characteristics → attributes (Ukrainian keys). Preserve existing keys; only
  // ADD a known spec that is missing. Never delete, never overwrite.
  const attrs: Record<string, unknown> = { ...(row.attributes ?? {}) }
  let attrsTouched = false
  for (const f of METAL_CHARACTERISTIC_FIELDS) {
    const val = entry.characteristics[f]
    const key = CHAR_ATTR_KEY[f]
    if (val != null && String(val).trim() !== '' && isEmpty(attrs[key])) {
      attrs[key] = val; attrsTouched = true
      changes.push({ field: `attributes.${key}`, from: null, to: val })
    }
  }
  if (attrsTouched) update.attributes = attrs

  // image_metadata: build from existing imagery ONLY when absent, so alt text is
  // attached without disturbing main_image_url/images.
  const existingMeta = Array.isArray(row.image_metadata) ? row.image_metadata : []
  if (existingMeta.length === 0) {
    const urls = [row.main_image_url, ...(row.images ?? [])]
      .filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    const deduped = [...new Set(urls)]
    if (deduped.length > 0) {
      const meta = deduped.map((url, i) => ({
        url,
        alt: i === 0 ? entry.main_image_alt.uk : entry.gallery_alt_pattern.uk.replace('{n}', String(i + 1)),
        position: i,
        isPrimary: i === 0,
      }))
      update.image_metadata = meta
      changes.push({ field: 'image_metadata', from: `(${existingMeta.length})`, to: `(${meta.length} entries)` })
    }
  }

  // Enforce metal invariants (record only when they actually differ).
  if (row.source !== 'manual') { changes.push({ field: 'source', from: row.source, to: 'manual' }); update.source = 'manual' }
  if (row.lead_type !== 'metal') { changes.push({ field: 'lead_type', from: row.lead_type, to: 'metal' }); update.lead_type = 'metal' }
  if (row.inquiry_only !== true) { changes.push({ field: 'inquiry_only', from: row.inquiry_only, to: true }); update.inquiry_only = true }

  return { changes, update }
}

function planTranslation(existing: TransRow | undefined, content: LocalizedContent): { changes: Change[]; row: Record<string, unknown> } {
  const changes: Change[] = []
  const row: Record<string, unknown> = {}
  const map: [keyof LocalizedContent, keyof TransRow][] = [
    ['name', 'name'], ['short_description', 'short_description'], ['description', 'description'],
    ['seo_description', 'seo_description'], ['meta_title', 'meta_title'],
    ['meta_description', 'meta_description'], ['seo_keywords', 'seo_keywords'],
  ]
  for (const [src, col] of map) {
    const cur = existing ? existing[col] : null
    if (isEmpty(cur) && !isEmpty(content[src])) { changes.push({ field: col as string, from: cur, to: content[src] }); row[col] = content[src] }
  }
  return { changes, row }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  let env
  try { env = loadCurrentEnv() } catch (e) { fail(e instanceof Error ? e.message : String(e)) }
  const refErr = verifyApply(env, args)
  if (refErr) fail(refErr)

  const client = makeClient(env)
  log(`[fill-metal-content] ${args.apply ? 'APPLY' : 'DRY RUN'} · ${sanitizeRef(env.url)} · ${METAL_CONTENT_SLUGS.length} metal slugs`)

  // Read the 11 rows by slug.
  const { data: rowsData, error: readErr } = await client
    .from('catalog_products')
    .select('id, slug, name_ua, short_description, description, description_ua, seo_description, meta_title, meta_description, seo_keywords, main_image_url, main_image_alt, images, image_metadata, attributes, source, lead_type, inquiry_only')
    .in('slug', METAL_CONTENT_SLUGS)
  if (readErr) fail(`read metal rows: ${readErr.message}`)
  const rows = (rowsData ?? []) as Row[]
  const bySlug = new Map(rows.map((r) => [String(r.slug), r]))

  const missingSlugs = METAL_CONTENT_SLUGS.filter((s) => !bySlug.has(s))
  if (missingSlugs.length) log(`  ⚠ ${missingSlugs.length} slug(s) NOT found in catalog_products: ${missingSlugs.join(', ')}`)

  // Read existing ru/en translations for the found products.
  const ids = rows.map((r) => r.id)
  const { data: transData } = ids.length
    ? await client.from('catalog_product_translations')
        .select('product_id, locale, name, short_description, description, seo_description, meta_title, meta_description, seo_keywords')
        .in('product_id', ids).in('locale', ['ru', 'en'])
    : { data: [] as TransRow[] }
  const transByKey = new Map((transData as TransRow[] ?? []).map((t) => [`${t.product_id}:${t.locale}`, t]))

  const plan: Array<{ slug: string; id: string; base: Change[]; ru: Change[]; en: Change[] }> = []
  const rollback: Record<string, unknown> = {}

  for (const entry of METAL_CONTENT) {
    const row = bySlug.get(entry.slug)
    if (!row) continue
    const base = planBaseChanges(row, entry)
    const ru = planTranslation(transByKey.get(`${row.id}:ru`), entry.ru)
    const en = planTranslation(transByKey.get(`${row.id}:en`), entry.en)
    plan.push({ slug: entry.slug, id: row.id, base: base.changes, ru: ru.changes, en: en.changes })

    if (args.apply) {
      // Rollback snapshot: prior values of every field about to change.
      rollback[entry.slug] = {
        id: row.id,
        base_prior: Object.fromEntries(base.changes.map((c) => [c.field, c.from])),
        ru_prior: transByKey.get(`${row.id}:ru`) ?? null,
        en_prior: transByKey.get(`${row.id}:en`) ?? null,
      }
      // Apply base.
      if (Object.keys(base.update).length) {
        const { error } = await client.from('catalog_products').update(base.update).eq('id', row.id)
        if (error) fail(`update ${entry.slug}: ${error.message}`)
      }
      // Upsert ru/en (only when there is something to fill).
      for (const [locale, t] of [['ru', ru], ['en', en]] as const) {
        if (Object.keys(t.row).length) {
          const { error } = await client.from('catalog_product_translations')
            .upsert({ product_id: row.id, locale, ...t.row, updated_at: new Date().toISOString() }, { onConflict: 'product_id,locale' })
          if (error) fail(`upsert ${entry.slug} ${locale}: ${error.message}`)
        }
      }
    }
  }

  // ── Reports ────────────────────────────────────────────────────────────────
  const summary = plan.map((p) => ({
    slug: p.slug,
    baseFilled: p.base.length,
    ruFilled: p.ru.length,
    enFilled: p.en.length,
  }))

  const md = [
    `# Metal content fill — ${args.apply ? 'APPLIED' : 'DRY RUN'}`,
    ``,
    `Project: ${sanitizeRef(env.url)} · found ${rows.length}/${METAL_CONTENT_SLUGS.length} metal rows`,
    missingSlugs.length ? `\n**Missing slugs:** ${missingSlugs.join(', ')}\n` : '',
    `## Planned/applied changes (fields filled — empty only, existing preserved)`,
    ``,
    `| Slug | UA base | RU | EN |`,
    `| --- | ---: | ---: | ---: |`,
    ...summary.map((s) => `| ${s.slug} | ${s.baseFilled} | ${s.ruFilled} | ${s.enFilled} |`),
    ``,
    `## Unknown specifications requiring MANUAL entry (never invented)`,
    ``,
    ...METAL_UNKNOWN_SPECS.filter((u) => u.missing.length).map((u) => `- **${u.slug}**: ${u.missing.join(', ')}`),
  ].join('\n')

  const jsonPath = writeArtifact('metal-fill-dryrun.json', { apply: args.apply, project: sanitizeRef(env.url), found: rows.length, missingSlugs, plan, unknownSpecs: METAL_UNKNOWN_SPECS })
  const mdPath = writeArtifact('metal-fill-dryrun.md', md)
  log(`  report: ${jsonPath}`)
  log(`  report: ${mdPath}`)
  if (args.apply) {
    const rbPath = writeArtifact('metal-fill-rollback.json', rollback)
    log(`  rollback: ${rbPath}`)
  }

  log(`\n  Unknown specs (manual entry needed):`)
  for (const u of METAL_UNKNOWN_SPECS) if (u.missing.length) log(`    ${u.slug}: ${u.missing.join(', ')}`)
  log(`\n  ${args.apply ? 'APPLIED' : 'DRY RUN complete — re-run with --apply --current-ref=' + (projectRef(env.url) || '<ref>')}.`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
