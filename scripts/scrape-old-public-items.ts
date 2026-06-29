/**
 * scrape-old-public-items.ts — fetch each recovered item's detail page from the
 * old deployment and extract structured fields for restore.
 *
 * Input:  backups/recovered-public-content.json  (from recover-old-public-content.ts)
 * Output: backups/recovered-old-items.json       (gitignored)
 *
 * For every unique item link found, fetches deploymentUrl + route and extracts:
 *   title, slug, section/type (honey|flowers|products|beekeeper|services|catalog),
 *   description, price, image URL, metadata, source URL.
 *
 * Run:
 *   pnpm dlx tsx scripts/scrape-old-public-items.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const IN_PATH = join(process.cwd(), 'backups', 'recovered-public-content.json')
const OUT_PATH = join(process.cwd(), 'backups', 'recovered-old-items.json')

type Section = 'honey' | 'flowers' | 'products' | 'beekeeper' | 'services' | 'catalog' | 'unknown'

interface InputItem { name: string; href: string; price: string | null; image: string | null }
interface InputPage {
  deploymentUrl: string
  deploymentCreatedAt: string | null
  gitCommitMessage: string | null
  route: string
  items: InputItem[]
}
interface InputFile { pages: InputPage[] }

interface ScrapedItem {
  title: string | null
  slug: string
  section: Section
  href: string
  description: string | null
  price: string | null
  priceUah: number | null
  image: string | null
  metadata: Record<string, string>
  sourceUrl: string
  deploymentUrl: string
  deploymentCreatedAt: string | null
  ok: boolean
  status: number
}

function sectionOf(href: string): Section {
  if (href.startsWith('/honey/')) return 'honey'
  if (href.startsWith('/flowers/')) return 'flowers'
  if (href.startsWith('/products/')) return 'products'
  if (href.startsWith('/beekeeper/')) return 'beekeeper'
  if (href.startsWith('/services/')) return 'services'
  if (href.startsWith('/catalog/')) return 'catalog'
  return 'unknown'
}

function slugOf(href: string): string {
  const clean = href.split('?')[0].split('#')[0].replace(/\/$/, '')
  return clean.slice(clean.lastIndexOf('/') + 1)
}

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

function metaContent(html: string, key: 'name' | 'property', value: string): string | null {
  const re = new RegExp(`<meta[^>]+${key}=["']${value}["'][^>]+content=["']([^"']*)["']`, 'i')
  const m = re.exec(html)
  if (m) return stripTags(m[1]) || null
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${key}=["']${value}["']`, 'i')
  const m2 = re2.exec(html)
  return m2 ? stripTags(m2[1]) || null : null
}

const PRICE_RE = /(?:від\s*)?\d[\d\s ]{0,9}(?:грн|₴|UAH)/i

function priceToUah(price: string | null): number | null {
  if (!price) return null
  const digits = price.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? n : null
}

function extractTitle(html: string): string | null {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  if (h1) { const t = stripTags(h1[1]); if (t) return t }
  const og = metaContent(html, 'property', 'og:title')
  if (og) return og
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return title ? stripTags(title[1]) || null : null
}

function extractDescription(html: string): string | null {
  const md = metaContent(html, 'name', 'description') ?? metaContent(html, 'property', 'og:description')
  if (md) return md
  const p = /<p[^>]*>([\s\S]{20,}?)<\/p>/i.exec(html)
  return p ? stripTags(p[1]).slice(0, 600) || null : null
}

function extractImage(html: string): string | null {
  const og = metaContent(html, 'property', 'og:image')
  if (og) return og
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(html)
  return img && !img[1].startsWith('data:') ? img[1] : null
}

function extractPrice(html: string): string | null {
  const m = PRICE_RE.exec(stripTags(html))
  return m ? m[0].replace(/\s+/g, ' ').trim() : null
}

function extractMetadata(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const keys: Array<['name' | 'property', string]> = [
    ['name', 'description'],
    ['property', 'og:title'],
    ['property', 'og:description'],
    ['property', 'og:image'],
    ['property', 'og:url'],
    ['name', 'twitter:title'],
  ]
  for (const [k, v] of keys) {
    const c = metaContent(html, k, v)
    if (c) out[v] = c
  }
  return out
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    return { ok: res.ok, status: res.status, text: await res.text() }
  } catch (e) {
    return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e) }
  }
}

async function main(): Promise<void> {
  if (!existsSync(IN_PATH)) {
    console.error(`Missing ${IN_PATH}. Run scripts/recover-old-public-content.ts first.`)
    process.exit(1)
  }
  const input = JSON.parse(readFileSync(IN_PATH, 'utf8')) as InputFile

  // Deduplicate by href — prefer the NEWEST deployment that lists each href, so
  // we scrape the most recent version of the content.
  const byHref = new Map<string, { href: string; deploymentUrl: string; deploymentCreatedAt: string | null }>()
  for (const page of input.pages ?? []) {
    for (const item of page.items ?? []) {
      const prev = byHref.get(item.href)
      const prevTime = prev?.deploymentCreatedAt ? Date.parse(prev.deploymentCreatedAt) : -1
      const curTime = page.deploymentCreatedAt ? Date.parse(page.deploymentCreatedAt) : 0
      if (!prev || curTime >= prevTime) {
        byHref.set(item.href, { href: item.href, deploymentUrl: page.deploymentUrl, deploymentCreatedAt: page.deploymentCreatedAt })
      }
    }
  }

  console.log(`Scraping ${byHref.size} unique item links…\n`)
  const results: ScrapedItem[] = []

  for (const { href, deploymentUrl, deploymentCreatedAt } of byHref.values()) {
    const sourceUrl = `${deploymentUrl}${href}`
    const { ok, status, text } = await fetchText(sourceUrl)
    const price = ok ? extractPrice(text) : null
    const item: ScrapedItem = {
      title: ok ? extractTitle(text) : null,
      slug: slugOf(href),
      section: sectionOf(href),
      href,
      description: ok ? extractDescription(text) : null,
      price,
      priceUah: priceToUah(price),
      image: ok ? extractImage(text) : null,
      metadata: ok ? extractMetadata(text) : {},
      sourceUrl,
      deploymentUrl,
      deploymentCreatedAt,
      ok,
      status,
    }
    results.push(item)
    console.log(`${ok ? '✓' : '✗'} [${item.section}] ${item.slug} — ${item.title ?? '(no title)'}`)
  }

  const bySection: Record<string, number> = {}
  for (const r of results) bySection[r.section] = (bySection[r.section] ?? 0) + 1

  const body = {
    project: 'dacha-tv-site',
    scrapedAt: new Date().toISOString(),
    totalItems: results.length,
    bySection,
    items: results,
  }
  writeFileSync(OUT_PATH, JSON.stringify(body, null, 2), 'utf8')
  console.log(`\nSaved → ${OUT_PATH}  (${results.length} items; ${JSON.stringify(bySection)})`)
}

main().catch((e: unknown) => {
  console.error('scrape-old-public-items failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
