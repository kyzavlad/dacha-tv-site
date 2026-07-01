/**
 * recover-old-manual-content.ts — recover OLD manual content without needing
 * .vercel/project.json.
 *
 * Strategy: old Vercel deployments have the OLD Supabase URL + anon key inlined
 * into their client JS bundles (NEXT_PUBLIC_* are build-time inlined). We harvest
 * those, then read the OLD project's public tables directly over PostgREST using
 * the anon key (honey/flowers/beekeeper/services all have public-read RLS). If a
 * table is RLS-blocked we fall back to the product links found on the pages.
 *
 * Discovery (first that works):
 *   1. RECOVER_DEPLOYMENT_URLS env — comma-separated deployment URLs/hosts.
 *   2. Vercel REST API by project NAME (VERCEL_TOKEN), team-scoped if VERCEL_TEAM_ID.
 *   3. Vercel CLI fallback: `vercel ls <project> --token <token>`.
 *
 * Env:
 *   VERCEL_TOKEN              (needed for #2/#3)
 *   VERCEL_TEAM_ID            (optional, team scope for #2)
 *   RECOVER_PROJECT           (default "dacha-tv-site")
 *   RECOVER_DEPLOYMENT_URLS   (optional explicit list, bypasses Vercel API)
 *
 * Outputs (all gitignored under backups/):
 *   backups/old-supabase-public-export/<ref>__<table>.json   (readable rows)
 *   backups/recovered-items-review.md                        (counts + samples)
 *   backups/restore-old-manual-content.sql                   (NOT auto-run)
 *
 * Run:
 *   VERCEL_TOKEN=xxx pnpm dlx tsx scripts/recover-old-manual-content.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const PROJECT = process.env.RECOVER_PROJECT || 'dacha-tv-site'
const OUT_DIR = join(process.cwd(), 'backups')
const EXPORT_DIR = join(OUT_DIR, 'old-supabase-public-export')

// Tables to probe. Manual tables get INSERTs generated; the big supplier tables
// are exported (capped) but not turned into SQL.
const MANUAL_TABLES = ['honey_products', 'apiary_products', 'beekeeper_products', 'flower_products', 'services'] as const
const BIG_TABLES = ['products', 'catalog_products'] as const
const ALL_TABLES = [...MANUAL_TABLES, ...BIG_TABLES]

// Bounds so one bad deployment can never hang the run.
const MAX_DEPLOYMENTS = 15
const MAX_JS_PER_DEPLOYMENT = 30
const FETCH_TIMEOUT_MS = 8000
const MAX_ROWS_PER_TABLE = 5000
const BIG_TABLE_ROW_CAP = 500 // export only a sample of huge tables
const PAGE = 1000

const SUPABASE_URL_RE = /https:\/\/[a-z0-9-]+\.supabase\.co/gi
const ANON_KEY_RE = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g
const SCRIPT_SRC_RE = /<script[^>]+src=["']([^"']+)["']/gi
const PRODUCT_LINK_RE = /href=["'](\/(?:honey|flowers|beekeeper|products|catalog|services)\/[a-z0-9-]+)["']/gi

async function fetchWithTimeout(url: string, init?: RequestInit, retries = 1): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    } catch {
      if (attempt === retries) return null
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
  return null
}

function hostToUrl(h: string): string {
  return h.startsWith('http') ? h.replace(/\/+$/, '') : `https://${h.replace(/\/+$/, '')}`
}

// ── Deployment discovery ────────────────────────────────────────────────────
async function discoverDeployments(): Promise<string[]> {
  const explicit = (process.env.RECOVER_DEPLOYMENT_URLS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (explicit.length > 0) {
    console.log(`Using ${explicit.length} explicit deployment URL(s) from RECOVER_DEPLOYMENT_URLS.`)
    return explicit.map(hostToUrl).slice(0, MAX_DEPLOYMENTS)
  }

  const token = process.env.VERCEL_TOKEN
  if (token) {
    const team = process.env.VERCEL_TEAM_ID
    const params = new URLSearchParams({ app: PROJECT, limit: String(MAX_DEPLOYMENTS), state: 'READY' })
    if (team) params.set('teamId', team)
    const res = await fetchWithTimeout(`https://api.vercel.com/v6/deployments?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res && res.ok) {
      const j = (await res.json()) as { deployments?: Array<{ url?: string; readyState?: string; state?: string }> }
      const urls = (j.deployments ?? [])
        .filter((d) => (d.readyState ?? d.state) === 'READY' && d.url)
        .map((d) => hostToUrl(d.url as string))
      if (urls.length > 0) {
        console.log(`Vercel REST API returned ${urls.length} READY deployment(s) for "${PROJECT}".`)
        return urls.slice(0, MAX_DEPLOYMENTS)
      }
      console.warn('Vercel REST API returned 0 deployments — trying CLI fallback.')
    } else {
      console.warn(`Vercel REST API error (${res?.status ?? 'network'}) — trying CLI fallback.`)
    }

    // CLI fallback
    try {
      const out = execFileSync('vercel', ['ls', PROJECT, '--token', token, '--yes'], {
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const urls = [...out.matchAll(/https:\/\/[a-z0-9-]+\.vercel\.app/gi)].map((m) => m[0])
      const unique = [...new Set(urls)]
      if (unique.length > 0) {
        console.log(`Vercel CLI returned ${unique.length} deployment URL(s).`)
        return unique.slice(0, MAX_DEPLOYMENTS)
      }
    } catch {
      console.warn('Vercel CLI fallback unavailable or returned nothing.')
    }
  }

  console.error(
    'No deployments discovered. Provide RECOVER_DEPLOYMENT_URLS=<url1,url2> or a valid VERCEL_TOKEN.',
  )
  return []
}

// ── Harvest supabase URL + anon key pairs + product links from a deployment ──
interface Harvest {
  supabaseUrls: Set<string>
  anonKeys: Set<string>
  productLinks: Set<string>
}

async function harvestDeployment(base: string, acc: Harvest): Promise<void> {
  const rootRes = await fetchWithTimeout(base)
  if (!rootRes || !rootRes.ok) {
    console.warn(`  ${base} — root fetch failed (${rootRes?.status ?? 'network'})`)
    return
  }
  const html = await rootRes.text()
  for (const m of html.matchAll(SUPABASE_URL_RE)) acc.supabaseUrls.add(m[0])
  for (const m of html.matchAll(ANON_KEY_RE)) acc.anonKeys.add(m[0])
  for (const m of html.matchAll(PRODUCT_LINK_RE)) acc.productLinks.add(m[1])

  const scripts = [...html.matchAll(SCRIPT_SRC_RE)]
    .map((m) => m[1])
    .filter((s) => s.endsWith('.js'))
    .map((s) => (s.startsWith('http') ? s : `${base}${s.startsWith('/') ? '' : '/'}${s}`))
  const unique = [...new Set(scripts)].slice(0, MAX_JS_PER_DEPLOYMENT)

  for (const jsUrl of unique) {
    const r = await fetchWithTimeout(jsUrl)
    if (!r || !r.ok) continue
    const text = await r.text()
    for (const m of text.matchAll(SUPABASE_URL_RE)) acc.supabaseUrls.add(m[0])
    for (const m of text.matchAll(ANON_KEY_RE)) acc.anonKeys.add(m[0])
  }
}

// ── Probe + export a table over PostgREST ───────────────────────────────────
function refOf(supabaseUrl: string): string {
  return supabaseUrl.replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '')
}

async function readTable(
  supabaseUrl: string,
  anonKey: string,
  table: string,
  cap: number,
): Promise<{ rows: Record<string, unknown>[]; status: number }> {
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
  // quick probe
  const probe = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, { headers }, 0)
  if (!probe) return { rows: [], status: 0 }
  if (!probe.ok) return { rows: [], status: probe.status }

  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < cap; from += PAGE) {
    const to = Math.min(from + PAGE, cap) - 1
    const res = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${table}?select=*`, {
      headers: { ...headers, Range: `${from}-${to}`, 'Range-Unit': 'items' },
    }, 0)
    if (!res || !res.ok) break
    const batch = (await res.json()) as Record<string, unknown>[]
    if (!Array.isArray(batch) || batch.length === 0) break
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return { rows, status: 200 }
}

// ── SQL generation for manual tables ────────────────────────────────────────
function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) {
      return `ARRAY[${v.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(', ')}]::text[]`
    }
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  }
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  const clean = String(v).replace(/[\u0000-\u001f]/g, ' ')
  return `'${clean.replace(/'/g, "''")}'`
}

const SKIP_COLS = new Set(['id', 'created_at', 'updated_at'])

function buildInserts(table: string, rows: Record<string, unknown>[]): string[] {
  const out: string[] = []
  for (const row of rows) {
    const cols = Object.keys(row).filter((c) => !SKIP_COLS.has(c) && row[c] !== undefined)
    if (cols.length === 0 || !('slug' in row)) continue
    const vals = cols.map((c) => sqlValue(row[c]))
    out.push(
      `insert into ${table} (${cols.join(', ')}) values (${vals.join(', ')}) on conflict (slug) do nothing;`,
    )
  }
  return out
}

async function main(): Promise<void> {
  mkdirSync(EXPORT_DIR, { recursive: true })

  const deployments = await discoverDeployments()
  if (deployments.length === 0) process.exit(1)

  const acc: Harvest = { supabaseUrls: new Set(), anonKeys: new Set(), productLinks: new Set() }
  for (const base of deployments) {
    console.log(`Harvesting ${base} …`)
    await harvestDeployment(base, acc)
  }

  console.log(
    `\nHarvested: ${acc.supabaseUrls.size} Supabase URL(s), ${acc.anonKeys.size} anon key(s), ${acc.productLinks.size} product link(s).`,
  )
  if (acc.supabaseUrls.size === 0 || acc.anonKeys.size === 0) {
    console.warn('No Supabase URL/anon-key pair found in the deployment bundles.')
  }

  // Try every (url, key) pair against every table; keep the first pair that reads.
  const exported: Record<string, { ref: string; count: number; sample: unknown }> = {}
  const rlsBlocked: string[] = []
  const sqlSections: string[] = []

  for (const supabaseUrl of acc.supabaseUrls) {
    const ref = refOf(supabaseUrl)
    for (const anonKey of acc.anonKeys) {
      let pairWorked = false
      for (const table of ALL_TABLES) {
        if (exported[table]) continue // already recovered from an earlier pair
        const cap = (BIG_TABLES as readonly string[]).includes(table) ? BIG_TABLE_ROW_CAP : MAX_ROWS_PER_TABLE
        const { rows, status } = await readTable(supabaseUrl, anonKey, table, cap)
        if (status === 200 && rows.length > 0) {
          pairWorked = true
          writeFileSync(join(EXPORT_DIR, `${ref}__${table}.json`), JSON.stringify(rows, null, 2), 'utf8')
          exported[table] = { ref, count: rows.length, sample: rows[0] }
          console.log(`  ✓ ${ref}/${table}: ${rows.length} rows`)
          if ((MANUAL_TABLES as readonly string[]).includes(table)) {
            const inserts = buildInserts(table, rows)
            if (inserts.length > 0) sqlSections.push(`-- ── ${table} (${inserts.length} rows from ${ref}) ──\n${inserts.join('\n')}`)
          }
        } else if (status === 401 || status === 403 || status === 404) {
          rlsBlocked.push(`${ref}/${table} (HTTP ${status})`)
        }
      }
      if (pairWorked) break // this key works for this url; don't try more keys
    }
  }

  // ── restore SQL ──
  const sqlHeader = [
    '-- restore-old-manual-content.sql',
    '-- Generated by scripts/recover-old-manual-content.ts from the OLD Supabase',
    '-- project (read via anon key harvested from old deployment bundles).',
    '-- REVIEW before running. ON CONFLICT (slug) DO NOTHING — never overwrites',
    '-- rows re-created manually. Ensure target tables exist first (migration',
    '-- 20260629_manual_content_tables.sql). NOT auto-run.',
    `-- Generated at: ${new Date().toISOString()}`,
    '',
  ]
  writeFileSync(
    join(OUT_DIR, 'restore-old-manual-content.sql'),
    sqlHeader.join('\n') + (sqlSections.length ? sqlSections.join('\n\n') + '\n' : '-- (no manual rows recovered)\n'),
    'utf8',
  )

  // ── review md ──
  const md: string[] = [
    '# Recovered old manual content — review',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Project: ${PROJECT}`,
    `Deployments scanned: ${deployments.length}`,
    `Supabase URLs found: ${[...acc.supabaseUrls].map(refOf).join(', ') || '(none)'}`,
    `Anon keys found: ${acc.anonKeys.size}`,
    '',
    '## Recovered tables',
    '',
    '| table | source ref | rows | sample name/slug |',
    '| --- | --- | --- | --- |',
  ]
  for (const [table, info] of Object.entries(exported)) {
    const s = info.sample as Record<string, unknown> | undefined
    const label = s ? String(s.name ?? s.name_ua ?? s.slug ?? '') : ''
    md.push(`| ${table} | ${info.ref} | ${info.count} | ${label.replace(/\|/g, '/').slice(0, 60)} |`)
  }
  if (Object.keys(exported).length === 0) md.push('| _(none readable)_ | | | |')
  md.push('', '## RLS-blocked / not-found probes', '')
  md.push(rlsBlocked.length ? rlsBlocked.map((r) => `- ${r}`).join('\n') : '_none_')
  md.push('', '## Product links discovered (scrape fallback if REST blocked)', '')
  const links = [...acc.productLinks].slice(0, 200)
  md.push(links.length ? links.map((l) => `- ${l}`).join('\n') : '_none_')
  if (Object.keys(exported).length === 0 && acc.productLinks.size > 0) {
    md.push(
      '',
      '> REST returned nothing readable. Use scripts/scrape-old-public-items.ts against the',
      '> discovered deployment URLs + these product links to recover content from HTML instead.',
    )
  }
  writeFileSync(join(OUT_DIR, 'recovered-items-review.md'), md.join('\n') + '\n', 'utf8')

  console.log('\nWrote:')
  console.log(`  ${EXPORT_DIR}/*.json`)
  console.log(`  ${join(OUT_DIR, 'recovered-items-review.md')}`)
  console.log(`  ${join(OUT_DIR, 'restore-old-manual-content.sql')}  (review, do NOT auto-run)`)
}

main().catch((e: unknown) => {
  console.error('recover-old-manual-content failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
