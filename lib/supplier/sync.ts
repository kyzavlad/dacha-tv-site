import { getAdminClient } from '@/lib/supabase/admin'
import {
  classifyBuildFailure, classifyPriceIssue, classifyUpsertError, isRetryableDbError,
  recordError, mergeErrorReport, emptyErrorReport,
  type SupplierErrorReport,
} from '@/lib/supplier/error-grouping'

// ─── API config ───────────────────────────────────────────────────────────────
// personal.cab uses a single base endpoint with query-param routing:
//   GET {SUPPLIER_API_URL}?key=KEY&method=METHOD&type=json
// Do NOT append REST paths. Do NOT use Bearer auth.

function getApiConfig() {
  const url = process.env.SUPPLIER_API_URL
  const key = process.env.SUPPLIER_API_KEY
  if (!url || !key) throw new Error('SUPPLIER_API_URL and SUPPLIER_API_KEY env vars are required')
  return { base: url.replace(/\/$/, ''), key }
}

// Every supplier HTTP call is bounded by a hard wall-clock timeout so a slow
// or hanging personal.cab response can never hang the cron route (and, on the
// 3.7GB self-host box, never holds a Node request open indefinitely). Returns
// a controlled, clearly-labeled error instead of letting an AbortError leak
// to the caller unlabeled.
const DEFAULT_SUPPLIER_TIMEOUT_MS = 15000

async function timedFetch(url: string, init: RequestInit, method: string, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`personal.cab API method=${method} timed out after ${timeoutMs}ms`)
    }
    throw e
  }
}

interface ApiFetchResult {
  raw: unknown
  safeUrl: string   // key masked for logging
  httpStatus: number
  topLevelKeys: string[]
}

async function apiFetch(method: string, extra: Record<string, string> = {}, timeoutMs = DEFAULT_SUPPLIER_TIMEOUT_MS): Promise<ApiFetchResult> {
  const { base, key } = getApiConfig()
  const params = new URLSearchParams({ key, method, type: 'json', ...extra })
  const fullUrl = `${base}?${params}`
  const safeUrl = `${base}?method=${method}&type=json&key=***`

  const res = await timedFetch(fullUrl, { cache: 'no-store', headers: { Accept: 'application/json' } }, method, timeoutMs)
  if (!res.ok) throw new Error(`personal.cab API method=${method} → ${res.status} ${res.statusText}`)

  const raw = await res.json()
  const topLevelKeys = raw && typeof raw === 'object' ? Object.keys(raw as object) : []
  return { raw, safeUrl, httpStatus: res.status, topLevelKeys }
}

// Raw-text fetch variant — used for XML/YML feeds the JSON parser can't handle.
async function apiFetchText(method: string, extra: Record<string, string> = {}, timeoutMs = DEFAULT_SUPPLIER_TIMEOUT_MS): Promise<{
  text: string
  safeUrl: string
  httpStatus: number
  contentType: string
}> {
  const { base, key } = getApiConfig()
  const params = new URLSearchParams({ key, method, ...extra })
  const fullUrl = `${base}?${params}`
  const safeUrl = `${base}?method=${method}&${new URLSearchParams(extra)}&key=***`

  const res = await timedFetch(fullUrl, { cache: 'no-store' }, method, timeoutMs)
  const text = await res.text()
  return {
    text,
    safeUrl,
    httpStatus: res.status,
    contentType: res.headers.get('content-type') ?? '',
  }
}

// ─── XML / YML category parsing ─────────────────────────────────────────────────
// personal.cab's JSON product feed carries only a numeric category_id — the
// human-readable names live in the YML/XML <categories> block (standard
// yml_catalog layout). These parsers turn that block into an id→name map.

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .trim()
}

export interface ParsedCategory {
  id: string
  name: string
  parentId: string | null
}

// Parse a YML/XML feed's <categories> block. Handles both the standard YML
// attribute form  <category id="1" parentId="0">Name</category>  and the
// nested form  <category><id>1</id><name>Name</name></category>.
export function parseXmlCategories(xml: string): ParsedCategory[] {
  const out: ParsedCategory[] = []
  const seen = new Set<string>()

  // Form A: <category id="N" parentId="M">Name</category>
  const attrRe = /<category\b([^>]*?)>([\s\S]*?)<\/category>/gi
  let m: RegExpExecArray | null
  while ((m = attrRe.exec(xml)) !== null) {
    const attrs = m[1]
    const inner = m[2]
    const idMatch = /\bid\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)
    const parentMatch = /\bparent(?:Id|_id)?\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)
    // If inner contains nested <name>/<id>, this is Form B — handle below instead.
    const nameTag = /<name\b[^>]*>([\s\S]*?)<\/name>/i.exec(inner)
    const idTag = /<id\b[^>]*>([\s\S]*?)<\/id>/i.exec(inner)
    const id = idMatch ? idMatch[1].trim() : (idTag ? decodeXmlEntities(idTag[1]) : '')
    const name = nameTag ? decodeXmlEntities(nameTag[1]) : decodeXmlEntities(inner)
    const parentId = parentMatch ? parentMatch[1].trim() : null
    if (id && name && !seen.has(id)) {
      seen.add(id)
      out.push({ id, name, parentId })
    }
  }

  return out
}

// ─── Response normalisation ───────────────────────────────────────────────────

function extractProducts(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []
  const d = raw as Record<string, unknown>

  // Explicit array keys — personal.cab uses "products" or "tovar"
  for (const k of ['products', 'tovar', 'data', 'items', 'result', 'results', 'list', 'goods']) {
    if (Array.isArray(d[k])) return d[k] as unknown[]
  }

  // Object-map keyed by id (some APIs return {"123": {...}, "124": {...}})
  const vals = Object.values(d)
  if (vals.length > 0 && typeof vals[0] === 'object' && vals[0] !== null) {
    const first = vals[0] as Record<string, unknown>
    if (first.id != null || first.name != null || first.price != null) return vals
  }

  return []
}

// Exported so both the dedicated category cron AND the product sync (which
// already has the whole get_products response in memory — see requirement
// B) can pull the top-level `categories` array out of the SAME response
// without a second supplier HTTP request.
export function extractCategories(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []
  const d = raw as Record<string, unknown>

  for (const k of ['categories', 'cats', 'groups', 'sections', 'data', 'result', 'results', 'list', 'items']) {
    if (Array.isArray(d[k])) return d[k] as unknown[]
  }

  // Object-map keyed by numeric id — same pattern as extractProducts handles.
  // Some APIs return {"123": {id: "123", name: "Садова техніка"}, ...}
  const vals = Object.values(d)
  if (vals.length > 0 && typeof vals[0] === 'object' && vals[0] !== null) {
    const first = vals[0] as Record<string, unknown>
    if (first.id != null || first.name != null || first.category_id != null) return vals
  }

  return []
}

function autoSlug(text: string): string {
  const map: Record<string, string> = {
    а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ye',ж:'zh',з:'z',
    и:'y',і:'i',ї:'yi',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',
    р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'yu',я:'ya',
  }
  return text.toLowerCase().split('').map((c) => map[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `item-${Date.now()}`
}

function summarise(records: unknown[], limit = 3): unknown[] {
  return records.slice(0, limit).map((r) => {
    if (!r || typeof r !== 'object') return r
    const o = r as Record<string, unknown>
    return {
      id: o.id ?? o.supplier_id,
      sku: o.sku ?? o.vendor_code ?? o.article,
      name: o.name ?? o.title,
      price: o.price ?? o.price_uah ?? o.retail_price,
      stock: o.quantity ?? o.stock ?? o.count,
      category_id: o.category_id ?? o.cat_id,
    }
  })
}

// ─── Stale run detection ──────────────────────────────────────────────────────
// Marks runs stuck in 'running' for >10 min as 'stale'.
// Returns true if a fresh (< 10 min) run of the same type is already active.

const STALE_MS = 10 * 60 * 1000

async function handleActiveRuns(
  client: ReturnType<typeof getAdminClient>,
  syncType: string,
): Promise<boolean> {
  const { data: active } = await client
    .from('supplier_sync_log')
    .select('id, started_at')
    .eq('sync_type', syncType)
    .eq('status', 'running')

  if (!active || active.length === 0) return false

  const now = Date.now()
  const staleIds: string[] = []
  let hasFresh = false

  for (const run of active) {
    const age = now - new Date(run.started_at as string).getTime()
    if (age > STALE_MS) {
      staleIds.push(run.id as string)
    } else {
      hasFresh = true
    }
  }

  if (staleIds.length > 0) {
    await client.from('supplier_sync_log').update({
      status: 'stale',
      error_details: { message: 'Auto-marked stale: run exceeded 10 min without completing' },
      completed_at: new Date().toISOString(),
    }).in('id', staleIds)
  }

  return hasFresh
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean
  synced: number
  errors: number              // HARD DB/write failures only (records not persisted)
  diagnosticIssues?: number   // non-fatal data-quality issues (skipped/priceless rows)
  message: string
  alreadyRunning?: boolean
  priceSample?: Array<{ sku: string; rawFields: Record<string, unknown>; computedUah: number | null }>
  priceWarning?: string
  // ── full-sync windowing (set by syncSupplierProducts) ──
  totalInFeed?: number    // products in the whole feed response
  processed?: number      // rows processed in THIS invocation
  inserted?: number       // brand-new SKUs upserted this invocation
  updated?: number        // existing SKUs re-upserted this invocation
  nextOffset?: number | null // pass back as ?offset= to continue; null when done
  done?: boolean          // true when offset reached the end of the feed
  completedWithErrors?: boolean          // true when the cycle finished but errors occurred
  errorGroups?: Record<string, number>   // categorized failure counts (item 8)
  // ── categories reused from the already-downloaded get_products response ──
  categorySync?: { attempted: boolean; synced: number; errors: number; message: string }
}

function safeStock(raw: unknown): number {
  if (raw == null) return 0
  const n = Number(raw)
  return isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

// ─── Shared price resolution ──────────────────────────────────────────────────
// Single source of truth for converting a raw supplier record into a UAH price.
// Used by BOTH the full product sync and the prices/stock refresh so they can
// never diverge. (The refresh previously wrote the raw `price` field — which is
// USD on this supplier feed — straight into price_uah, producing absurd values
// like 0.58 UAH for items that are actually 0.58 USD ≈ 24 UAH.)
// Priority: price_uah (explicit UAH) → retail_price (UAH) → price_usd*rate → price*rate → null
export function extractRootCurrency(raw: unknown): number | null {
  const rootObj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const rootCurrRaw = rootObj.currency ?? rootObj.rate ?? rootObj.uah_rate ?? rootObj.exchange_rate
  return (
    rootCurrRaw != null &&
    typeof rootCurrRaw !== 'object' &&
    isFinite(Number(rootCurrRaw)) &&
    Number(rootCurrRaw) > 5
  ) ? Number(rootCurrRaw) : null
}

export function resolvePriceUah(
  p: Record<string, unknown>,
  rootCurrency: number | null,
): { priceUah: number | null; priceUsd: number | null; effectiveRate: number | null; winField: string } {
  const priceUahDirect = p.price_uah != null ? Number(p.price_uah) : null
  const retailPrice    = p.retail_price != null ? Number(p.retail_price) : null
  const priceUsdRaw    = p.price_usd ?? p.usd ?? p.usd_price
  const priceUsd       = priceUsdRaw != null ? Number(priceUsdRaw) : null
  const priceField     = p.price != null ? Number(p.price) : null
  const itemRateRaw    = p.rate ?? p.uah_rate ?? p.currency_rate ?? p.exchange_rate
  const itemRate       = itemRateRaw != null ? Number(itemRateRaw) : null
  const effectiveRate  = (itemRate != null && itemRate > 5) ? itemRate : rootCurrency

  let priceUah: number | null = null
  let winField = 'none'

  if (priceUahDirect != null && isFinite(priceUahDirect) && priceUahDirect > 0) {
    priceUah = Math.round(priceUahDirect)
    winField = 'price_uah'
  } else if (retailPrice != null && isFinite(retailPrice) && retailPrice > 0) {
    priceUah = Math.round(retailPrice)
    winField = 'retail_price'
  } else if (priceUsd != null && isFinite(priceUsd) && priceUsd > 0 && effectiveRate != null) {
    priceUah = Math.round(priceUsd * effectiveRate)
    winField = `price_usd*rate(${effectiveRate})${itemRate == null ? '[root]' : ''}`
  } else if (priceField != null && isFinite(priceField) && priceField > 0 && effectiveRate != null) {
    priceUah = Math.round(priceField * effectiveRate)
    winField = `price*rate(${effectiveRate})${itemRate == null ? '[root]' : ''}`
  } else if (priceField != null && isFinite(priceField) && priceField > 0) {
    // Has a numeric price but no rate — cannot determine currency. Caller should
    // preserve the existing DB value rather than write an unconverted number.
    winField = 'rate_missing'
  }

  return { priceUah, priceUsd, effectiveRate, winField }
}

// ─── Deterministic category id→name map from the real supplier feed ────────────
// Strategy (no assumptions about which feed carries names — try in order):
//   1. YML feed  (get_products&type=yml) — <categories> block
//   2. XML feed  (get_products&type=xml) — <categories> block
//   3. JSON get_categories                — dedicated endpoint
//   4. JSON derived from products         — last resort (numeric fallback)
// Returns the map plus which source actually produced names, for diagnostics.
export async function fetchSupplierCategoryMap(): Promise<{
  map: Map<string, string>
  source: string
  parents: Map<string, string | null>
}> {
  const map = new Map<string, string>()
  const parents = new Map<string, string | null>()

  const tryFeed = async (type: 'yml' | 'xml'): Promise<boolean> => {
    try {
      const { text } = await apiFetchText('get_products', { type, language: 'ua' })
      const cats = parseXmlCategories(text)
      const named = cats.filter((c) => c.name && !/^\d+$/.test(c.name))
      if (named.length === 0) return false
      for (const c of cats) {
        if (c.name && !/^\d+$/.test(c.name)) {
          map.set(c.id, c.name)
          parents.set(c.id, c.parentId)
        }
      }
      return map.size > 0
    } catch {
      return false
    }
  }

  if (await tryFeed('yml')) return { map, source: 'yml', parents }
  if (await tryFeed('xml')) return { map, source: 'xml', parents }

  // JSON get_categories
  try {
    const { raw } = await apiFetch('get_categories')
    const cats = extractCategories(raw)
    for (const cat of cats) {
      const c = cat as Record<string, unknown>
      const id = String(c.id ?? c.category_id ?? c.supplier_id ?? '').trim()
      const name = String(c.name ?? c.title ?? c.category_name ?? '').trim()
      if (id && name && !/^\d+$/.test(name)) {
        map.set(id, name)
        parents.set(id, c.parent_id != null ? String(c.parent_id) : null)
      }
    }
    if (map.size > 0) return { map, source: 'get_categories', parents }
  } catch { /* fall through */ }

  return { map, source: 'none', parents }
}

// ─── Typed result for the feed diagnostic ────────────────────────────────────

export interface FeedDiagCatSample { id: string; name: string; parentId: string | null }

export interface FeedDiagXmlResult {
  safeUrl: string
  httpStatus: number
  contentType: string
  bytes: number
  hasCategoriesBlock: boolean
  parsedCategoryCount: number
  namedCategoryCount: number
  sampleCategories: FeedDiagCatSample[]
  bodyPreview: string
  error?: undefined
}

export interface FeedDiagJsonResult {
  safeUrl: string
  httpStatus: number
  topLevelKeys: string[]
  productCount: number
  firstProductKeys: string[]
  categoryIdSample: string | null
  readableCategoryNameFields: string[]
  hasReadableCategoryNameInProducts: boolean
  error?: undefined
}

export interface FeedDiagResult {
  winnerSource: 'yml' | 'xml' | 'get_categories' | 'none'
  json: FeedDiagJsonResult | { error: string }
  yml:  FeedDiagXmlResult  | { error: string }
  xml:  FeedDiagXmlResult  | { error: string }
}

// ─── Diagnostic: inspect the real supplier payloads ──────────────────────────
// Fetches get_products in json / xml / yml and reports WHERE category names live.
export async function inspectSupplierFeeds(): Promise<FeedDiagResult> {
  let jsonResult: FeedDiagResult['json']

  // JSON: structure + whether products carry a readable category name field
  try {
    const { raw, httpStatus, topLevelKeys, safeUrl } = await apiFetch('get_products', { language: 'ua', stock: '1' })
    const products = extractProducts(raw)
    const first = (products[0] ?? {}) as Record<string, unknown>
    const catNameFields = ['category', 'category_name', 'cat_name', 'group', 'group_name', 'section', 'section_name']
    const presentCatNameFields = catNameFields.filter((f) => first[f] != null && String(first[f]).trim() !== '')
    jsonResult = {
      safeUrl, httpStatus, topLevelKeys,
      productCount: products.length,
      firstProductKeys: Object.keys(first),
      categoryIdSample: String(first.category_id ?? first.cat_id ?? '') || null,
      readableCategoryNameFields: presentCatNameFields,
      hasReadableCategoryNameInProducts: presentCatNameFields.length > 0,
    }
  } catch (e) {
    jsonResult = { error: e instanceof Error ? e.message : String(e) }
  }

  // YML + XML: parse the <categories> block
  const parseFeed = async (type: 'yml' | 'xml'): Promise<FeedDiagResult['yml']> => {
    try {
      const { text, httpStatus, contentType, safeUrl } = await apiFetchText('get_products', { type, language: 'ua', stock: '1' })
      const cats = parseXmlCategories(text)
      const named = cats.filter((c) => c.name && !/^\d+$/.test(c.name))
      return {
        safeUrl, httpStatus, contentType,
        bytes: text.length,
        hasCategoriesBlock: /<categories>/i.test(text),
        parsedCategoryCount: cats.length,
        namedCategoryCount: named.length,
        sampleCategories: named.slice(0, 10).map((c) => ({ id: c.id, name: c.name, parentId: c.parentId })),
        bodyPreview: text.slice(0, 400),
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  const ymlResult = await parseFeed('yml')
  const xmlResult = await parseFeed('xml')

  // Derive winner: whichever feed produced named categories first
  const ymlNamed = ('namedCategoryCount' in ymlResult) ? ymlResult.namedCategoryCount : 0
  const xmlNamed = ('namedCategoryCount' in xmlResult) ? xmlResult.namedCategoryCount : 0
  const winnerSource: FeedDiagResult['winnerSource'] =
    ymlNamed > 0 ? 'yml' :
    xmlNamed > 0 ? 'xml' :
    'none'

  return { winnerSource, json: jsonResult, yml: ymlResult, xml: xmlResult }
}

// ─── Category name/row helpers (pure — no I/O) ────────────────────────────────

// Never let a numeric-only value overwrite an already-readable name. This is
// the guard requirement A.5/F.5 depend on: a source that only knows the raw
// supplier id (e.g. a category referenced by a product but absent from the
// current get_categories response) must not blank out a name a previous,
// better-informed sync already resolved.
export function preferReadableCategoryName(
  existingName: string | null | undefined,
  candidateName: string | null | undefined,
  fallbackId: string,
): string {
  const existing = (existingName ?? '').trim()
  const candidate = (candidateName ?? '').trim()
  const existingReadable = existing !== '' && !/^\d+$/.test(existing)
  const candidateReadable = candidate !== '' && !/^\d+$/.test(candidate)
  if (existingReadable && !candidateReadable) return existing
  if (candidateReadable) return candidate
  if (existingReadable) return existing
  return candidate || fallbackId
}

// Build supplier_categories upsert rows from a raw categories array (from
// either get_categories or the get_products top-level `categories` key —
// same shape either way). `existingNames` is a supplier_id → current DB name
// map used ONLY to protect against the numeric-overwrite regression above;
// passing an empty map is safe (every row just resolves to its own feed name).
// Pure and deterministic given the same `nowIso` — calling it twice with the
// same inputs produces byte-identical rows (idempotency, requirement F.7).
export function buildSupplierCategoryRows(
  categories: unknown[],
  existingNames: Map<string, string>,
  nowIso: string = new Date().toISOString(),
): Record<string, unknown>[] {
  return categories.map((cat) => {
    const c = cat as Record<string, unknown>
    const supplierId = String(c.id ?? c.supplier_id ?? c.category_id ?? '').trim()
    if (!supplierId) return null
    const feedName = String(c.name ?? c.title ?? c.category_name ?? '').trim()
    const resolvedName = preferReadableCategoryName(existingNames.get(supplierId), feedName, supplierId)
    return {
      supplier_id: supplierId,
      name: resolvedName,
      name_ua: c.name_ua ? String(c.name_ua) : null,
      slug: c.slug ? String(c.slug) : null,
      parent_supplier_id: c.parent_id ? String(c.parent_id) : null,
      raw_data: c,
      synced_at: nowIso,
    }
  }).filter(Boolean) as Record<string, unknown>[]
}

// Fetch the current name for every supplier_id in `ids`, chunked past
// PostgREST's 1000-row .in() cap. Used before an upsert so a numeric-only
// candidate can never regress an already-readable stored name.
async function fetchExistingCategoryNames(
  client: ReturnType<typeof getAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await client
      .from('supplier_categories')
      .select('supplier_id, name')
      .in('supplier_id', ids.slice(i, i + 500))
    for (const row of data ?? []) {
      if (row.name) names.set(row.supplier_id as string, row.name as string)
    }
  }
  return names
}

async function upsertSupplierCategoryRows(
  client: ReturnType<typeof getAdminClient>,
  rows: Record<string, unknown>[],
): Promise<{ synced: number; errors: number }> {
  let synced = 0
  let errors = 0
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client.from('supplier_categories').upsert(
      rows.slice(i, i + CHUNK),
      { onConflict: 'supplier_id' },
    )
    if (error) errors += Math.min(CHUNK, rows.length - i)
    else synced += Math.min(CHUNK, rows.length - i)
  }
  return { synced, errors }
}

// ─── Categories sync ──────────────────────────────────────────────────────────

// The ONLY supplier HTTP call syncSupplierCategories makes. Deliberately
// isolated (and exported) so its network behavior — never calling
// get_products, never requesting a YML/XML feed — is directly testable
// without a database, and so the timeout guarantee (requirement D) is
// independently verifiable.
export async function fetchLightweightCategories(timeoutMs?: number): Promise<{
  categories: unknown[]
  safeUrl: string
  httpStatus: number
  topLevelKeys: string[]
}> {
  const result = await apiFetch('get_categories', {}, timeoutMs)
  return {
    categories: extractCategories(result.raw),
    safeUrl: result.safeUrl,
    httpStatus: result.httpStatus,
    topLevelKeys: result.topLevelKeys,
  }
}

// LIGHTWEIGHT BY DESIGN (requirement A). This function must NEVER download the
// complete ~112k-product get_products feed (JSON, YML, or XML) — that download
// belongs to syncSupplierProducts, which already does it once for its own
// purposes and separately upserts categories from the SAME response (see
// requirement B, syncSupplierProducts below). Strategy, in order:
//   1. Dedicated get_categories endpoint (small, cheap) — used if it returns data.
//   2. Otherwise, this function does NOT re-fetch or derive from get_products.
//      supplier_categories already reflects whatever syncSupplierProducts most
//      recently extracted from the product feed's top-level `categories` key —
//      this run simply reports that state rather than re-downloading it.
export async function syncSupplierCategories(): Promise<SyncResult> {
  const client = getAdminClient()

  const alreadyRunning = await handleActiveRuns(client, 'categories')
  if (alreadyRunning) {
    return { ok: false, synced: 0, errors: 0, message: 'Синхронізація категорій вже виконується', alreadyRunning: true }
  }

  const startedAt = Date.now()
  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'categories', status: 'running', triggered_by: 'admin' })
    .select('id')
    .single()

  try {
    let categories: unknown[] = []
    let safeUrl = ''
    let httpStatus = 0
    let topLevelKeys: string[] = []
    let source = 'get_categories'

    try {
      const result = await fetchLightweightCategories()
      safeUrl = result.safeUrl
      httpStatus = result.httpStatus
      topLevelKeys = result.topLevelKeys
      categories = result.categories
    } catch (e) {
      // Dedicated endpoint unavailable/timed out — NOT a fatal error and NOT a
      // reason to fall back to a full-feed download. Fall through to reporting
      // whatever supplier_categories already holds from the last product sync.
      source = `get_categories_unavailable(${e instanceof Error ? e.message : String(e)})`
    }

    if (categories.length === 0) {
      // Requirement A.4 — work from categories already stored during product
      // synchronization instead of re-downloading anything here.
      const { count } = await client
        .from('supplier_categories')
        .select('id', { count: 'exact', head: true })

      const debugInfo = {
        source: `${source}+existing_supplier_categories`,
        safe_url: safeUrl,
        http_status: httpStatus,
        response_top_keys: topLevelKeys,
      }
      const existing = count ?? 0

      await client.from('supplier_sync_log').update({
        status: 'completed',
        categories_total: existing,
        error_details: { ...debugInfo, existing_supplier_categories: existing, duration_ms: Date.now() - startedAt },
        completed_at: new Date().toISOString(),
      }).eq('id', log?.id)

      return {
        ok: existing > 0,
        synced: 0,
        errors: 0,
        message: existing > 0
          ? `get_categories не повернув дані — використано ${existing} категорій, вже збережених із синхронізації товарів`
          : 'get_categories не повернув дані, і ще немає збережених категорій — дочекайтесь синхронізації товарів',
      }
    }

    const ids = [...new Set(
      categories
        .map((cat) => String((cat as Record<string, unknown>).id ?? (cat as Record<string, unknown>).supplier_id ?? (cat as Record<string, unknown>).category_id ?? '').trim())
        .filter(Boolean)
    )]
    const existingNames = await fetchExistingCategoryNames(client, ids)
    const rows = buildSupplierCategoryRows(categories, existingNames)
    const errorsFromBuild = categories.length - rows.length

    const debugInfo = {
      source,
      safe_url: safeUrl,
      http_status: httpStatus,
      response_top_keys: topLevelKeys,
      response_count: categories.length,
      sample_records: summarise(categories),
    }

    const { synced, errors: upsertErrors } = await upsertSupplierCategoryRows(client, rows)
    const errors = errorsFromBuild + upsertErrors

    await client.from('supplier_sync_log').update({
      status: 'completed',
      categories_total: synced,
      products_errors: errors,
      error_details: { ...debugInfo, synced, errors, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)

    return { ok: synced > 0, synced, errors, message: `Збережено ${synced} категорій (у відповіді: ${categories.length}, джерело: ${source})${errors > 0 ? `, помилок: ${errors}` : ''}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return { ok: false, synced: 0, errors: 1, message: msg }
  }
}

// ─── Products sync ────────────────────────────────────────────────────────────

// Build a supplier_products row from one raw feed record. Pure — no I/O.
// Returns null when the record has no usable SKU.
function buildSupplierRow(
  p: Record<string, unknown>,
  rootCurrency: number | null,
): { sku: string; row: Record<string, unknown>; priceUah: number | null; priceUsd: number | null; effectiveRate: number | null; winField: string; stockRaw: unknown } | null {
  const sku = String(p.vendor_code ?? p.sku ?? p.article ?? p.supplier_sku ?? p.id ?? '').trim()
  if (!sku) return null

  let images: string[] = []
  if (Array.isArray(p.images)) {
    images = (p.images as unknown[]).map(String).filter(Boolean)
  } else if (typeof p.images === 'string' && p.images) {
    images = p.images.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (Array.isArray(p.pictures)) {
    images = (p.pictures as unknown[]).map(String).filter(Boolean)
  } else if (typeof p.pictures === 'string' && p.pictures) {
    images = p.pictures.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (Array.isArray(p.photos)) {
    images = (p.photos as unknown[]).map(String).filter(Boolean)
  } else if (typeof p.photos === 'string' && p.photos) {
    images = p.photos.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (p.mainimage) {
    images = [String(p.mainimage)]
  } else if (p.image) {
    images = [String(p.image)]
  } else if (p.photo) {
    images = [String(p.photo)]
  } else if (p.picture) {
    images = [String(p.picture)]
  } else if (p.thumbnail) {
    images = [String(p.thumbnail)]
  } else if (p.img) {
    images = [String(p.img)]
  }

  const { priceUah, priceUsd, effectiveRate, winField } = resolvePriceUah(p, rootCurrency)
  const stockRaw = p.quantity ?? p.count ?? p.stock ?? p.stock_quantity ?? p.qty

  const supplierCurrency =
    winField === 'price_uah' || winField === 'retail_price' ? 'UAH' :
    winField.includes('*rate') ? 'USD' :
    null

  const row: Record<string, unknown> = {
    supplier_sku: sku,
    supplier_category_id: p.category_id != null ? String(p.category_id) : (p.cat_id != null ? String(p.cat_id) : null),
    name: String(p.name ?? p.title ?? ''),
    name_ua: p.name_ua ? String(p.name_ua) : null,
    slug: p.slug ? String(p.slug) : autoSlug(String(p.name ?? p.title ?? sku)),
    description: p.description ? String(p.description) : null,
    description_ua: p.description_ua ? String(p.description_ua) : null,
    short_description_ua: p.short_description_ua ? String(p.short_description_ua) : null,
    supplier_price_usd: priceUsd,
    supplier_price_rate: effectiveRate,
    price_win_field: winField,
    supplier_price_currency: supplierCurrency,
    last_price_synced_at: new Date().toISOString(),
    stock_quantity: safeStock(stockRaw),
    is_in_stock: safeStock(stockRaw) > 0,
    main_image_url: images[0] ?? null,
    images: images.length > 0 ? images : null,
    attributes: p.attributes && typeof p.attributes === 'object' ? p.attributes as Record<string, unknown> : null,
    weight_kg: p.weight != null ? Number(p.weight) : null,
    raw_data: p,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_approved: false,
  }

  return { sku, row, priceUah, priceUsd, effectiveRate, winField, stockRaw }
}

interface WindowResult {
  upserted: number   // rows successfully written
  inserted: number   // brand-new SKUs (were not in DB before)
  errors: number
  noPrice: number
  rateMissing: number
  errorReport: SupplierErrorReport   // categorized failures for this window
}

// Process + upsert ONE bounded window of the feed. Self-contained so the caller
// can loop over windows with a wall-clock budget. Existing-SKU detection is
// chunked (.in() is capped at 1000 rows by PostgREST, so a plain select would
// mislabel rows as new).
async function upsertSupplierWindow(
  client: ReturnType<typeof getAdminClient>,
  window: unknown[],
  rootCurrency: number | null,
  priceSamples: NonNullable<SyncResult['priceSample']>,
  windowOffset = 0,
): Promise<WindowResult> {
  let errors = 0
  let noPrice = 0
  let rateMissing = 0
  const errorReport = emptyErrorReport()

  const skuOf = (p: Record<string, unknown>) =>
    String(p.vendor_code ?? p.sku ?? p.article ?? p.supplier_sku ?? p.id ?? '').trim()
  const batchSkus = [...new Set(window.map((p) => skuOf(p as Record<string, unknown>)).filter(Boolean))]
  const existingSkus = new Set<string>()
  for (let i = 0; i < batchSkus.length; i += 500) {
    const { data: existingRows } = await client
      .from('supplier_products')
      .select('supplier_sku')
      .in('supplier_sku', batchSkus.slice(i, i + 500))
    for (const r of existingRows ?? []) existingSkus.add(r.supplier_sku as string)
  }

  // Two buckets: rows with a computed UAH price vs rows without (rate missing).
  // Rows without a computed price omit price_uah so the existing DB value is preserved.
  const rowsWithPrice: Record<string, unknown>[] = []
  const rowsWithoutPrice: Record<string, unknown>[] = []
  const newSkusInBatch = new Set<string>()
  // Dedupe by SKU WITHIN the window — the feed can repeat a SKU; without this the
  // upsert collapses them to one DB row but the counts would double-count (a
  // phantom "update"). First occurrence wins.
  const seenSku = new Set<string>()

  for (const prod of window) {
    const rawSku = skuOf(prod as Record<string, unknown>)
    const built = buildSupplierRow(prod as Record<string, unknown>, rootCurrency)
    if (!built) {
      errors++
      const group = classifyBuildFailure(rawSku)
      recordError(errorReport, group, 1, { skus: rawSku ? [rawSku] : [], offset: windowOffset })
      continue
    }
    const { sku, row, priceUah, priceUsd, effectiveRate, winField, stockRaw } = built
    if (seenSku.has(sku)) {
      // Repeated SKU within the feed — first occurrence wins; count it so the
      // report distinguishes benign feed dupes from real failures (not an error).
      recordError(errorReport, 'duplicate_sku_in_feed', 1, { skus: [sku], offset: windowOffset })
      continue
    }
    seenSku.add(sku)

    if (winField === 'rate_missing') rateMissing++
    if (priceUah == null) noPrice++
    // Data-quality: a row that built OK but has no usable price will be silently
    // dropped from the catalog import (price_uah > 0 filter). Record it as
    // invalid_price so the diagnostic can surface these unsellable rows.
    const priceIssue = classifyPriceIssue(priceUah)
    if (priceIssue) recordError(errorReport, priceIssue, 1, { skus: [sku], offset: windowOffset })
    if (!existingSkus.has(sku)) newSkusInBatch.add(sku)

    if (priceSamples.length < 5) {
      priceSamples.push({
        sku,
        rawFields: {
          price: (prod as Record<string, unknown>).price,
          retail_price: (prod as Record<string, unknown>).retail_price,
          price_uah: (prod as Record<string, unknown>).price_uah,
          price_usd: priceUsd, rate: effectiveRate, rootCurrency, winField, stockSrc: stockRaw,
        },
        computedUah: priceUah,
      })
    }

    if (priceUah !== null) rowsWithPrice.push({ ...row, price_uah: priceUah })
    else rowsWithoutPrice.push(row)
  }

  // Count inserted/updated only from slices that were ACTUALLY written, so a
  // partial chunk failure can't over-report new rows. newInSlice resolves the
  // SKU straight off the built row's supplier_sku.
  const newInSlice = (slice: Record<string, unknown>[]) =>
    slice.reduce((n, r) => n + (newSkusInBatch.has(String(r.supplier_sku)) ? 1 : 0), 0)

  // Bounded retry for TRANSIENT db failures (serialization/deadlock/connection —
  // never constraint violations). Up to 3 attempts; returns the final error (or
  // null on success). Constraint errors short-circuit immediately (not retryable).
  const upsertWithRetry = async (rows: Record<string, unknown>[]) => {
    let lastErr: { code?: string | null; message?: string | null } | null = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await client.from('supplier_products').upsert(rows, { onConflict: 'supplier_sku' })
      if (!error) return null
      lastErr = error
      if (!isRetryableDbError(error)) break
    }
    return lastErr
  }

  let upserted = 0
  let inserted = 0
  const CHUNK = 200
  for (const batch of [rowsWithPrice, rowsWithoutPrice]) {
    for (let i = 0; i < batch.length; i += CHUNK) {
      const slice = batch.slice(i, i + CHUNK)
      const sampleSkus = slice.map((r) => String(r.supplier_sku ?? '')).filter(Boolean).slice(0, 5)
      const error = await upsertWithRetry(slice)
      if (error) {
        const missingCol = error.message?.includes('price_win_field') ||
          error.message?.includes('supplier_price_currency') ||
          (error as { code?: string }).code === '42703'
        if (missingCol) {
          const fallback = slice.map(({ price_win_field: _a, supplier_price_currency: _b, ...rest }) => rest)
          const { error: e2 } = await client.from('supplier_products').upsert(fallback, { onConflict: 'supplier_sku' })
          if (e2) {
            errors += slice.length
            recordError(errorReport, classifyUpsertError(e2), slice.length, { skus: sampleSkus, code: (e2 as { code?: string }).code, message: e2.message, offset: windowOffset })
          } else { upserted += slice.length; inserted += newInSlice(slice) }
        } else {
          errors += slice.length
          recordError(errorReport, classifyUpsertError(error), slice.length, { skus: sampleSkus, code: (error as { code?: string }).code, message: error.message, offset: windowOffset })
        }
      } else {
        upserted += slice.length
        inserted += newInSlice(slice)
      }
    }
  }

  return { upserted, inserted, errors, noPrice, rateMissing, errorReport }
}

// Full supplier-products sync with BOUNDED, RESUMABLE windowing.
//
// The personal.cab get_products endpoint returns the ENTIRE feed (~112k rows) in
// one HTTP response with no server-side limit/offset, so the bug was: processing
// was capped to the first `pageSize` rows from offset 0 on EVERY run, so the
// table never grew past that cap. This version downloads the feed once, then
// processes a window [offset, offset+limit) — and may process several windows per
// invocation until a wall-clock budget (maxMillis) or maxPages is hit, returning
// `nextOffset`/`done` so a terminal loop can resume exactly where it stopped.
//
// Defaults preserve the old safe behaviour (one window of `limit`/`pageSize`).
export async function syncSupplierProducts(options?: {
  categoryId?: string
  page?: number       // supplier-side page param (forwarded only; feed ignores it)
  pageSize?: number   // legacy alias for `limit` (window size)
  offset?: number     // window start into the downloaded feed (resume point)
  limit?: number      // rows processed per window
  maxPages?: number   // max windows processed in THIS invocation (timeout safety)
  maxMillis?: number  // wall-clock budget for THIS invocation (timeout safety)
}): Promise<SyncResult> {
  const client = getAdminClient()

  const alreadyRunning = await handleActiveRuns(client, 'products')
  if (alreadyRunning) {
    return { ok: false, synced: 0, errors: 0, message: 'Синхронізація продуктів вже виконується', alreadyRunning: true }
  }

  const startedAt = Date.now()
  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'products', status: 'running', triggered_by: 'admin' })
    .select('id')
    .single()

  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(n)))

  try {
    const extra: Record<string, string> = {}
    if (options?.categoryId) extra.category_id = options.categoryId
    if (options?.page) extra.page = String(options.page)

    const { raw, safeUrl, httpStatus, topLevelKeys } = await apiFetch('get_products', extra)
    const allProducts = extractProducts(raw)
    const rootCurrency = extractRootCurrency(raw)
    const totalInFeed = allProducts.length

    if (totalInFeed === 0) {
      await client.from('supplier_sync_log').update({
        status: 'completed',
        products_total: 0,
        error_details: {
          safe_url: safeUrl, http_status: httpStatus, response_top_keys: topLevelKeys,
          response_count: 0, warning: 'API returned 0 products — check URL, key, and method',
          duration_ms: Date.now() - startedAt,
        },
        completed_at: new Date().toISOString(),
      }).eq('id', log?.id)
      return {
        ok: false, synced: 0, errors: 0,
        message: `API повернуло 0 продуктів. Ключі у відповіді: ${topLevelKeys.join(', ') || 'none'}`,
        totalInFeed: 0, processed: 0, inserted: 0, updated: 0, nextOffset: null, done: true,
      }
    }

    const startOffsetForCategories = clamp(options?.offset ?? 0, 0, totalInFeed)

    // Requirement B — the get_products response already has the supplier's
    // categories at its top level (same JSON payload as `products`), so reuse
    // it here instead of a second HTTP request. Only on the first window of a
    // cycle (offset 0) — categories don't change mid-cycle, so resumed windows
    // skip this. Wrapped so a category-extraction failure can NEVER lose a
    // successfully-processed product window below: on error this is recorded
    // as a non-fatal diagnostic and the product sync proceeds unaffected.
    let categorySync: { attempted: boolean; synced: number; errors: number; message: string } = {
      attempted: false, synced: 0, errors: 0, message: '',
    }
    if (startOffsetForCategories === 0) {
      try {
        const topCategories = extractCategories(raw)
        if (topCategories.length > 0) {
          const ids = [...new Set(
            topCategories
              .map((cat) => String((cat as Record<string, unknown>).id ?? (cat as Record<string, unknown>).supplier_id ?? (cat as Record<string, unknown>).category_id ?? '').trim())
              .filter(Boolean)
          )]
          const existingNames = await fetchExistingCategoryNames(client, ids)
          const rows = buildSupplierCategoryRows(topCategories, existingNames)
          const { synced, errors } = await upsertSupplierCategoryRows(client, rows)
          categorySync = {
            attempted: true, synced, errors,
            message: `${synced} категорій оновлено з фіду товарів${errors > 0 ? `, ${errors} помилок` : ''}`,
          }
        }
      } catch (e) {
        categorySync = {
          attempted: true, synced: 0, errors: 1,
          message: e instanceof Error ? e.message : String(e),
        }
      }
    }

    const limit = clamp(options?.limit ?? options?.pageSize ?? 1000, 1, 5000)
    const maxPages = clamp(options?.maxPages ?? 1, 1, 1000)
    // Ceiling stays UNDER the route's maxDuration (60s) with headroom for the
    // final supplier_sync_log write — otherwise the platform kills the function
    // mid-loop, the log row is stranded in 'running', and the caller gets no
    // nextOffset. Do NOT raise this above the function's configured maxDuration.
    const maxMillis = clamp(options?.maxMillis ?? 45000, 5000, 55000)
    const startOffset = clamp(options?.offset ?? 0, 0, totalInFeed)
    let offset = startOffset

    const priceSamples: NonNullable<SyncResult['priceSample']> = []
    let processed = 0
    let upserted = 0
    let inserted = 0
    let noPriceCount = 0
    let rateMissingCount = 0
    let pages = 0
    const errorReport = emptyErrorReport()

    while (offset < totalInFeed && pages < maxPages && (Date.now() - startedAt) < maxMillis) {
      const window = allProducts.slice(offset, offset + limit)
      if (window.length === 0) break
      const r = await upsertSupplierWindow(client, window, rootCurrency, priceSamples, offset)
      processed += window.length
      upserted += r.upserted
      inserted += r.inserted
      noPriceCount += r.noPrice
      rateMissingCount += r.rateMissing
      mergeErrorReport(errorReport, r.errorReport)
      offset += window.length
      pages++
    }
    // completedWithErrors is managed by recordError and reflects HARD DB/write
    // failures ONLY (database_constraint / upsert_failed / unknown) — never the
    // benign diagnostic categories (missing_sku, duplicate_sku_in_feed,
    // invalid_record, invalid_price). No override here.
    const hardErrors = errorReport.hardErrors
    const diagnosticIssues = errorReport.diagnosticIssues

    const done = offset >= totalInFeed
    const nextOffset = done ? null : offset
    const updated = Math.max(0, upserted - inserted)

    const debugInfo = {
      safe_url: safeUrl,
      http_status: httpStatus,
      response_top_keys: topLevelKeys,
      response_count: totalInFeed,
      processed_count: processed,
      // Only need 3 samples — slice a tiny range, never copy the whole ~112k feed.
      sample_records: summarise(allProducts.slice(startOffset, startOffset + 3)),
    }

    await client.from('supplier_sync_log').update({
      status: 'completed',
      products_total: upserted,
      products_new: inserted,
      products_updated: updated,
      products_errors: hardErrors,
      error_details: {
        ...debugInfo,
        synced: upserted, new: inserted,
        // Clear, separate meanings:
        //   hard_errors      = real DB/write failures (a record was NOT persisted)
        //   diagnostic_issues = non-fatal data-quality (skipped/priceless rows)
        //   errorGroups       = per-category counts (always present)
        hard_errors: hardErrors,
        diagnostic_issues: diagnosticIssues,
        no_price: noPriceCount, rate_missing: rateMissingCount,
        total_in_feed: totalInFeed, processed, pages, next_offset: nextOffset, done,
        completed_with_errors: errorReport.completedWithErrors,
        errorGroups: errorReport.groups,
        errorDetails: errorReport.details,
        category_sync: categorySync,
        duration_ms: Date.now() - startedAt,
      },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)

    const warnings: string[] = []
    if (noPriceCount > 0) warnings.push(`${noPriceCount} без ціни`)
    if (rateMissingCount > 0) warnings.push(`${rateMissingCount} rate_missing (ціна збережена з попереднього синку)`)

    const tail = done
      ? 'весь фід оброблено'
      : `далі: offset=${nextOffset}`
    return {
      ok: upserted > 0,
      synced: upserted,
      errors: hardErrors,
      diagnosticIssues,
      completedWithErrors: errorReport.completedWithErrors,
      errorGroups: errorReport.groups,
      message: `Збережено ${upserted} (нових: ${inserted}, оброблено: ${processed} з ${totalInFeed}; ${tail})${hardErrors > 0 ? `, DB-помилок: ${hardErrors} — див. errorGroups` : ''}${diagnosticIssues > 0 ? `, діагностичних: ${diagnosticIssues}` : ''}`,
      priceSample: priceSamples,
      priceWarning: warnings.length > 0 ? warnings.join('; ') : undefined,
      totalInFeed, processed, inserted, updated, nextOffset, done,
      categorySync,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return { ok: false, synced: 0, errors: 1, message: msg }
  }
}

// ─── Prices + stock sync ──────────────────────────────────────────────────────
// personal.cab has no dedicated prices endpoint — re-fetch get_products for fresh data.

export async function syncPricesAndStock(): Promise<SyncResult> {
  const client = getAdminClient()

  const alreadyRunning = await handleActiveRuns(client, 'prices_stock')
  if (alreadyRunning) {
    return { ok: false, synced: 0, errors: 0, message: 'Оновлення цін вже виконується', alreadyRunning: true }
  }

  const startedAt = Date.now()
  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'prices_stock', status: 'running', triggered_by: 'admin' })
    .select('id')
    .single()

  let synced = 0
  let errors = 0

  try {
    const { raw, safeUrl, httpStatus, topLevelKeys } = await apiFetch('get_products')
    const items = extractProducts(raw)
    // Same currency rate resolution as the full sync — required so USD-based
    // `price` fields are converted, not written raw into price_uah.
    const rootCurrency = extractRootCurrency(raw)

    const debugInfo = {
      safe_url: safeUrl,
      http_status: httpStatus,
      response_top_keys: topLevelKeys,
      response_count: items.length,
      sample_records: summarise(items),
    }

    const rows = items.map((item) => {
      const i = item as Record<string, unknown>
      const sku = String(i.vendor_code ?? i.sku ?? i.article ?? i.supplier_sku ?? i.id ?? '').trim()
      if (!sku) return null
      const stockRaw = i.quantity ?? i.count ?? i.stock ?? i.stock_quantity
      const { priceUah } = resolvePriceUah(i, rootCurrency)
      return { sku, stockRaw, priceUah }
    }).filter(Boolean) as { sku: string; stockRaw: unknown; priceUah: number | null }[]

    // Update prices/stock one by one — must match on sku, no bulk shortcut here.
    // When no valid UAH price can be computed, DO NOT touch price_uah so the
    // previously-synced value is preserved instead of being nulled/corrupted.
    for (const { sku, stockRaw, priceUah } of rows) {
      const update: Record<string, unknown> = {
        stock_quantity: Number(stockRaw ?? 0),
        is_in_stock: Number(stockRaw ?? 0) > 0,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (priceUah != null) update.price_uah = priceUah

      const { error } = await client.from('supplier_products').update(update).eq('supplier_sku', sku)

      if (error) errors++; else synced++
    }

    await client.from('supplier_sync_log').update({
      status: 'completed',
      products_updated: synced,
      products_errors: errors,
      error_details: { ...debugInfo, synced, errors, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)

    return { ok: errors === 0, synced, errors, message: `Оновлено ціни/залишки для ${synced} позицій (у відповіді: ${items.length})` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return { ok: false, synced: 0, errors: 1, message: msg }
  }
}
