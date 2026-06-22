#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Supplier product image diagnostic — READ ONLY.
//
// Answers: why are supplier product images missing on the storefront?
//   • how many supplier_products have a main_image_url
//   • how many catalog_products have an image
//   • what hostnames the stored image URLs use (→ next.config remotePatterns)
//   • which image-like keys actually exist inside supplier_products.raw_data
//     (decides whether PR 2 is a simple field-broadening or needs YML parsing)
//
// Loads env from .env.local then .env.production.local (later wins for missing
// keys only — does not clobber already-set process.env). Uses the service role
// key when available. Mutates NOTHING.
//
// Usage:
//   node scripts/diagnose-supplier-images.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Minimal .env loader (no dotenv dependency) ────────────────────────────────
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
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    // Do not clobber values already present in the environment.
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
console.log(`Supabase URL: ${url}`)
console.log(`Auth: ${serviceKey ? 'service role' : 'anon key (RLS applies — counts may be limited)'}`)

const supabase = createClient(url.trim().replace(/\/+$/, ''), key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Image-like keys to probe inside raw_data.
const IMAGE_KEYS = [
  'image', 'images', 'photo', 'photos', 'picture', 'pictures',
  'mainimage', 'main_image', 'main_image_url', 'image_url', 'imageUrl',
  'thumbnail', 'thumb', 'img', 'preview',
]

async function countWhere(table, builderFn) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  if (builderFn) q = builderFn(q)
  const { count, error } = await q
  if (error) return { count: null, error: error.message }
  return { count: count ?? 0, error: null }
}

function hostnameOf(u) {
  try {
    return new URL(u).hostname
  } catch {
    return '(unparseable)'
  }
}

async function main() {
  console.log('\n' + '═'.repeat(70))
  console.log('SUPPLIER PRODUCT IMAGE DIAGNOSTIC (read-only)')
  console.log('═'.repeat(70))

  // ── 1. Counts ───────────────────────────────────────────────────────────
  console.log('\n── Counts ──────────────────────────────────────────────────')
  const supTotal = await countWhere('supplier_products')
  console.log(`supplier_products total:                ${supTotal.count ?? `ERROR: ${supTotal.error}`}`)

  const supWithImg = await countWhere('supplier_products', (q) => q.not('main_image_url', 'is', null))
  console.log(`supplier_products w/ main_image_url:    ${supWithImg.count ?? `ERROR: ${supWithImg.error}`}`)

  const catTotal = await countWhere('catalog_products')
  console.log(`catalog_products total:                 ${catTotal.count ?? `ERROR: ${catTotal.error}`}`)

  const catWithImg = await countWhere('catalog_products', (q) => q.not('main_image_url', 'is', null))
  console.log(`catalog_products w/ main_image_url:     ${catWithImg.count ?? `ERROR: ${catWithImg.error}`}`)

  const catPublished = await countWhere('catalog_products', (q) => q.eq('status', 'published'))
  console.log(`catalog_products published:             ${catPublished.count ?? `ERROR: ${catPublished.error}`}`)

  const catPublishedWithImg = await countWhere('catalog_products', (q) =>
    q.eq('status', 'published').not('main_image_url', 'is', null))
  console.log(`catalog_products published w/ image:    ${catPublishedWithImg.count ?? `ERROR: ${catPublishedWithImg.error}`}`)

  if (typeof supTotal.count === 'number' && supTotal.count > 0 && typeof supWithImg.count === 'number') {
    const pct = ((supWithImg.count / supTotal.count) * 100).toFixed(1)
    console.log(`\nsupplier image coverage: ${pct}% (${supWithImg.count}/${supTotal.count})`)
  }
  if (typeof catTotal.count === 'number' && catTotal.count > 0 && typeof catWithImg.count === 'number') {
    const pct = ((catWithImg.count / catTotal.count) * 100).toFixed(1)
    console.log(`catalog  image coverage: ${pct}% (${catWithImg.count}/${catTotal.count})`)
  }

  // ── 2. Sample image URLs + hostnames ────────────────────────────────────
  console.log('\n── Sample stored image URLs (hostnames) ────────────────────')
  const hostCounts = new Map()
  for (const table of ['supplier_products', 'catalog_products']) {
    const { data, error } = await supabase
      .from(table)
      .select('main_image_url')
      .not('main_image_url', 'is', null)
      .limit(200)
    if (error) {
      console.log(`${table}: ERROR ${error.message}`)
      continue
    }
    const sample = []
    for (const row of data ?? []) {
      const u = row.main_image_url
      if (!u) continue
      const h = hostnameOf(u)
      hostCounts.set(h, (hostCounts.get(h) ?? 0) + 1)
      if (sample.length < 3) sample.push(u)
    }
    console.log(`${table}: ${data?.length ?? 0} sampled`)
    sample.forEach((u) => console.log(`   e.g. ${u}`))
  }
  console.log('\nHostname frequency (from sample):')
  if (hostCounts.size === 0) {
    console.log('   (no image URLs found)')
  } else {
    for (const [h, c] of [...hostCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${h}  ×${c}`)
    }
  }

  // ── 3. raw_data image-like key presence ─────────────────────────────────
  console.log('\n── raw_data image-like key presence (sample 300) ───────────')
  const { data: rawRows, error: rawErr } = await supabase
    .from('supplier_products')
    .select('raw_data')
    .not('raw_data', 'is', null)
    .limit(300)
  if (rawErr) {
    console.log(`ERROR sampling raw_data: ${rawErr.message}`)
  } else if (!rawRows || rawRows.length === 0) {
    console.log('(no raw_data rows found)')
  } else {
    const keyHits = new Map()
    const keyExamples = new Map()
    let allKeysSeen = new Set()
    for (const row of rawRows) {
      const rd = row.raw_data
      if (!rd || typeof rd !== 'object') continue
      for (const k of Object.keys(rd)) allKeysSeen.add(k)
      for (const probe of IMAGE_KEYS) {
        // case-insensitive key match
        const matchKey = Object.keys(rd).find((k) => k.toLowerCase() === probe.toLowerCase())
        if (matchKey != null && rd[matchKey] != null && rd[matchKey] !== '') {
          keyHits.set(probe, (keyHits.get(probe) ?? 0) + 1)
          if (!keyExamples.has(probe)) {
            const v = rd[matchKey]
            keyExamples.set(probe, typeof v === 'string' ? v.slice(0, 120) : JSON.stringify(v).slice(0, 120))
          }
        }
      }
    }
    console.log(`Sampled ${rawRows.length} raw_data objects.`)
    if (keyHits.size === 0) {
      console.log('⚠  NONE of the probed image-like keys were present/non-empty in raw_data.')
      console.log('   → Supplier JSON feed carries no product images. PR 2 likely needs YML <picture> parsing.')
    } else {
      console.log('Image-like keys found in raw_data:')
      for (const [k, c] of [...keyHits.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`   ${k}: ${c}/${rawRows.length}   e.g. ${keyExamples.get(k)}`)
      }
    }
    console.log(`\nAll distinct top-level raw_data keys seen (sample):`)
    console.log('   ' + [...allKeysSeen].sort().join(', '))
  }

  console.log('\n' + '═'.repeat(70))
  console.log('Done. No data was modified.')
  console.log('═'.repeat(70))
}

main().catch((e) => {
  console.error(`✖  Unexpected: ${e.stack ?? e.message}`)
  process.exit(1)
})
