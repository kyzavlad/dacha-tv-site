/**
 * recover-old-public-content.ts — recover manual business content from OLD Vercel
 * deployments by crawling their public pages.
 *
 * The old Supabase DB is gone, but old Vercel deployments still serve the pages
 * that were rendered from it. This lists recent READY deployments and scrapes a
 * fixed set of public routes from each, capturing titles, headings, product/
 * service card links + names + prices + images, so the manual content (honey,
 * products, flowers, beekeeper, services, …) can be reconstructed.
 *
 * Credentials (read locally, never committed):
 *   ~/.vercel/auth.json        → { "token": "..." }   (or env VERCEL_TOKEN)
 *   .vercel/project.json       → { "projectId": "...", "orgId": "..." }
 *
 * Output: backups/recovered-public-content.json  (gitignored)
 *
 * Run:
 *   pnpm dlx tsx scripts/recover-old-public-content.ts
 *   # options: --limit=30 (deployments to scan), --max=8 (routes already fixed)
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const ROUTES = ['/', '/products', '/honey', '/flowers', '/flowers/catalog', '/beekeeper', '/services', '/catalog'] as const

// Landing routes themselves are NOT items — used to skip e.g. a "/flowers/catalog"
// or "/catalog" anchor that would otherwise look like a product card.
const ROUTE_SET = new Set<string>(ROUTES)

// Item-link route prefixes we care about (a card linking into a detail page).
const ITEM_PREFIXES = ['/honey/', '/flowers/', '/products/', '/beekeeper/', '/services/', '/catalog/']

interface RecoveredItem {
  name: string
  href: string
  price: string | null
  image: string | null
}

interface RecoveredPage {
  deploymentUrl: string
  deploymentCreatedAt: string | null
  gitCommitMessage: string | null
  route: string
  url: string
  ok: boolean
  status: number
  title: string | null
  headings: string[]
  items: RecoveredItem[]
  images: string[]
  error?: string
}

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function readToken(): string {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN
  const p = join(homedir(), '.vercel', 'auth.json')
  if (existsSync(p)) {
    try {
      const j = JSON.parse(readFileSync(p, 'utf8')) as { token?: string }
      if (j.token) return j.token
    } catch { /* fall through */ }
  }
  console.error('No Vercel token found. Set VERCEL_TOKEN or log in with `vercel login`.')
  process.exit(1)
}

function readProject(): { projectId: string; orgId?: string } {
  const p = join(process.cwd(), '.vercel', 'project.json')
  if (!existsSync(p)) {
    console.error('Missing .vercel/project.json — run `vercel link` in this repo first.')
    process.exit(1)
  }
  const j = JSON.parse(readFileSync(p, 'utf8')) as { projectId?: string; orgId?: string }
  if (!j.projectId) {
    console.error('.vercel/project.json has no projectId.')
    process.exit(1)
  }
  return { projectId: j.projectId, orgId: j.orgId }
}

// ── tiny dependency-free HTML extractors ────────────────────────────────────
function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchAll(re: RegExp, html: string): RegExpMatchArray[] {
  return [...html.matchAll(re)]
}

function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m ? stripTags(m[1]) || null : null
}

function extractHeadings(html: string): string[] {
  const out: string[] = []
  for (const m of matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, html)) {
    const t = stripTags(m[1])
    if (t && t.length <= 200) out.push(t)
  }
  return [...new Set(out)]
}

function extractImages(html: string): string[] {
  const out: string[] = []
  for (const m of matchAll(/<img[^>]+src=["']([^"']+)["']/gi, html)) {
    const src = m[1]
    if (src && !src.startsWith('data:')) out.push(src)
  }
  return [...new Set(out)]
}

const PRICE_RE = /(?:від\s*)?\d[\d\s ]{0,9}(?:грн|₴|UAH)/i

// Extract product/service cards: anchors into an item route, with their visible
// text as the name and a nearby price/image if present in the same <a> block.
function extractItems(html: string): RecoveredItem[] {
  const items: RecoveredItem[] = []
  const seen = new Set<string>()
  // Inner content excludes a nested opening <a, so nested cards are matched
  // independently instead of the outer anchor swallowing the inner one.
  for (const m of matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>((?:(?!<a\b)[\s\S])*?)<\/a>/gi, html)) {
    const href = m[1]
    if (!ITEM_PREFIXES.some((p) => href.startsWith(p))) continue
    // skip the landing routes themselves (e.g. /flowers/catalog, /catalog)
    const pathOnly = href.split(/[?#]/)[0].replace(/\/$/, '')
    if (ROUTE_SET.has(pathOnly) || ROUTE_SET.has(`${pathOnly}/`)) continue
    // skip a bare-prefix anchor with no slug after it
    const afterPrefix = ITEM_PREFIXES.map((p) => (href.startsWith(p) ? href.slice(p.length) : '')).find(Boolean) ?? ''
    if (!afterPrefix || afterPrefix.startsWith('?') || afterPrefix.startsWith('#')) continue
    const inner = m[2]
    const name = stripTags(inner)
    if (!name) continue
    const priceM = PRICE_RE.exec(inner)
    const imgM = /<img[^>]+src=["']([^"']+)["']/i.exec(inner)
    const key = `${href}::${name}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      name: name.slice(0, 200),
      href,
      price: priceM ? priceM[0].replace(/\s+/g, ' ').trim() : null,
      image: imgM && !imgM[1].startsWith('data:') ? imgM[1] : null,
    })
  }
  return items
}

interface VercelDeployment {
  uid?: string
  url: string
  createdAt?: number
  readyState?: string
  state?: string
  meta?: Record<string, string>
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  } catch (e) {
    return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e) }
  }
}

async function listDeployments(token: string, projectId: string, orgId: string | undefined, limit: number): Promise<VercelDeployment[]> {
  const params = new URLSearchParams({ projectId, limit: String(limit), state: 'READY' })
  if (orgId) params.set('teamId', orgId)
  const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    console.error(`Vercel API ${res.status}: ${await res.text()}`)
    process.exit(1)
  }
  const j = (await res.json()) as { deployments?: VercelDeployment[] }
  return (j.deployments ?? []).filter((d) => (d.readyState ?? d.state) === 'READY' && d.url)
}

async function main(): Promise<void> {
  const limit = arg('limit', 20)
  const token = readToken()
  const { projectId, orgId } = readProject()

  console.log(`Listing up to ${limit} READY deployments…`)
  const deployments = await listDeployments(token, projectId, orgId, limit)
  console.log(`Found ${deployments.length} deployments.\n`)

  const pages: RecoveredPage[] = []
  for (const d of deployments) {
    const base = d.url.startsWith('http') ? d.url : `https://${d.url}`
    const commit = d.meta?.githubCommitMessage ?? d.meta?.gitCommitMessage ?? null
    const createdAt = d.createdAt ? new Date(d.createdAt).toISOString() : null
    for (const route of ROUTES) {
      const url = `${base}${route}`
      const { ok, status, text } = await fetchText(url)
      const page: RecoveredPage = {
        deploymentUrl: base,
        deploymentCreatedAt: createdAt,
        gitCommitMessage: commit,
        route,
        url,
        ok,
        status,
        title: ok ? extractTitle(text) : null,
        headings: ok ? extractHeadings(text) : [],
        items: ok ? extractItems(text) : [],
        images: ok ? extractImages(text).slice(0, 40) : [],
      }
      if (!ok) page.error = `HTTP ${status}`
      pages.push(page)
      console.log(`${ok ? '✓' : '✗'} ${url} — ${page.items.length} items, ${page.headings.length} headings`)
    }
  }

  const totalItems = pages.reduce((n, p) => n + p.items.length, 0)
  const body = {
    project: 'dacha-tv-site',
    recoveredAt: new Date().toISOString(),
    deploymentsScanned: deployments.length,
    pagesScanned: pages.length,
    totalItems,
    pages,
  }

  const dir = join(process.cwd(), 'backups')
  mkdirSync(dir, { recursive: true })
  const out = join(dir, 'recovered-public-content.json')
  writeFileSync(out, JSON.stringify(body, null, 2), 'utf8')
  console.log(`\nSaved → ${out}  (${totalItems} item links across ${pages.length} pages)`)
}

main().catch((e: unknown) => {
  console.error('recover-old-public-content failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
