/**
 * recovery-status.ts — one-glance launch-readiness dashboard for Vlad.
 *
 * Prints:
 *   • catalog product counts (total / published / draft) + image readiness
 *   • last product SEO sheet import status (from supplier_sync_log)
 *   • which old-manual-recovery output files exist under backups/
 *
 * Env (current NEW project):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm dlx tsx scripts/recovery-status.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    return `${u.protocol}//${u.host}`
  } catch {
    return raw.trim().replace(/\/+$/, '')
  }
}

type HeadCountQuery = ReturnType<ReturnType<SupabaseClient['from']>['select']>

async function headCount(
  client: SupabaseClient,
  table: string,
  apply?: (q: HeadCountQuery) => HeadCountQuery
): Promise<number | null> {
  let q: HeadCountQuery = client.from(table).select('id', { count: 'exact', head: true })
  if (apply) q = apply(q)
  const { count, error } = await q
  if (error) return null
  return count ?? 0
}

function line(label: string, value: string): string {
  return `  ${label.padEnd(28)} ${value}`
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log('\n=== Dacha TV — recovery / launch status ===\n')

  if (!url || !key) {
    console.log('DB: skipped (set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to include DB status).')
  } else {
    const client = createClient(normalizeUrl(url), key, { auth: { autoRefreshToken: false, persistSession: false } })

    const [cpTotal, cpPublished, cpDraft, cpWithImage, cpWithSpid] = await Promise.all([
      headCount(client, 'catalog_products'),
      headCount(client, 'catalog_products', (q) => q.eq('status', 'published')),
      headCount(client, 'catalog_products', (q) => q.eq('status', 'draft')),
      headCount(client, 'catalog_products', (q) => q.not('main_image_url', 'is', null)),
      headCount(client, 'catalog_products', (q) => q.not('supplier_product_id', 'is', null)),
    ])

    const pct = (n: number | null, d: number | null) =>
      n != null && d != null && d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'n/a'

    console.log('Catalog products:')
    console.log(line('total', String(cpTotal ?? '?')))
    console.log(line('published', String(cpPublished ?? '?')))
    console.log(line('draft', String(cpDraft ?? '?')))
    console.log(line('with image', `${cpWithImage ?? '?'} (${pct(cpWithImage, cpTotal)})`))
    console.log(line('linked to supplier', `${cpWithSpid ?? '?'} (${pct(cpWithSpid, cpTotal)})`))
    const imageReady = cpTotal != null && cpWithImage != null && cpTotal > 0 && cpWithImage >= cpTotal
    console.log(line('image readiness', imageReady ? 'READY — all products have an image' : 'incomplete'))

    // Manual content tables (present + row counts)
    console.log('\nManual content tables:')
    for (const t of ['honey_products', 'apiary_products', 'beekeeper_products', 'flower_products', 'services']) {
      const c = await headCount(client, t)
      console.log(line(t, c == null ? 'missing / no access' : `${c} rows`))
    }

    // Last product SEO sheet import
    const { data: seoLog } = await client
      .from('supplier_sync_log')
      .select('status, products_total, error_details, completed_at, started_at')
      .eq('sync_type', 'product_seo_sheet')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    console.log('\nProduct SEO sheet import:')
    if (!seoLog) {
      console.log(line('last run', 'never'))
    } else {
      const details = (seoLog.error_details ?? {}) as Record<string, unknown>
      console.log(line('status', String(seoLog.status)))
      console.log(line('updated', String(seoLog.products_total ?? details.updated ?? '?')))
      console.log(line('matched / eligible', `${details.matched ?? '?'} / ${details.eligible ?? '?'}`))
      console.log(line('when', String(seoLog.completed_at ?? seoLog.started_at ?? '?')))
    }
  }

  // Recovery output files
  console.log('\nOld manual recovery files (backups/):')
  const backups = join(process.cwd(), 'backups')
  const checkFile = (rel: string) => {
    const p = join(backups, rel)
    if (existsSync(p)) {
      const kb = (statSync(p).size / 1024).toFixed(1)
      console.log(line(rel, `present (${kb} KB)`))
    } else {
      console.log(line(rel, 'not yet generated'))
    }
  }
  checkFile('recovered-items-review.md')
  checkFile('restore-old-manual-content.sql')
  const exportDir = join(backups, 'old-supabase-public-export')
  if (existsSync(exportDir)) {
    const files = readdirSync(exportDir).filter((f) => f.endsWith('.json'))
    console.log(line('old-supabase-public-export/', `${files.length} table export(s)`))
    for (const f of files) console.log(line(`  • ${f}`, `${(statSync(join(exportDir, f)).size / 1024).toFixed(1)} KB`))
  } else {
    console.log(line('old-supabase-public-export/', 'not yet generated'))
  }

  console.log('')
}

main().catch((e: unknown) => {
  console.error('recovery-status failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
