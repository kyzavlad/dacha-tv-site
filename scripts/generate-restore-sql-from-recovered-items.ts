/**
 * generate-restore-sql-from-recovered-items.ts — turn scraped old items into
 * idempotent INSERT statements for the NEW schema, by section.
 *
 * Input:  backups/recovered-old-items.json   (from scrape-old-public-items.ts)
 * Output: backups/restore-old-manual-content.sql  (review before running!)
 *         backups/recovered-items-review.md        (ambiguous / manual-mapping items)
 *
 * Mapping (confident → SQL, ambiguous → review file):
 *   services  → services
 *   honey     → honey_products
 *   flowers   → flower_products
 *   beekeeper → beekeeper_products
 *   products / catalog / unknown → review file (target table needs a human call;
 *     these are usually catalog_products(source='manual') and need a category)
 *
 * Run:
 *   pnpm dlx tsx scripts/generate-restore-sql-from-recovered-items.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const IN_PATH = join(process.cwd(), 'backups', 'recovered-old-items.json')
const SQL_PATH = join(process.cwd(), 'backups', 'restore-old-manual-content.sql')
const REVIEW_PATH = join(process.cwd(), 'backups', 'recovered-items-review.md')

type Section = 'honey' | 'flowers' | 'products' | 'beekeeper' | 'services' | 'catalog' | 'unknown'

interface ScrapedItem {
  title: string | null
  slug: string
  section: Section
  href: string
  description: string | null
  price: string | null
  priceUah: number | null
  image: string | null
  sourceUrl: string
  ok: boolean
}
interface InputFile { items: ScrapedItem[] }

// SQL literal helpers — single-quote escaping; never interpolate raw input.
function s(v: string | null | undefined): string {
  if (v == null || v === '') return 'null'
  // Collapse whitespace and drop control/backslash chars, then double single
  // quotes for SQL. Spaces and normal punctuation are PRESERVED.
  const cleaned = String(v).replace(/[\u0000-\u001f\\]/g, ' ').replace(/\s+/g, ' ').trim()
  return "'" + cleaned.replace(/'/g, "''") + "'"
}
function num(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? String(Math.round(v)) : 'null'
}
function isUsableSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/i.test(slug) && slug.length >= 2 && slug.length <= 120
}

// Per-section INSERT builders. All are ON CONFLICT (slug) DO NOTHING so they
// never overwrite anything an admin re-created manually.
function sqlServices(it: ScrapedItem): string {
  return `insert into services (name, slug, short_description, description, price_uah, price_note, status, is_featured, display_order)
values (${s(it.title ?? it.slug)}, ${s(it.slug)}, ${s(it.description)}, ${s(it.description)}, ${num(it.priceUah)}, ${s(it.price)}, 'active', false, 100)
on conflict (slug) do nothing;`
}
function sqlHoney(it: ScrapedItem): string {
  return `insert into honey_products (name, slug, variety, description, image_url, in_stock, display_order)
values (${s(it.title ?? it.slug)}, ${s(it.slug)}, ${s(it.title ?? 'Мед')}, ${s(it.description)}, ${s(it.image)}, true, 100)
on conflict (slug) do nothing;`
}
function sqlFlowers(it: ScrapedItem): string {
  return `insert into flower_products (name, slug, category, short_description, full_description, price_uah, image_url, in_stock, display_order)
values (${s(it.title ?? it.slug)}, ${s(it.slug)}, 'chrysanthemum', ${s(it.description)}, ${s(it.description)}, ${num(it.priceUah)}, ${s(it.image)}, true, 100)
on conflict (slug) do nothing;`
}
function sqlBeekeeper(it: ScrapedItem): string {
  return `insert into beekeeper_products (name, slug, product_type, description, image_url, display_order)
values (${s(it.title ?? it.slug)}, ${s(it.slug)}, 'supply', ${s(it.description)}, ${s(it.image)}, 100)
on conflict (slug) do nothing;`
}

function main(): void {
  if (!existsSync(IN_PATH)) {
    console.error(`Missing ${IN_PATH}. Run scripts/scrape-old-public-items.ts first.`)
    process.exit(1)
  }
  let input: InputFile
  try {
    input = JSON.parse(readFileSync(IN_PATH, 'utf8')) as InputFile
  } catch (e) {
    console.error(`Could not read/parse ${IN_PATH} (is it valid JSON?):`, e instanceof Error ? e.message : e)
    process.exit(1)
  }
  const items = (input.items ?? []).filter((it) => it.ok && isUsableSlug(it.slug))

  const sqlLines: string[] = [
    '-- restore-old-manual-content.sql',
    '-- Generated from backups/recovered-old-items.json. REVIEW before running.',
    '-- All statements are ON CONFLICT (slug) DO NOTHING — safe to re-run, never',
    '-- overwrites manually re-created rows. Prices/descriptions are best-effort',
    '-- scrapes from old public pages; verify a few before trusting the batch.',
    `-- Generated at: ${new Date().toISOString()}`,
    '',
    '-- Self-contained: ensure the target tables exist (the new-project rebuild',
    '-- migration does not create these legacy manual-content tables). These are',
    '-- the canonical columns; the full schema also lives in migration',
    '-- 20260629_manual_content_tables.sql. Safe no-op if already created.',
    "create table if not exists honey_products (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, variety text not null default 'Мед', description text, image_url text, in_stock boolean default true, display_order int default 10, created_at timestamptz default now(), updated_at timestamptz default now());",
    "create table if not exists flower_products (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, category text not null default 'chrysanthemum', short_description text, full_description text, price_uah numeric(10,2), image_url text, in_stock boolean default true, display_order int default 10, created_at timestamptz default now(), updated_at timestamptz default now());",
    "create table if not exists beekeeper_products (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, product_type text not null default 'supply', description text, image_url text, display_order int default 10, created_at timestamptz default now(), updated_at timestamptz default now());",
    '',
  ]
  const reviewLines: string[] = [
    '# Recovered items — manual mapping review',
    '',
    'These items could not be mapped to a target table with confidence and need a',
    'human decision. The most likely target for `products` / `catalog` items is',
    '`catalog_products` with `source = \'manual\'` and a `category_slug` — that needs',
    'a category chosen per item, so they are listed here instead of auto-generated.',
    '',
  ]

  const counts: Record<string, number> = { services: 0, honey: 0, flowers: 0, beekeeper: 0, review: 0, skipped: 0 }

  const grouped: Record<string, string[]> = { services: [], honey: [], flowers: [], beekeeper: [] }
  const reviewItems: ScrapedItem[] = []

  for (const it of items) {
    switch (it.section) {
      case 'services': grouped.services.push(sqlServices(it)); counts.services++; break
      case 'honey': grouped.honey.push(sqlHoney(it)); counts.honey++; break
      case 'flowers': grouped.flowers.push(sqlFlowers(it)); counts.flowers++; break
      case 'beekeeper': grouped.beekeeper.push(sqlBeekeeper(it)); counts.beekeeper++; break
      default: reviewItems.push(it); counts.review++; break
    }
  }

  const section = (title: string, lines: string[]): void => {
    if (lines.length === 0) return
    sqlLines.push(`-- ── ${title} (${lines.length}) ──`, ...lines, '')
  }
  section('services → services', grouped.services)
  section('honey → honey_products', grouped.honey)
  section('flowers → flower_products', grouped.flowers)
  section('beekeeper → beekeeper_products', grouped.beekeeper)

  if (reviewItems.length > 0) {
    reviewLines.push('| section | slug | title | price | suggested target | source |', '| --- | --- | --- | --- | --- | --- |')
    for (const it of reviewItems) {
      const target = it.section === 'products' || it.section === 'catalog'
        ? `catalog_products (source='manual', category_slug=?)`
        : 'choose table'
      reviewLines.push(
        `| ${it.section} | ${it.slug} | ${(it.title ?? '').replace(/\|/g, '/')} | ${it.price ?? ''} | ${target} | ${it.sourceUrl} |`,
      )
    }
    reviewLines.push(
      '',
      '## Suggested template for a manual catalog product',
      '',
      '```sql',
      "insert into catalog_products (name_ua, slug, category_slug, price_uah, source, status, main_image_url, short_description)",
      "values ('<NAME>', '<slug>', '<category_slug>', <price_or_null>, 'manual', 'published', '<image_or_null>', '<desc_or_null>')",
      'on conflict (slug) do nothing;',
      '```',
    )
  } else {
    reviewLines.push('_No ambiguous items — everything mapped to a table._')
  }

  writeFileSync(SQL_PATH, sqlLines.join('\n') + '\n', 'utf8')
  writeFileSync(REVIEW_PATH, reviewLines.join('\n') + '\n', 'utf8')

  console.log('Generated:')
  console.log(`  ${SQL_PATH}`)
  console.log(`  ${REVIEW_PATH}`)
  console.log(`Counts: ${JSON.stringify(counts)}`)
  console.log('\nReview both files. Run the SQL in the Supabase SQL Editor only after a spot-check.')
}

main()
