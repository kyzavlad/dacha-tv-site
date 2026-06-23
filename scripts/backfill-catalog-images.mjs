#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Catalog image backfill — DRY RUN by default.
//
// Copies main_image_url + images from supplier_products → catalog_products for
// catalog rows that are missing an image but whose matching supplier row (by
// supplier_sku) has one.
//
// Why: products imported before mainimage extraction (PR #34) landed in
// catalog_products with main_image_url = null. syncProductsToCatalog only
// re-touches supplier rows with is_approved=false, so already-imported catalog
// rows are not guaranteed to be refreshed. This closes that gap directly.
//
// SAFETY: touches ONLY main_image_url + images (+ updated_at). Never price,
// status, category, stock, orders, or checkout. Read-only unless you pass
// --apply.
//
// Env: loads .env.local then .env.production.local (does not clobber set vars).
// Uses the service role key when available.
//
// Usage:
//   node scripts/backfill-catalog-images.mjs            # dry run (report only)
//   node scripts/backfill-catalog-images.mjs --apply    # write image columns
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

function loadEnvFile(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return false
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
  return true
}

const loaded = []
if (loadEnvFile('.env.local')) loaded.push('.env.local')
if (loadEnvFile('.env.production.local')) loaded.push('.env.production.local')
console.log(`Env files loaded: ${loaded.length ? loaded.join(', ') : '(none — using process.env only)'}`)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const key = serviceKey || anonKey

if (!url || !key) {
  console.error('✖  NEXT_PUBLIC_SUPABASE_URL and a key (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY) are required.')
  process.exit(1)
}
if (APPLY && !serviceKey) {
  console.error('✖  --apply requires SUPABASE_SERVICE_ROLE_KEY (anon key cannot update rows under RLS).')
  process.exit(1)
}
console.log(`Supabase URL: ${url}`)
console.log(`Auth: ${serviceKey ? 'service role' : 'anon key (RLS applies)'}`)
console.log(`Mode: ${APPLY ? 'APPLY (will write image columns)' : 'DRY RUN (no writes)'}`)

const supabase = createClient(url.trim().replace(/\/+$/, ''), key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Page past the PostgREST 1000-row cap.
async function selectAll(build) {
  const out = []
  const P = 1000
  for (let from = 0; ; from += P) {
    const { data, error } = await build(from, from + P - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < P) break
  }
  return out
}

async function main() {
  console.log('\n' + '═'.repeat(70))
  console.log('CATALOG IMAGE BACKFILL' + (APPLY ? ' — APPLY' : ' — DRY RUN'))
  console.log('═'.repeat(70))

  const { count: catalogTotal } = await supabase
    .from('catalog_products')
    .select('id', { count: 'exact', head: true })

  // Catalog rows missing a primary image.
  const missing = await selectAll((from, to) =>
    supabase
      .from('catalog_products')
      .select('id, supplier_sku')
      .is('main_image_url', null)
      .not('supplier_sku', 'is', null)
      .order('supplier_sku', { ascending: true })
      .range(from, to))

  console.log(`\ncatalog_products total:               ${catalogTotal ?? '?'}`)
  console.log(`catalog_products missing image:       ${missing.length}`)

  if (missing.length === 0) {
    console.log('\nNothing to backfill. Done.')
    return
  }

  // Resolve supplier images by sku (chunked), keep only those with an image.
  const supplierImg = new Map()
  const skus = missing.map((c) => c.supplier_sku)
  for (let i = 0; i < skus.length; i += 300) {
    const { data, error } = await supabase
      .from('supplier_products')
      .select('supplier_sku, main_image_url, images')
      .in('supplier_sku', skus.slice(i, i + 300))
      .not('main_image_url', 'is', null)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      if (r.supplier_sku && r.main_image_url) {
        supplierImg.set(r.supplier_sku, { main: r.main_image_url, images: r.images })
      }
    }
  }

  const eligible = missing.filter((c) => supplierImg.has(c.supplier_sku))
  console.log(`eligible (supplier has an image):     ${eligible.length}`)
  console.log(`not recoverable (no supplier image):  ${missing.length - eligible.length}`)

  console.log('\nSample affected rows (up to 10):')
  for (const c of eligible.slice(0, 10)) {
    console.log(`   ${c.supplier_sku}  →  ${supplierImg.get(c.supplier_sku).main}`)
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — no rows changed. Re-run with --apply to write ${eligible.length} image(s).`)
    return
  }

  let updated = 0, errors = 0
  for (const c of eligible) {
    const img = supplierImg.get(c.supplier_sku)
    const { error } = await supabase
      .from('catalog_products')
      .update({ main_image_url: img.main, images: img.images, updated_at: new Date().toISOString() })
      .eq('id', c.id)
      .is('main_image_url', null) // never overwrite an image already set
    if (error) { errors++; if (errors <= 5) console.log(`   ✖ ${c.supplier_sku}: ${error.message}`) }
    else updated++
  }
  console.log(`\nApplied. Updated ${updated} row(s)${errors ? `, ${errors} error(s)` : ''}.`)
}

main().then(() => {
  console.log('\n' + '═'.repeat(70))
  console.log(APPLY ? 'Done.' : 'Done. No data was modified (dry run).')
  console.log('═'.repeat(70))
}).catch((e) => {
  console.error(`✖  Unexpected: ${e.stack ?? e.message}`)
  process.exit(1)
})
