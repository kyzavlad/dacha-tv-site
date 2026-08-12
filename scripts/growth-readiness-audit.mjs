#!/usr/bin/env node
// ─── Dacha TV growth / launch readiness audit ────────────────────────────────
// READ-ONLY. Never writes to production, never places an order, never mutates
// the catalog. Safe to re-run as often as you like — it is the check we run
// before and after every release and before turning on paid traffic.
//
//   node scripts/growth-readiness-audit.mjs
//   node scripts/growth-readiness-audit.mjs --base https://dachatv.com --json out.json
//   node scripts/growth-readiness-audit.mjs --products 30 --categories 8
//   node scripts/growth-readiness-audit.mjs --skip-db          (HTTP checks only)
//   node scripts/growth-readiness-audit.mjs --deep             (full malformed scan)
//
// Environment (names only — values are never printed):
//   AUDIT_BASE_URL | NEXT_PUBLIC_SITE_URL   production origin (default https://dachatv.com)
//   NEXT_PUBLIC_SUPABASE_URL                 optional: enables the DB section
//   SUPABASE_SERVICE_ROLE_KEY                optional: enables the DB section
//   CRON_SECRET                              optional: also probes protected diagnostics
//
// Exit code: 0 when there is no launch blocker (warnings allowed), 1 when at
// least one FAIL was recorded, 2 on an internal audit error.

import { writeFileSync } from 'node:fs'

// Product ids archived out of the public catalog. They must never reappear in
// the sitemap or resolve as public product pages.
const ARCHIVED_JUNK_SKUS = ['--10', 'SD-5220']
const ARCHIVED_JUNK_NAMES = ['F0000000024', '<>']

const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const has = (name) => argv.includes(`--${name}`)

const BASE = (flag('base') || process.env.AUDIT_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://dachatv.com').replace(/\/+$/, '')
const PRODUCT_SAMPLE = Math.max(Number(flag('products', 20)) || 20, 20)
const CATEGORY_SAMPLE = Math.max(Number(flag('categories', 6)) || 6, 3)
const SKIP_DB = has('skip-db')
const DEEP = has('deep')
const JSON_OUT = flag('json')
const TIMEOUT_MS = Number(flag('timeout', 20000)) || 20000

const results = []
let sectionName = 'general'
const section = (name) => { sectionName = name; log(`\n── ${name} ──`) }
const record = (status, check, detail = '') => {
  results.push({ section: sectionName, status, check, detail })
  const icon = status === 'PASS' ? '✓' : status === 'WARN' ? '!' : '✗'
  log(`  ${icon} ${check}${detail ? ` — ${detail}` : ''}`)
}
const pass = (c, d) => record('PASS', c, d)
const warn = (c, d) => record('WARN', c, d)
const fail = (c, d) => record('FAIL', c, d)
function log(msg) { process.stdout.write(`${msg}\n`) }

async function get(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const started = Date.now()
  try {
    const res = await fetch(url, {
      redirect: opts.redirect ?? 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': 'dachatv-growth-audit', ...(opts.headers ?? {}) },
    })
    const body = opts.head ? '' : await res.text()
    return { ok: true, status: res.status, body, url: res.url, headers: res.headers, ms: Date.now() - started }
  } catch (e) {
    return { ok: false, status: 0, body: '', url, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

// ── Tiny HTML helpers (no dependency; the pages are server-rendered) ─────────
const pick = (html, re) => { const m = html.match(re); return m ? m[1].trim() : null }
const title = (html) => pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
const metaDesc = (html) =>
  pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
  pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
const canonical = (html) => pick(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
const hreflang = (html, lang) =>
  pick(html, new RegExp(`<link[^>]+hreflang=["']${lang}["'][^>]+href=["']([^"']*)["']`, 'i')) ??
  pick(html, new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]+hreflang=["']${lang}["']`, 'i'))
const hasNoindex = (html) => /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)
const jsonLdBlocks = (html) => [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])

// ─────────────────────────────────────────────────────────────────────────────
// A. HEALTH
// ─────────────────────────────────────────────────────────────────────────────
async function auditHealth() {
  section('A. Health & canonical host')

  if (!BASE.startsWith('https://')) fail('base URL uses HTTPS', BASE)
  else pass('base URL uses HTTPS', BASE)

  const health = await get('/api/health')
  if (!health.ok) fail('/api/health reachable', health.error)
  else if (health.status !== 200) fail('/api/health returns 200', `HTTP ${health.status}`)
  else pass('/api/health returns 200', `${health.ms}ms`)

  const home = await get('/')
  if (!home.ok) fail('home page reachable', home.error)
  else if (home.status !== 200) fail('home page returns 200', `HTTP ${home.status}`)
  else {
    pass('home page returns 200', `${home.ms}ms`)
    if (home.ms > 3000) warn('home page response time', `${home.ms}ms — slow`)
  }

  // www / non-www consistency: whichever host is canonical, the other must not
  // serve a competing 200 (duplicate content) and must not loop.
  const host = new URL(BASE).host
  const alt = host.startsWith('www.') ? `https://${host.slice(4)}` : `https://www.${host}`
  const altRes = await get(`${alt}/`, { redirect: 'manual' })
  if (!altRes.ok) warn('alternate host reachable', `${alt}: ${altRes.error}`)
  else if ([301, 302, 307, 308].includes(altRes.status)) pass('alternate host redirects to canonical', `${alt} → HTTP ${altRes.status}`)
  else if (altRes.status === 200) warn('alternate host serves 200', `${alt} — confirm a canonical redirect exists`)
  else pass('alternate host does not serve duplicate content', `HTTP ${altRes.status}`)

  // Redirect-loop probe on the localized routes (the historic 500/loop area).
  for (const p of ['/ru/', '/catalog']) {
    const r = await get(p)
    if (!r.ok) fail(`${p} reachable`, r.error)
    else if (r.status >= 500) fail(`${p} does not 5xx`, `HTTP ${r.status}`)
    else if (r.status >= 400) warn(`${p} status`, `HTTP ${r.status}`)
    else pass(`${p} returns ${r.status}`, `${r.ms}ms`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// B. ROBOTS
// ─────────────────────────────────────────────────────────────────────────────
async function auditRobots() {
  section('B. robots.txt')
  const r = await get('/robots.txt')
  if (!r.ok || r.status !== 200) { fail('robots.txt returns 200', r.ok ? `HTTP ${r.status}` : r.error); return null }
  pass('robots.txt returns 200')

  const body = r.body
  if (!/user-agent:/i.test(body)) { fail('robots.txt is syntactically usable', 'no User-agent directive'); return body }
  pass('robots.txt is syntactically usable')

  const disallows = [...body.matchAll(/^\s*disallow:\s*(\S*)\s*$/gim)].map((m) => m[1])
  const blocksPublic = disallows.some((d) => d === '/' || /^\/catalog\/?$/.test(d) || /^\/search\/?$/.test(d))
  if (blocksPublic) fail('public catalog is crawlable', `Disallow: ${disallows.join(' ')}`)
  else pass('public catalog is crawlable')

  for (const priv of ['/admin', '/api']) {
    if (disallows.some((d) => d.startsWith(priv))) pass(`${priv} excluded from crawling`)
    else warn(`${priv} excluded from crawling`, 'not listed in robots.txt')
  }

  if (/sitemap:\s*https?:\/\//i.test(body)) pass('robots.txt references a sitemap')
  else fail('robots.txt references a sitemap', 'no Sitemap: line')
  return body
}

// ─────────────────────────────────────────────────────────────────────────────
// C. SITEMAP (index or single file)
// ─────────────────────────────────────────────────────────────────────────────
async function auditSitemap(robotsBody) {
  section('C. Sitemap')
  const declared = robotsBody ? [...robotsBody.matchAll(/sitemap:\s*(\S+)/gi)].map((m) => m[1]) : []
  const entry = declared[0] || `${BASE}/sitemap.xml`

  const root = await get(entry)
  if (!root.ok || root.status !== 200) { fail('sitemap returns 200', root.ok ? `HTTP ${root.status}` : root.error); return { urls: [] } }
  pass('sitemap returns 200', entry)

  if (!/<\?xml/i.test(root.body) || !/<(urlset|sitemapindex)/i.test(root.body)) {
    fail('sitemap is valid XML', 'no urlset/sitemapindex root')
    return { urls: [] }
  }
  pass('sitemap is valid XML')

  // Support a split/indexed sitemap (required at 100k+ products).
  let shardUrls = []
  const isIndex = /<sitemapindex/i.test(root.body)
  if (isIndex) {
    shardUrls = [...root.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
    pass('sitemap index lists shards', `${shardUrls.length} shard(s)`)
  }

  const urls = []
  const shardsToRead = isIndex ? shardUrls : [entry]
  for (const shard of shardsToRead) {
    const s = shard === entry && !isIndex ? root : await get(shard)
    if (!s.ok || s.status !== 200) { fail('sitemap shard returns 200', `${shard}: ${s.ok ? `HTTP ${s.status}` : s.error}`); continue }
    urls.push(...[...s.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]))
  }
  pass('sitemap URL count', `${urls.length.toLocaleString('en-US')} URLs`)
  if (urls.length === 0) fail('sitemap contains URLs', 'empty sitemap')

  const canonicalHost = new URL(BASE).host
  const offHost = urls.filter((u) => { try { return new URL(u).host !== canonicalHost } catch { return true } })
  if (offHost.length) fail('all sitemap URLs use the canonical host', `${offHost.length}, e.g. ${offHost[0]}`)
  else pass('all sitemap URLs use the canonical host')

  const forbidden = urls.filter((u) => /\/(admin|api)(\/|$)/.test(u) || /\/(checkout|cart)(\/|$)/.test(u))
  if (forbidden.length) fail('no admin/API/checkout URLs in sitemap', `${forbidden.length}, e.g. ${forbidden[0]}`)
  else pass('no admin/API/checkout URLs in sitemap')

  const malformed = urls.filter((u) => !/^https:\/\/[^\s<>"]+$/.test(u))
  if (malformed.length) fail('no malformed sitemap URLs', `${malformed.length}, e.g. ${malformed[0]}`)
  else pass('no malformed sitemap URLs')

  // The two archived junk products must be absent.
  const junkHits = urls.filter((u) => {
    const dec = decodeURIComponent(u).toLowerCase()
    return ARCHIVED_JUNK_SKUS.some((s) => dec.endsWith(`/${s.toLowerCase()}`)) ||
      ARCHIVED_JUNK_NAMES.some((n) => dec.includes(n.toLowerCase()))
  })
  if (junkHits.length) fail('archived junk products absent from sitemap', junkHits.join(', '))
  else pass('archived junk products absent from sitemap')

  return { urls }
}

// ─────────────────────────────────────────────────────────────────────────────
// D/E. PUBLIC PAGE SAMPLES
// ─────────────────────────────────────────────────────────────────────────────
function samplePaths(urls, matcher, n) {
  const paths = []
  const seenCategory = new Map()
  for (const u of urls) {
    let p
    try { p = new URL(u).pathname } catch { continue }
    if (!matcher(p)) continue
    // Spread across categories so the sample is not one aisle of the shop.
    const cat = p.split('/')[2] ?? ''
    const used = seenCategory.get(cat) ?? 0
    if (used >= Math.max(2, Math.ceil(n / 4))) continue
    seenCategory.set(cat, used + 1)
    paths.push(p)
    if (paths.length >= n) break
  }
  return paths
}

async function checkPage(path, kind) {
  const r = await get(path)
  const label = `${kind} ${path}`
  if (!r.ok) { fail(`${label}: reachable`, r.error); return }
  if (r.status !== 200) { fail(`${label}: HTTP 200`, `HTTP ${r.status}`); return }

  const html = r.body
  const problems = []
  const t = title(html)
  if (!t) problems.push('empty <title>')
  const d = metaDesc(html)
  if (!d || d.length < 50) problems.push(`meta description ${d ? `${d.length} chars` : 'missing'}`)
  const c = canonical(html)
  if (!c) problems.push('no canonical')
  else if (!c.startsWith(BASE)) problems.push(`canonical off-host (${c})`)
  if (!hreflang(html, 'uk')) problems.push('no hreflang uk')
  if (!hreflang(html, 'ru')) problems.push('no hreflang ru')
  if (hasNoindex(html)) problems.push('noindex')
  if (html.length < 3000) problems.push(`suspiciously small body (${html.length}b)`)

  for (const block of jsonLdBlocks(html)) {
    try { JSON.parse(block) } catch { problems.push('structured data does not parse') }
  }

  if (problems.some((p) => p === 'noindex' || p.startsWith('canonical off-host') || p.startsWith('suspiciously small'))) {
    fail(`${label}`, problems.join('; '))
  } else if (problems.length) {
    warn(`${label}`, problems.join('; '))
  } else {
    pass(`${label}`, `${r.ms}ms · x-default:${hreflang(html, 'x-default') ? 'yes' : 'no'}`)
  }
}

async function auditSamples(urls) {
  section(`D. Product sample (${PRODUCT_SAMPLE})`)
  const productPaths = samplePaths(urls, (p) => /^\/catalog\/[^/]+\/[^/]+$/.test(p), PRODUCT_SAMPLE)
  if (productPaths.length < PRODUCT_SAMPLE) warn('product sample size', `only ${productPaths.length} product URLs found in the sitemap`)
  for (const p of productPaths) await checkPage(p, 'product')
  // Same products under the RU prefix — the RU storefront is the whole point of
  // the RU SEO programme.
  for (const p of productPaths.slice(0, Math.min(5, productPaths.length))) await checkPage(`/ru${p}`, 'product(ru)')

  section(`E. Category sample (${CATEGORY_SAMPLE})`)
  const categoryPaths = samplePaths(urls, (p) => /^\/catalog\/[^/]+$/.test(p), CATEGORY_SAMPLE)
  if (categoryPaths.length === 0) warn('category sample', 'no category URLs found in the sitemap')
  for (const p of categoryPaths) await checkPage(p, 'category')
  for (const p of categoryPaths.slice(0, 2)) await checkPage(`/ru${p}`, 'category(ru)')

  section('E2. Commercial surfaces')
  for (const p of ['/search?q=%D0%BA%D0%B0%D1%80%D0%B1%D1%8E%D1%80%D0%B0%D1%82%D0%BE%D1%80', '/checkout', '/delivery', '/contact']) {
    const r = await get(p)
    if (!r.ok) fail(`surface ${p}`, r.error)
    else if (r.status >= 500) fail(`surface ${p}`, `HTTP ${r.status}`)
    else if (r.status >= 400) warn(`surface ${p}`, `HTTP ${r.status}`)
    else pass(`surface ${p}`, `HTTP ${r.status} · ${r.ms}ms`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// F. DATABASE STATE (optional — only when Supabase env is present)
// ─────────────────────────────────────────────────────────────────────────────
async function auditDatabase() {
  section('F. SEO database state')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (SKIP_DB || !url || !key) {
    warn('database section', SKIP_DB ? 'skipped (--skip-db)' : 'skipped — Supabase env not configured in this shell')
    return null
  }

  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(url, key, { auth: { persistSession: false } })

  const count = async (build) => {
    try { const { count, error } = await build(); return error ? null : count ?? 0 } catch { return null }
  }
  const P = () => db.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published')
  const T = () => db.from('catalog_product_translations').select('id', { count: 'exact', head: true }).eq('locale', 'ru')

  const published = await count(() => P())
  record(published != null ? 'PASS' : 'WARN', 'published products', published != null ? published.toLocaleString('en-US') : 'unavailable')

  const ruComplete = await count(() =>
    T().not('meta_title', 'is', null).neq('meta_title', '')
      .not('meta_description', 'is', null).neq('meta_description', '')
      .not('description', 'is', null).neq('description', ''))
  const ruBacklog = published != null && ruComplete != null ? Math.max(0, published - ruComplete) : null
  record(ruBacklog === 0 ? 'PASS' : ruBacklog == null ? 'WARN' : 'WARN', 'RU actionable backlog', ruBacklog == null ? 'unavailable' : String(ruBacklog))
  if (ruComplete != null) pass('RU complete rows', ruComplete.toLocaleString('en-US'))

  // UA: classify only the rows that are actually incomplete (tiny set), using the
  // shared definition so this agrees with /api/admin/diag/seo-quality.
  const { summarizeUaBacklog, UA_BACKLOG_COLS } = await import('../lib/catalog/seo-backlog.ts')
  let uaSummary = null
  try {
    const { data, error } = await db
      .from('catalog_products')
      .select(UA_BACKLOG_COLS)
      .eq('status', 'published')
      .or('meta_title.is.null,meta_title.eq.,meta_description.is.null,meta_description.eq.,description_ua.is.null,description_ua.eq.')
      .limit(5000)
    if (error) throw new Error(error.message)
    uaSummary = summarizeUaBacklog(data ?? [])
    record(uaSummary.actionable === 0 ? 'PASS' : 'WARN', 'UA actionable backlog', String(uaSummary.actionable))
    pass('UA incomplete rows (classified)', `${uaSummary.total} → manual exceptions ${uaSummary.manual_exception}, locked ${uaSummary.manual_locked}, malformed ${uaSummary.malformed}`)
  } catch (e) {
    warn('UA actionable backlog', e instanceof Error ? e.message : String(e))
  }

  const catTotal = await count(() => db.from('catalog_categories').select('id', { count: 'exact', head: true }).eq('is_published', true))
  const catRu = await count(() => db.from('catalog_category_translations').select('id', { count: 'exact', head: true }).eq('locale', 'ru').not('description', 'is', null).neq('description', ''))
  if (catTotal != null) pass('published categories', `${catTotal} (RU described: ${catRu ?? '?'})`)

  const lockedProducts = await count(() => P().eq('seo_manual_lock', true))
  const lockedPrice = await count(() => P().eq('price_manual_lock', true))
  const lockedImage = await count(() => P().eq('image_manual_lock', true))
  pass('manual locks (seo/price/image)', `${lockedProducts ?? '?'} / ${lockedPrice ?? '?'} / ${lockedImage ?? '?'}`)

  // The two archived junk rows must still be non-public.
  try {
    const { data } = await db.from('catalog_products').select('id, status, supplier_sku').in('supplier_sku', ARCHIVED_JUNK_SKUS)
    const live = (data ?? []).filter((r) => r.status === 'published')
    if (live.length) fail('archived junk products are non-public', live.map((r) => `${r.supplier_sku}=${r.status}`).join(', '))
    else pass('archived junk products are non-public', `${(data ?? []).length} row(s) checked`)
  } catch (e) {
    warn('archived junk products are non-public', e instanceof Error ? e.message : String(e))
  }

  // Malformed public products: bounded sample by default, full scan with --deep.
  try {
    const { isPublicListableProduct } = await import('../lib/supabase/catalog.ts')
    const PAGE = 1000
    const cap = DEEP ? Infinity : 5000
    let scanned = 0, malformed = []
    for (let from = 0; scanned < cap; from += PAGE) {
      const { data, error } = await db
        .from('catalog_products')
        .select('id, supplier_sku, name_ua, name')
        .eq('status', 'published')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      const rows = data ?? []
      scanned += rows.length
      for (const r of rows) if (!isPublicListableProduct(r)) malformed.push(r.supplier_sku ?? r.id)
      if (rows.length < PAGE) break
    }
    const scope = DEEP ? 'full catalog' : `first ${scanned.toLocaleString('en-US')} rows`
    if (malformed.length) fail('no malformed public products', `${malformed.length} in ${scope}, e.g. ${malformed.slice(0, 5).join(', ')}`)
    else pass('no malformed public products', scope)
  } catch (e) {
    warn('malformed public products', e instanceof Error ? e.message : String(e))
  }

  return { published, ruComplete, ruBacklog, ua: uaSummary }
}

// ─────────────────────────────────────────────────────────────────────────────
// G. Protected diagnostics (only when CRON_SECRET is present in this shell)
// ─────────────────────────────────────────────────────────────────────────────
async function auditProtectedDiagnostics() {
  section('G. Protected diagnostics')
  const secret = process.env.CRON_SECRET
  if (!secret) { warn('protected diagnostics', 'skipped — CRON_SECRET not set in this shell'); return }
  const headers = { authorization: `Bearer ${secret}` }
  for (const path of ['/api/admin/diag/seo-quality', '/api/admin/diag/seo-quality-products-localized?locale=ru']) {
    const r = await get(path, { headers })
    if (!r.ok) { fail(`diag ${path}`, r.error); continue }
    if (r.status !== 200) { fail(`diag ${path}`, `HTTP ${r.status}`); continue }
    try {
      const j = JSON.parse(r.body)
      const actionable = j?.actionable_backlog?.actionable
      pass(`diag ${path}`, `${r.ms}ms${actionable != null ? ` · actionable=${actionable}` : ''}`)
    } catch { warn(`diag ${path}`, 'response is not JSON') }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  log(`Dacha TV growth readiness audit — ${BASE}`)
  log(`started ${new Date().toISOString()}${DEEP ? ' · deep scan' : ''}`)

  await auditHealth()
  const robotsBody = await auditRobots()
  const { urls } = await auditSitemap(robotsBody)
  await auditSamples(urls)
  const db = await auditDatabase()
  await auditProtectedDiagnostics()

  const counts = {
    pass: results.filter((r) => r.status === 'PASS').length,
    warn: results.filter((r) => r.status === 'WARN').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
  }
  section('SUMMARY')
  log(`  PASS ${counts.pass}   WARN ${counts.warn}   FAIL ${counts.fail}`)
  const blockers = results.filter((r) => r.status === 'FAIL')
  if (blockers.length) {
    log('\n  LAUNCH BLOCKERS:')
    for (const b of blockers) log(`   ✗ [${b.section}] ${b.check}${b.detail ? ` — ${b.detail}` : ''}`)
  } else {
    log('\n  No launch blockers.')
  }

  const artifact = {
    generated_at: new Date().toISOString(),
    base_url: BASE,
    deep: DEEP,
    counts,
    sitemap_urls: urls.length,
    database: db,
    results,
    verdict: counts.fail > 0 ? 'BLOCKED' : counts.warn > 0 ? 'READY_WITH_WARNINGS' : 'READY',
  }
  if (JSON_OUT) {
    writeFileSync(JSON_OUT, `${JSON.stringify(artifact, null, 2)}\n`)
    log(`\n  JSON artifact → ${JSON_OUT}`)
  } else {
    log(`\n  (pass --json <file> to save the machine-readable artifact)`)
  }

  process.exit(counts.fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(`audit failed: ${e instanceof Error ? e.stack : String(e)}`)
  process.exit(2)
})
