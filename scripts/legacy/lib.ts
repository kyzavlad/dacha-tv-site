// ─── Legacy → current catalog audit/migration — shared library ────────────────
// Self-contained (only @supabase/supabase-js + node builtins). Used by the two
// one-time CLI tools:
//   • scripts/audit-legacy-catalog.ts   (read-only comparison + local report)
//   • scripts/migrate-legacy-catalog.ts (dry-run default; APPLY behind a token)
//
// EGRESS SAFETY (hard requirement): neither the current nor the legacy tables are
// ever downloaded whole. Legacy is streamed in bounded pages; for each page the
// current DB is queried ONLY for that page's stable keys, in bounded chunks. The
// 105k+ catalog_products table is never pulled into memory by a single read.
//
// Service-role keys are read from env and NEVER printed or written to any report.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const APPLY_CONFIRM_TOKEN = 'I-UNDERSTAND-WRITE-TO-CURRENT'
export const ARTIFACT_DIR = resolve(process.cwd(), 'audit/legacy-catalog')
export const METAL_CATEGORY_SLUG = 'metaloprofil-pokrivlia-komplektuiuchi'

// Bounded read sizes. Legacy pages 200–500; current key-lookup chunks ≤ 200.
export const LEGACY_PAGE_SIZE = 300
export const CURRENT_KEY_CHUNK = 200

export interface Creds { url: string; key: string }
export interface Env { current: Creds; legacy: Creds }

export function loadEnv(): Env {
  const current = { url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', key: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' }
  const legacy = { url: process.env.LEGACY_SUPABASE_URL ?? '', key: process.env.LEGACY_SUPABASE_SERVICE_ROLE_KEY ?? '' }
  const missing: string[] = []
  if (!current.url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!current.key) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!legacy.url) missing.push('LEGACY_SUPABASE_URL')
  if (!legacy.key) missing.push('LEGACY_SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`)
  return { current, legacy }
}

export function makeClient({ url, key }: Creds): SupabaseClient {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// The real project ref (subdomain). Used for the explicit APPLY confirmation.
export function projectRef(url: string): string {
  try { return new URL(url).host.split('.')[0] } catch { return '' }
}
// Redacted ref for reports — never the key.
export function sanitizeRef(url: string): string {
  const r = projectRef(url)
  return r ? `ref:${r.slice(0, 4)}…` : 'ref:?'
}

// ── Table configs ─────────────────────────────────────────────────────────────
export interface TableConfig {
  table: string
  label: string
  matchKeys: string[]          // ordered stable-id → slug → business key
  fillFields: string[]         // content fields (fill-if-empty)
  mediaFields: string[]        // subset of fillFields that hold a URL
  arrayMediaFields: string[]   // media fields that are text[]/jsonb arrays
  restoreMissing: boolean      // insert legacy-only rows (missing manual products)?
  restoreWhen?: (row: Row) => boolean
  restoreColumns?: string[]    // safe columns to copy when restoring a missing row
  // For huge tables (catalog_products): restrict the LEGACY page scan to manual +
  // metal-profile rows so supplier-backed rows are never bulk-scanned. Built from
  // the columns that actually exist in the legacy project (schema-drift safe).
  legacyFilterOr?: (presentLegacyCols: Set<string>) => string | null
  note: string
}

export type Row = Record<string, unknown>

export const TABLES: TableConfig[] = [
  {
    table: 'honey_products', label: 'Мед', matchKeys: ['id', 'slug'],
    fillFields: ['description', 'short_description', 'full_description', 'aroma_notes', 'taste_notes', 'color_note', 'crystallization_note', 'recommended_use', 'packaging_note', 'image_url', 'image_alt', 'gallery_images', 'video_url', 'youtube_video_urls', 'youtube_video_link'],
    mediaFields: ['image_url', 'video_url', 'youtube_video_link'], arrayMediaFields: ['gallery_images', 'youtube_video_urls'],
    restoreMissing: false, note: 'Never touch price_plastic_uah/price_glass_uah or status (single-price model preserved).',
  },
  {
    table: 'apiary_products', label: 'Продукти пасіки', matchKeys: ['id', 'slug'],
    fillFields: ['description', 'full_description', 'image_url', 'image_alt', 'gallery_images', 'youtube_video_url', 'video_url'],
    mediaFields: ['image_url', 'youtube_video_url', 'video_url'], arrayMediaFields: ['gallery_images'],
    restoreMissing: true, restoreWhen: () => true,
    restoreColumns: ['name', 'slug', 'description', 'image_url', 'image_alt', 'display_order'],
    note: 'Restore genuinely missing manual apiary products.',
  },
  {
    table: 'beekeeper_products', label: 'Пасічникам', matchKeys: ['id', 'slug'],
    fillFields: ['description', 'full_description', 'season_note', 'image_url', 'image_alt', 'gallery_images', 'youtube_video_url'],
    mediaFields: ['image_url', 'youtube_video_url'], arrayMediaFields: ['gallery_images'],
    restoreMissing: true, restoreWhen: () => true,
    restoreColumns: ['name', 'slug', 'product_type', 'description', 'image_url', 'image_alt', 'display_order'],
    note: 'Restore genuinely missing beekeeper-supply products.',
  },
  {
    table: 'flower_products', label: 'Квіти', matchKeys: ['id', 'slug'],
    fillFields: ['short_description', 'full_description', 'color', 'bloom_season', 'lighting', 'packaging_note', 'image_url', 'image_alt', 'youtube_video_url', 'gallery_images', 'video_url'],
    mediaFields: ['image_url', 'youtube_video_url', 'video_url'], arrayMediaFields: ['gallery_images'],
    restoreMissing: true, restoreWhen: () => true,
    restoreColumns: ['name', 'slug', 'category', 'variety', 'short_description', 'full_description', 'image_url', 'image_alt', 'display_order'],
    note: 'Never touch price_uah/status. Restore missing manual flower products.',
  },
  {
    table: 'services', label: 'Послуги', matchKeys: ['id', 'slug'],
    fillFields: ['short_description', 'description', 'price_note', 'duration_note', 'image_url'],
    mediaFields: ['image_url'], arrayMediaFields: [],
    restoreMissing: false, note: 'Never touch price_uah/status/booking config.',
  },
  {
    table: 'catalog_categories', label: 'Категорії каталогу', matchKeys: ['id', 'slug'],
    fillFields: ['description', 'description_ua', 'h1', 'meta_title', 'meta_description', 'seo_keywords', 'image_url'],
    mediaFields: ['image_url'], arrayMediaFields: [],
    restoreMissing: false, note: 'Fill empty SEO/intro only. Never change is_published/slug/source.',
  },
  {
    table: 'catalog_products', label: 'Ручні/металопрофіль товари', matchKeys: ['id', 'supplier_sku', 'slug'],
    fillFields: ['short_description', 'description', 'description_ua', 'meta_title', 'meta_description', 'seo_keywords', 'main_image_url', 'images'],
    mediaFields: ['main_image_url'], arrayMediaFields: ['images'],
    restoreMissing: true,
    restoreWhen: (r) => r.source === 'manual' || r.category_slug === METAL_CATEGORY_SLUG,
    restoreColumns: ['supplier_sku', 'name_ua', 'slug', 'category_slug', 'short_description', 'description', 'description_ua', 'price_uah', 'compare_price_uah', 'main_image_url', 'images', 'attributes', 'source', 'lead_type', 'inquiry_only', 'status', 'meta_title', 'meta_description'],
    // Only scan LEGACY manual + metal rows — never the whole supplier catalog.
    legacyFilterOr: (present) => {
      const preds = [`category_slug.eq.${METAL_CATEGORY_SLUG}`]
      if (present.has('source')) preds.unshift('source.eq.manual')
      return preds.join(',')
    },
    note: 'Restore missing manual products (esp. metal-profile). Never overwrite prices/status/slug/supplier data.',
  },
]

// ── Value helpers ─────────────────────────────────────────────────────────────
export function isEmpty(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

export function dedupeMedia(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : (typeof v === 'string' && v ? [v] : [])
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of arr) {
    const url = String(item).trim()
    if (!url || seen.has(url)) continue
    seen.add(url); out.push(url)
  }
  return out
}

export function estimateBytes(value: unknown): number {
  if (value == null) return 0
  if (Array.isArray(value)) return value.reduce((a, v) => a + Buffer.byteLength(String(v)), 0)
  return Buffer.byteLength(String(value))
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// ── Bounded reads ─────────────────────────────────────────────────────────────
// One bounded page of legacy rows. `orFilter` (PostgREST .or() string) narrows a
// huge table server-side. Absent table/column → [] (schema drift between projects).
export async function pageRows(
  client: SupabaseClient, table: string, columns: string, from: number, size: number, orFilter?: string | null,
): Promise<Row[]> {
  let q = client.from(table).select(columns).order('id', { ascending: true }).range(from, from + size - 1)
  if (orFilter) q = q.or(orFilter)
  const { data, error } = await q
  if (error) {
    if ((error as { code?: string }).code === '42P01' || (error as { code?: string }).code === '42703') return []
    throw new Error(`pageRows ${table}[${from}..${from + size - 1}]: ${error.message}`)
  }
  return (data ?? []) as unknown as Row[]
}

// HEAD count (no rows transferred) for totals.
export async function headCount(client: SupabaseClient, table: string, orFilter?: string | null): Promise<number | null> {
  let q = client.from(table).select('id', { count: 'exact', head: true })
  if (orFilter) q = q.or(orFilter)
  const { count, error } = await q
  if (error) return null
  return count ?? 0
}

// Which of a config's columns actually exist (schema-drift guard) — a HEAD select
// returns 42703 for an undefined column.
export async function existingColumns(client: SupabaseClient, table: string, columns: string[]): Promise<Set<string>> {
  const present = new Set<string>()
  await Promise.all(columns.map(async (col) => {
    const { error } = await client.from(table).select(col, { head: true }).limit(1)
    if (!error || (error as { code?: string }).code !== '42703') present.add(col)
  }))
  return present
}

export interface PageKeys { ids: string[]; slugs: string[]; skus: string[] }

export function keysOf(rows: Row[], matchKeys: string[]): PageKeys {
  const ids = new Set<string>(), slugs = new Set<string>(), skus = new Set<string>()
  for (const r of rows) {
    if (matchKeys.includes('id') && r.id != null) ids.add(String(r.id))
    if (matchKeys.includes('slug') && r.slug != null && String(r.slug).trim()) slugs.add(String(r.slug))
    if (matchKeys.includes('supplier_sku') && r.supplier_sku != null && String(r.supplier_sku).trim()) skus.add(String(r.supplier_sku))
  }
  return { ids: [...ids], slugs: [...slugs], skus: [...skus] }
}

// Fetch ONLY the current rows matching a legacy page's keys, in bounded chunks.
// This is the reason the whole current catalog is never loaded.
export async function fetchCurrentByKeys(
  client: SupabaseClient, table: string, columns: string, keys: PageKeys, matchKeys: string[],
): Promise<Row[]> {
  const byId = new Map<string, Row>()
  const absorb = (rows: Row[]) => { for (const r of rows) byId.set(String(r.id ?? `slug:${r.slug}`), r) }
  const runIn = async (col: string, values: string[]) => {
    for (const part of chunk(values, CURRENT_KEY_CHUNK)) {
      if (!part.length) continue
      const { data, error } = await client.from(table).select(columns).in(col, part)
      if (error) {
        if ((error as { code?: string }).code === '42703' || (error as { code?: string }).code === '42P01') return
        throw new Error(`fetchCurrentByKeys ${table}.${col}: ${error.message}`)
      }
      absorb((data ?? []) as unknown as Row[])
    }
  }
  if (matchKeys.includes('id')) await runIn('id', keys.ids)
  if (matchKeys.includes('slug')) await runIn('slug', keys.slugs)
  if (matchKeys.includes('supplier_sku')) await runIn('supplier_sku', keys.skus)
  return [...byId.values()]
}

// ── Matching (pure) ───────────────────────────────────────────────────────────
export interface MatchResult {
  matched: { legacy: Row; current: Row; key: string }[]
  legacyOnly: Row[]
  ambiguous: Row[]
}
function keyVal(row: Row, key: string): string | null {
  const v = row[key]
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  return s === '' ? null : s
}
// Match legacy → current using ordered stable keys ONLY (id → slug → business
// key). NEVER fuzzy name. A key mapping to >1 current row is ambiguous.
export function matchRows(legacy: Row[], current: Row[], keys: string[]): MatchResult {
  const indexes = keys.map((k) => {
    const m = new Map<string, Row[]>()
    for (const row of current) {
      const kv = keyVal(row, k)
      if (kv == null) continue
      ;(m.get(kv) ?? m.set(kv, []).get(kv)!).push(row)
    }
    return m
  })
  const matched: MatchResult['matched'] = []
  const legacyOnly: Row[] = []
  const ambiguous: Row[] = []
  for (const lrow of legacy) {
    let hit: { current: Row; key: string } | null = null
    let isAmbiguous = false
    for (let i = 0; i < keys.length; i++) {
      const kv = keyVal(lrow, keys[i])
      if (kv == null) continue
      const bucket = indexes[i].get(kv)
      if (!bucket || bucket.length === 0) continue
      if (bucket.length > 1) { isAmbiguous = true; break }
      hit = { current: bucket[0], key: keys[i] }; break
    }
    if (isAmbiguous) ambiguous.push(lrow)
    else if (hit) matched.push({ legacy: lrow, current: hit.current, key: hit.key })
    else legacyOnly.push(lrow)
  }
  return { matched, legacyOnly, ambiguous }
}

// ── Fill planning (pure) ──────────────────────────────────────────────────────
export interface FieldFill { field: string; bytes: number; isMedia: boolean }

// Fields where current is empty but legacy has a value (fill-if-empty only).
// For catalog_categories, a generated fallback (description_auto_generated=true)
// counts as still-empty for `description`, so legacy content may replace it.
export function planFills(
  cfg: TableConfig, legacy: Row, current: Row, presentCols: Set<string>,
): { fills: FieldFill[]; values: Row } {
  const fills: FieldFill[] = []
  const values: Row = {}
  for (const field of cfg.fillFields) {
    if (!presentCols.has(field)) continue
    const generatedFallback = field === 'description' && current.description_auto_generated === true
    if (!isEmpty(current[field]) && !generatedFallback) continue
    let value = legacy[field]
    if (isEmpty(value)) continue
    const isMedia = cfg.mediaFields.includes(field) || cfg.arrayMediaFields.includes(field)
    if (cfg.arrayMediaFields.includes(field)) value = dedupeMedia(value)
    values[field] = value
    fills.push({ field, bytes: estimateBytes(value), isMedia })
  }
  return { fills, values }
}

// ── Streaming orchestrator (pure control-flow; IO injected → testable) ─────────
export interface CompareIO {
  pageLegacy: (from: number, size: number) => Promise<Row[]>
  fetchCurrentByKeys: (keys: PageKeys) => Promise<Row[]>
}
export interface CompareHandlers {
  onMatched: (legacy: Row, current: Row, key: string) => void | Promise<void>
  onLegacyOnly: (legacy: Row) => void | Promise<void>
  onAmbiguous: (legacy: Row) => void | Promise<void>
}
// Streams legacy in bounded pages; for each page fetches ONLY the matching current
// rows by key, matches, and dispatches. Never accumulates either full table.
export async function streamCompare(
  cfg: TableConfig, io: CompareIO, handlers: CompareHandlers, pageSize: number = LEGACY_PAGE_SIZE,
): Promise<{ legacyRows: number; pages: number }> {
  if (pageSize < 1 || pageSize > 500) throw new Error(`pageSize ${pageSize} out of bounds (1..500)`)
  let from = 0, legacyRows = 0, pages = 0
  for (;;) {
    const page = await io.pageLegacy(from, pageSize)
    if (page.length === 0) break
    pages++; legacyRows += page.length
    const current = await io.fetchCurrentByKeys(keysOf(page, cfg.matchKeys))
    const { matched, legacyOnly, ambiguous } = matchRows(page, current, cfg.matchKeys)
    for (const m of matched) await handlers.onMatched(m.legacy, m.current, m.key)
    for (const r of legacyOnly) await handlers.onLegacyOnly(r)
    for (const r of ambiguous) await handlers.onAmbiguous(r)
    if (page.length < pageSize) break
    from += pageSize
  }
  return { legacyRows, pages }
}

// ── Media accessibility (HEAD, bounded by caller) ─────────────────────────────
export async function checkUrl(url: string): Promise<{ url: string; ok: boolean; status: number | null }> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return { url, ok: res.ok, status: res.status }
  } catch {
    return { url, ok: false, status: null }
  }
}

// ── Artifact writing ──────────────────────────────────────────────────────────
export function writeArtifact(name: string, data: unknown): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  const path = resolve(ARTIFACT_DIR, name)
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8')
  return path
}
