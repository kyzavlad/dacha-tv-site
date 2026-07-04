/**
 * export-seo-ai-candidates.ts — fetch AI SEO candidates and write them as JSON.
 *
 * Thin CLI wrapper over GET /api/admin/seo/ai-candidates (read-only). Useful for
 * feeding an offline AI run or inspecting exactly what n8n would receive.
 *
 * Env:
 *   SEO_SITE_URL   (or SITE_URL)   e.g. https://dachatv.com   [default http://localhost:3000]
 *   CRON_SECRET
 *
 * Args:
 *   --limit=100          how many candidates (1–500, default 100)
 *   --out=candidates.json  write to a file instead of stdout
 *
 * Run:
 *   SEO_SITE_URL=https://dachatv.com CRON_SECRET=... \
 *     pnpm dlx tsx scripts/export-seo-ai-candidates.ts --limit=50 --out=candidates.json
 */

import { writeFileSync } from 'node:fs'

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
  const limit = Number(arg('limit') ?? 100) || 100
  const out = arg('out')

  const res = await fetch(`${baseUrl()}/api/admin/seo/ai-candidates?limit=${limit}`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  if (!res.ok) { console.error(`✗ HTTP ${res.status} ${res.statusText}`); process.exit(1) }
  const d = await res.json() as Record<string, any>

  const json = JSON.stringify(d, null, 2)
  if (out) {
    writeFileSync(out, json)
    console.error(`✓ Wrote ${d.count ?? 0} candidates to ${out}`)
  } else {
    console.log(json)
    console.error(`✓ ${d.count ?? 0} candidates`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
