/**
 * seo-quality-status.ts — one-glance SEO coverage + AI-backlog dashboard.
 *
 * Thin CLI wrapper over GET /api/admin/diag/seo-quality (read-only, no mutation).
 * Exercises the exact same endpoint n8n / the browser would hit.
 *
 * Env:
 *   SEO_SITE_URL   (or SITE_URL)   e.g. https://dachatv.com   [default http://localhost:3000]
 *   CRON_SECRET
 *
 * Run:
 *   SEO_SITE_URL=https://dachatv.com CRON_SECRET=... pnpm dlx tsx scripts/seo-quality-status.ts
 */

function baseUrl(): string {
  return (process.env.SEO_SITE_URL || process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

async function main(): Promise<void> {
  const secret = process.env.CRON_SECRET
  if (!secret) { console.error('✗ CRON_SECRET is required'); process.exit(1) }

  const res = await fetch(`${baseUrl()}/api/admin/diag/seo-quality`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  if (!res.ok) { console.error(`✗ HTTP ${res.status} ${res.statusText}`); process.exit(1) }
  const d = await res.json() as Record<string, any>

  const line = (label: string, value: string | number) => `  ${String(label).padEnd(26)} ${value}`

  console.log('\n── SEO quality ──────────────────────────────────────')
  console.log(line('Published products', d.totals?.published_products ?? '?'))
  console.log(line('With meta title', `${d.totals?.with_meta_title ?? '?'} (${d.coverage_pct?.meta_title ?? '?'}%)`))
  console.log(line('With meta description', `${d.totals?.with_meta_description ?? '?'} (${d.coverage_pct?.meta_description ?? '?'}%)`))
  console.log(line('With long description', `${d.totals?.with_long_description ?? '?'} (${d.coverage_pct?.long_description ?? '?'}%)`))
  console.log(line('Missing any meta', d.totals?.missing_any_meta ?? '?'))
  console.log(line('Missing long description', d.totals?.missing_long_description ?? '?'))

  console.log('\n── seo_status breakdown ─────────────────────────────')
  for (const [k, v] of Object.entries(d.seo_status_breakdown ?? {})) console.log(line(k, v as number))

  console.log('\n── AI backlog ───────────────────────────────────────')
  console.log(line('Eligible for AI', d.ai_backlog?.eligible_products ?? '?'))

  const cats = d.top_categories_needing_seo?.categories ?? []
  if (cats.length) {
    console.log(`\n── Top categories needing SEO (sampled ${d.top_categories_needing_seo?.sampled_rows ?? '?'}) ──`)
    for (const c of cats) console.log(line(c.category_slug, c.sampled_missing))
  }
  console.log('')
}

main().catch((e) => { console.error(e); process.exit(1) })
