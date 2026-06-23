import { getAdminClient } from '@/lib/supabase/admin'

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

interface ApiFetchResult {
  raw: unknown
  safeUrl: string   // key masked for logging
  httpStatus: number
  topLevelKeys: string[]
}

async function apiFetch(method: string, extra: Record<string, string> = {}): Promise<ApiFetchResult> {
  const { base, key } = getApiConfig()
  const params = new URLSearchParams({ key, method, type: 'json', ...extra })
  const fullUrl = `${base}?${params}`
  const safeUrl = `${base}?method=${method}&type=json&key=***`

  const res = await fetch(fullUrl, { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`personal.cab API method=${method} → ${res.status} ${res.statusText}`)

  const raw = await res.json()
  const topLevelKeys = raw && typeof raw === 'object' ? Object.keys(raw as object) : []
  return { raw, safeUrl, httpStatus: res.status, topLevelKeys }
}

// Raw-text fetch variant — used for XML/YML feeds the JSON parser can't handle.
async function apiFetchText(method: string, extra: Record<string, string> = {}): Promise<{
  text: string
  safeUrl: string
  httpStatus: number
  contentType: string
}> {
  const { base, key } = getApiConfig()
  const params = new URLSearchParams({ key, method, ...extra })
  const fullUrl = `${base}?${params}`
  const safeUrl = `${base}?method=${method}&${new URLSearchParams(extra)}&key=***`

  const res = await fetch(fullUrl, { cache: 'no-store' })
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

function extractCategories(raw: unknown): unknown[] {
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

// Derive unique categories from a products array when no dedicated categories endpoint exists.
// Wide field list catches different supplier API naming conventions.
function deriveCategories(products: unknown[]): unknown[] {
  const seen = new Map<string, unknown>()
  for (const p of products) {
    if (!p || typeof p !== 'object') continue
    const prod = p as Record<string, unknown>
    const catId = String(prod.category_id ?? prod.cat_id ?? prod.group_id ?? prod.section_id ?? '').trim()
    if (!catId || seen.has(catId)) continue
    // Try every field name a supplier might use for the human-readable category name.
    const name = String(
      prod.category        ??
      prod.category_name   ??
      prod.cat_name        ??
      prod.group           ??
      prod.group_name      ??
      prod.section         ??
      prod.section_name    ??
      prod.category_title  ??
      prod.cat_title       ??
      prod.category_label  ??
      prod.cat_label       ??
      prod.category_ua     ??
      prod.cat_ua          ??
      catId
    )
    seen.set(catId, { id: catId, name })
  }
  return Array.from(seen.values())
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
  errors: number
  message: string
  alreadyRunning?: boolean
  priceSample?: Array<{ sku: string; rawFields: Record<string, unknown>; computedUah: number | null }>
  priceWarning?: string
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
  let ymlResult:  FeedDiagResult['yml']
  let xmlResult:  FeedDiagResult['xml']

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

  ymlResult = await parseFeed('yml')
  xmlResult = await parseFeed('xml')

  // Derive winner: whichever feed produced named categories first
  const ymlNamed = ('namedCategoryCount' in ymlResult) ? ymlResult.namedCategoryCount : 0
  const xmlNamed = ('namedCategoryCount' in xmlResult) ? xmlResult.namedCategoryCount : 0
  const winnerSource: FeedDiagResult['winnerSource'] =
    ymlNamed > 0 ? 'yml' :
    xmlNamed > 0 ? 'xml' :
    'none'

  return { winnerSource, json: jsonResult, yml: ymlResult, xml: xmlResult }
}

// ─── Categories sync ──────────────────────────────────────────────────────────

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

  let synced = 0
  let errors = 0

  try {
    // Try dedicated categories method first; fall back to deriving from products
    let categories: unknown[] = []
    let safeUrl = ''
    let httpStatus = 0
    let topLevelKeys: string[] = []
    let source = 'get_categories'

    try {
      const result = await apiFetch('get_categories')
      safeUrl = result.safeUrl
      httpStatus = result.httpStatus
      topLevelKeys = result.topLevelKeys
      categories = extractCategories(result.raw)
    } catch {
      // dedicated endpoint not available — fall through to product-derived
    }

    if (categories.length === 0) {
      source = 'derived_from_get_products'
      const result = await apiFetch('get_products')
      safeUrl = result.safeUrl
      httpStatus = result.httpStatus
      topLevelKeys = result.topLevelKeys
      const products = extractProducts(result.raw)
      categories = deriveCategories(products)
    }

    // Overlay human-readable names from the YML/XML <categories> block — the
    // JSON feed only carries numeric ids, so without this names stay numeric.
    const { map: ymlNameMap, source: nameSource } = await fetchSupplierCategoryMap()
    if (ymlNameMap.size > 0) source = `${source}+names_from_${nameSource}`

    const debugInfo = {
      source,
      safe_url: safeUrl,
      http_status: httpStatus,
      response_top_keys: topLevelKeys,
      response_count: categories.length,
      sample_records: summarise(categories),
    }

    if (categories.length === 0) {
      await client.from('supplier_sync_log').update({
        status: 'completed',
        categories_total: 0,
        error_details: { ...debugInfo, warning: 'API returned 0 categories and no category_id found in products', duration_ms: Date.now() - startedAt },
        completed_at: new Date().toISOString(),
      }).eq('id', log?.id)
      return { ok: false, synced: 0, errors: 0, message: 'API повернуло 0 категорій — перевірте URL та ключ' }
    }

    // Ensure every id present in the YML name map also produces a row, even if
    // the JSON categories/products feed didn't list it.
    const idsFromFeed = new Set(
      categories
        .map((cat) => String((cat as Record<string, unknown>).id ?? (cat as Record<string, unknown>).supplier_id ?? (cat as Record<string, unknown>).category_id ?? '').trim())
        .filter(Boolean)
    )
    for (const [id] of ymlNameMap) {
      if (!idsFromFeed.has(id)) categories.push({ id })
    }

    const rows = categories.map((cat) => {
      const c = cat as Record<string, unknown>
      const supplierId = String(c.id ?? c.supplier_id ?? c.category_id ?? '').trim()
      if (!supplierId) return null
      const feedName = String(c.name ?? c.title ?? c.category_name ?? '').trim()
      const ymlName = ymlNameMap.get(supplierId)
      // Prefer a human-readable name; only fall back to numeric id as last resort.
      const resolvedName =
        (feedName && !/^\d+$/.test(feedName)) ? feedName
        : (ymlName && !/^\d+$/.test(ymlName)) ? ymlName
        : (feedName || supplierId)
      return {
        supplier_id: supplierId,
        name: resolvedName,
        name_ua: c.name_ua ? String(c.name_ua) : null,
        slug: c.slug ? String(c.slug) : null,
        parent_supplier_id: c.parent_id ? String(c.parent_id) : null,
        raw_data: c,
        synced_at: new Date().toISOString(),
      }
    }).filter(Boolean) as Record<string, unknown>[]

    errors = categories.length - rows.length

    const CHUNK = 200
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await client.from('supplier_categories').upsert(
        rows.slice(i, i + CHUNK),
        { onConflict: 'supplier_id' },
      )
      if (error) errors += Math.min(CHUNK, rows.length - i)
      else synced += Math.min(CHUNK, rows.length - i)
    }

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

export async function syncSupplierProducts(options?: {
  categoryId?: string
  page?: number
  pageSize?: number
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

  let synced = 0
  let isNew = 0
  let errors = 0

  try {
    const extra: Record<string, string> = {}
    if (options?.categoryId) extra.category_id = options.categoryId
    if (options?.page) extra.page = String(options.page)

    const { raw, safeUrl, httpStatus, topLevelKeys } = await apiFetch('get_products', extra)
    const allProducts = extractProducts(raw)

    // Extract root-level currency rate (some APIs return {"currency": 41.5, "products": [...]})
    const rootCurrency = extractRootCurrency(raw)

    // Honor pageSize as a hard processing cap. The supplier feed can return
    // hundreds of thousands of rows; building + upserting them all in one
    // serverless invocation exhausts memory/time and crashes the function
    // (surfacing as a 500 in the admin "API sync" card and ERR_CONNECTION_REFUSED
    // on the cold restart). Capping bounds the work per run; remaining rows are
    // picked up on the next scheduled/manual run.
    //
    // NOTE ON PAGINATION: personal.cab's get_products endpoint returns the WHOLE
    // feed in one response and does not support a documented server-side
    // limit/offset. We therefore bound PROCESSING (this cap) and the downstream
    // import/publish steps (batched), rather than the HTTP download. The `page`
    // option is forwarded if the supplier ever honors it. If/when a real limit
    // param is confirmed, add it to `extra` here to also bound the download.
    const cap = options?.pageSize && options.pageSize > 0 ? options.pageSize : allProducts.length
    const products = allProducts.length > cap ? allProducts.slice(0, cap) : allProducts

    const debugInfo = {
      safe_url: safeUrl,
      http_status: httpStatus,
      response_top_keys: topLevelKeys,
      response_count: allProducts.length,
      processed_count: products.length,
      sample_records: summarise(products),
    }

    if (products.length === 0) {
      await client.from('supplier_sync_log').update({
        status: 'completed',
        products_total: 0,
        error_details: { ...debugInfo, warning: 'API returned 0 products — check URL, key, and method', duration_ms: Date.now() - startedAt },
        completed_at: new Date().toISOString(),
      }).eq('id', log?.id)
      return { ok: false, synced: 0, errors: 0, message: `API повернуло 0 продуктів. Ключі у відповіді: ${topLevelKeys.join(', ') || 'none'}` }
    }

    // New/update tracking — query ONLY the SKUs in this bounded batch (chunked
    // .in()) instead of loading the whole ~190k-row supplier_products table. A
    // plain `.select('supplier_sku')` is silently capped at 1000 rows by
    // PostgREST, which made nearly every existing SKU look "new". Manual-catalog
    // rows (supplier_sku NULL) are never matched here.
    const skuOf = (p: Record<string, unknown>) =>
      String(p.vendor_code ?? p.sku ?? p.article ?? p.supplier_sku ?? p.id ?? '').trim()
    const batchSkus = [...new Set(products.map((p) => skuOf(p as Record<string, unknown>)).filter(Boolean))]
    const existingSkus = new Set<string>()
    for (let i = 0; i < batchSkus.length; i += 500) {
      const { data: existingRows } = await client
        .from('supplier_products')
        .select('supplier_sku')
        .in('supplier_sku', batchSkus.slice(i, i + 500))
      for (const r of existingRows ?? []) existingSkus.add(r.supplier_sku as string)
    }

    const priceSamples: SyncResult['priceSample'] = []
    let noPriceCount = 0
    let rateMissingCount = 0

    // Two buckets: rows where we have a computed UAH price vs rows where rate was missing.
    // Rows without a computed price are upserted WITHOUT the price_uah column so the existing
    // DB price is preserved rather than overwritten with null.
    const rowsWithPrice: Record<string, unknown>[] = []
    const rowsWithoutPrice: Record<string, unknown>[] = []

    for (const prod of products) {
      const p = prod as Record<string, unknown>

      const sku = String(
        p.vendor_code ?? p.sku ?? p.article ?? p.supplier_sku ?? p.id ?? ''
      ).trim()
      if (!sku) { errors++; continue }

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
        // Personal.cab single main image field (e.g. mainimage: https://images.zone/...)
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

      // ── Price resolution (shared helper — never store raw USD without conversion) ──
      const { priceUah, priceUsd, effectiveRate, winField } = resolvePriceUah(p, rootCurrency)
      if (winField === 'rate_missing') rateMissingCount++

      const stockRaw = p.quantity ?? p.count ?? p.stock ?? p.stock_quantity ?? p.qty

      if (priceSamples.length < 5) {
        priceSamples.push({
          sku,
          rawFields: {
            price: p.price, retail_price: p.retail_price, price_uah: p.price_uah,
            price_usd: priceUsd, rate: effectiveRate, rootCurrency,
            winField, stockSrc: stockRaw,
          },
          computedUah: priceUah,
        })
      }
      if (priceUah == null) noPriceCount++

      if (!existingSkus.has(sku)) isNew++

      const supplierCurrency =
        winField === 'price_uah' || winField === 'retail_price' ? 'UAH' :
        winField.includes('*rate') ? 'USD' :
        null

      const baseRow = {
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
        attributes: p.attributes && typeof p.attributes === 'object'
          ? p.attributes as Record<string, unknown>
          : null,
        weight_kg: p.weight != null ? Number(p.weight) : null,
        raw_data: p,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_approved: false,
      }

      if (priceUah !== null) {
        // Include price_uah in upsert — overwrite with fresh computed value
        rowsWithPrice.push({ ...baseRow, price_uah: priceUah })
      } else {
        // No valid UAH price computed — omit price_uah so the existing DB value is preserved
        rowsWithoutPrice.push(baseRow)
      }
    }

    // Batch upsert — two separate batches to avoid clobbering existing prices with null.
    // Defensive fallback: if the upsert fails because price_win_field / supplier_price_currency
    // columns don't exist yet (migration pending), retry without those fields so the rest of
    // the sync still works. Once migration 049 runs, the full path is used automatically.
    const CHUNK = 200
    for (const batch of [rowsWithPrice, rowsWithoutPrice]) {
      for (let i = 0; i < batch.length; i += CHUNK) {
        const slice = batch.slice(i, i + CHUNK)
        const { error } = await client.from('supplier_products').upsert(slice, { onConflict: 'supplier_sku' })
        if (error) {
          const missingCol = error.message?.includes('price_win_field') ||
            error.message?.includes('supplier_price_currency') ||
            (error as { code?: string }).code === '42703'
          if (missingCol) {
            // Column not yet created — strip the new fields and retry
            const fallback = slice.map(({ price_win_field: _a, supplier_price_currency: _b, ...row }) => row)
            const { error: e2 } = await client.from('supplier_products').upsert(fallback, { onConflict: 'supplier_sku' })
            if (e2) errors += Math.min(CHUNK, batch.length - i)
            else synced += Math.min(CHUNK, batch.length - i)
          } else {
            errors += Math.min(CHUNK, batch.length - i)
          }
        } else {
          synced += Math.min(CHUNK, batch.length - i)
        }
      }
    }

    await client.from('supplier_sync_log').update({
      status: 'completed',
      products_total: synced,
      products_new: isNew,
      products_updated: synced - isNew,
      products_errors: errors,
      error_details: {
        ...debugInfo,
        synced, errors, new: isNew,
        no_price: noPriceCount,
        rate_missing: rateMissingCount,
        duration_ms: Date.now() - startedAt,
      },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)

    const warnings: string[] = []
    if (noPriceCount > 0) warnings.push(`${noPriceCount} без ціни`)
    if (rateMissingCount > 0) warnings.push(`${rateMissingCount} rate_missing (ціна збережена з попереднього синку)`)

    return {
      ok: synced > 0,
      synced,
      errors,
      message: `Збережено ${synced} продуктів (нових: ${isNew}, оброблено: ${products.length} з ${allProducts.length} у відповіді)${errors > 0 ? `, помилок: ${errors}` : ''}`,
      priceSample: priceSamples,
      priceWarning: warnings.length > 0 ? warnings.join('; ') : undefined,
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
