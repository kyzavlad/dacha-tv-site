/**
 * backup-critical.ts — export critical operational tables to a local JSON file.
 *
 * Exports bookings, services, inquiries and site_settings using the CURRENT
 * production service-role credentials. The big catalog/supplier feeds are NOT
 * included (use the /api/admin/backup/catalog-snapshot endpoint for those).
 *
 * Reads credentials from the environment (never hard-coded, never logged):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Output: backups/dachatv-critical-YYYY-MM-DD-HH-mm.json  (gitignored)
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm dlx tsx scripts/backup-critical.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CRITICAL_TABLES = ['bookings', 'services', 'inquiries', 'site_settings'] as const
const PAGE_SIZE = 1000
const MAX_ROWS = 50_000

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

// Page through a table up to MAX_ROWS. A missing table is reported, not fatal.
async function dumpTable(
  client: SupabaseClient,
  table: string,
): Promise<{ rows: Record<string, unknown>[]; missing: boolean }> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, MAX_ROWS) - 1
    const { data, error } = await client.from(table).select('*').range(from, to)
    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (error.code === '42P01' || msg.includes('does not exist')) {
        return { rows: [], missing: true }
      }
      throw new Error(`${table}: ${error.message}`)
    }
    if (!data || data.length === 0) break
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE_SIZE) break
  }
  return { rows, missing: false }
}

function stamp(): string {
  // YYYY-MM-DD-HH-mm in UTC (avoids locale ambiguity in filenames).
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}-${p(d.getUTCMinutes())}`
}

async function main(): Promise<void> {
  const url = normalizeUrl(requireEnv('NEXT_PUBLIC_SUPABASE_URL'))
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const data: Record<string, Record<string, unknown>[]> = {}
  const counts: Record<string, number> = {}
  const missingTables: string[] = []

  for (const table of CRITICAL_TABLES) {
    const { rows, missing } = await dumpTable(client, table)
    if (missing) {
      missingTables.push(table)
      console.warn(`! table missing: ${table}`)
      continue
    }
    data[table] = rows
    counts[table] = rows.length
    console.log(`✓ ${table}: ${rows.length} rows`)
  }

  const body = {
    project: 'dacha-tv-site',
    exportedAt: new Date().toISOString(),
    counts,
    missingTables,
    data,
  }

  const dir = join(process.cwd(), 'backups')
  mkdirSync(dir, { recursive: true })
  const outPath = join(dir, `dachatv-critical-${stamp()}.json`)
  writeFileSync(outPath, JSON.stringify(body, null, 2), 'utf8')
  console.log(`\nSaved → ${outPath}`)
}

main().catch((e: unknown) => {
  console.error('backup-critical failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
