/**
 * migrate-from-old-supabase.ts — copy data from the OLD Supabase project to the
 * NEW one, IF the old service-role credentials are ever recovered.
 *
 * ⚠️ DO NOT RUN NOW. The old project is currently inaccessible. This exists so a
 * future recovery is a one-liner. It is additive (upsert) and never deletes.
 *
 * Required env vars (never hard-coded, never logged):
 *   OLD_SUPABASE_URL
 *   OLD_SUPABASE_SERVICE_ROLE_KEY
 *   NEW_SUPABASE_URL
 *   NEW_SUPABASE_SERVICE_ROLE_KEY
 *
 * Flags:
 *   --catalog     also copy catalog tables (catalog_categories, catalog_products,
 *                 supplier_products) — large; off by default
 *   --dry         read + count only, write nothing
 *
 * Run (only once old creds return):
 *   OLD_SUPABASE_URL=... OLD_SUPABASE_SERVICE_ROLE_KEY=... \
 *   NEW_SUPABASE_URL=... NEW_SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm dlx tsx scripts/migrate-from-old-supabase.ts --dry
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Booking/operational tables always copied. `conflict` is the unique key used
// for upsert so re-running is safe (no duplicates).
const CORE_TABLES: { name: string; conflict: string }[] = [
  { name: 'services', conflict: 'slug' },
  { name: 'bookings', conflict: 'id' },
  { name: 'booking_blocks', conflict: 'id' },
  { name: 'inquiries', conflict: 'id' },
  { name: 'site_settings', conflict: 'id' },
  { name: 'reviews', conflict: 'id' },
]

// Optional, large — only with --catalog.
const CATALOG_TABLES: { name: string; conflict: string }[] = [
  { name: 'supplier_categories', conflict: 'supplier_id' },
  { name: 'supplier_products', conflict: 'supplier_sku' },
  { name: 'catalog_categories', conflict: 'slug' },
  { name: 'catalog_products', conflict: 'slug' },
]

const PAGE_SIZE = 500
const MAX_ROWS = 100_000

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    return `${u.protocol}//${u.host}`
  } catch {
    return raw.trim().replace(/\/+$/, '')
  }
}

async function readAll(client: SupabaseClient, table: string): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, MAX_ROWS) - 1
    const { data, error } = await client.from(table).select('*').range(from, to)
    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (error.code === '42P01' || msg.includes('does not exist')) return null // missing — skip
      throw new Error(`read ${table}: ${error.message}`)
    }
    if (!data || data.length === 0) break
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

async function upsertAll(
  client: SupabaseClient,
  table: string,
  conflict: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const chunk = rows.slice(i, i + PAGE_SIZE)
    const { error } = await client.from(table).upsert(chunk, { onConflict: conflict })
    if (error) throw new Error(`write ${table}: ${error.message}`)
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))
  const dry = args.has('--dry')
  const includeCatalog = args.has('--catalog')

  const oldClient = createClient(
    normalizeUrl(requireEnv('OLD_SUPABASE_URL')),
    requireEnv('OLD_SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const newClient = createClient(
    normalizeUrl(requireEnv('NEW_SUPABASE_URL')),
    requireEnv('NEW_SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const tables = includeCatalog ? [...CORE_TABLES, ...CATALOG_TABLES] : CORE_TABLES
  console.log(`Mode: ${dry ? 'DRY RUN (no writes)' : 'COPY'}${includeCatalog ? ' + catalog' : ''}\n`)

  for (const { name, conflict } of tables) {
    const rows = await readAll(oldClient, name)
    if (rows === null) {
      console.warn(`! ${name}: not found in OLD project — skipped`)
      continue
    }
    if (dry) {
      console.log(`~ ${name}: ${rows.length} rows (would upsert on "${conflict}")`)
      continue
    }
    await upsertAll(newClient, name, conflict, rows)
    console.log(`✓ ${name}: copied ${rows.length} rows`)
  }

  console.log('\nDone.')
}

main().catch((e: unknown) => {
  console.error('migrate-from-old-supabase failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
