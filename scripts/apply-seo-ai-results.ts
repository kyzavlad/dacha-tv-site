/**
 * apply-seo-ai-results.ts — POST a JSON batch of AI SEO results to the apply API.
 *
 * Thin CLI wrapper over POST /api/admin/seo/apply-ai-batch. Every field is
 * validated server-side (Ukrainian language, length, no forbidden phrases,
 * non-empty description); human-authored/locked SEO is never overwritten.
 *
 * Env:
 *   SEO_SITE_URL   (or SITE_URL)   e.g. https://dachatv.com   [default http://localhost:3000]
 *   CRON_SECRET
 *
 * Args:
 *   --in=results.json   file with { "items": [...] } OR a bare [...] array   (required)
 *   --dry               validate + report, write nothing
 *
 * Item shape:
 *   { "sku"|"id": "...", "meta_title"?: "...", "meta_description"?: "...",
 *     "description"?: "...", "keywords"?: "..." }
 *
 * Run:
 *   SEO_SITE_URL=https://dachatv.com CRON_SECRET=... \
 *     pnpm dlx tsx scripts/apply-seo-ai-results.ts --in=results.json --dry
 */

import { readFileSync } from 'node:fs'

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}
function baseUrl(): string {
  return (process.env.SEO_SITE_URL || process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

async function main(): Promise<void> {
  const secret = process.env.CRON_SECRET
  if (!secret) { console.error('✗ CRON_SECRET is required'); process.exit(1) }
  const inFile = arg('in')
  if (!inFile) { console.error('✗ --in=<results.json> is required'); process.exit(1) }
  const dryRun = hasFlag('dry')

  const parsed = JSON.parse(readFileSync(inFile, 'utf8')) as unknown
  const items = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items
  if (!Array.isArray(items)) { console.error('✗ Input must be an array or { items: [...] }'); process.exit(1) }

  const res = await fetch(`${baseUrl()}/api/admin/seo/apply-ai-batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, dryRun }),
  })
  const d = await res.json() as Record<string, any>
  console.log(JSON.stringify(d, null, 2))
  if (!res.ok || d.ok === false) process.exit(1)
  console.error(`✓ ${dryRun ? 'DRY RUN' : 'Applied'}: updated=${d.updated} skipped=${d.skipped} invalid=${d.invalid} errors=${d.errors}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
