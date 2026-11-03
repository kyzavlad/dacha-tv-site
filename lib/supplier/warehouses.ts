// Nova Poshta warehouse fetching + server-side search via personal.cab API.
//
// WHY server-side filtering:
//   get_novaposhta_warehouses returns the FULL Nova Poshta dataset (thousands of
//   rows). Sending all of that to the checkout UI caused lag and showed every
//   warehouse in Ukraine. The supplier currently ignores its city parameter.
//   Stream records and retain only matching cities, then rank/filter before
//   applying the 30-result response limit. Never parse the full feed in memory.

export interface NovaPoshtaWarehouse {
  internal_id: string
  name: string
  city_name: string
  address: string
  warehouse_number?: string
}

// Normalized shape returned to the client. `label` is ready-to-display.
export interface WarehouseResult {
  internal_id: string
  city: string
  name: string
  address: string
  label: string
}

function getApiConfig() {
  const url = process.env.SUPPLIER_API_URL
  const key = process.env.SUPPLIER_API_KEY
  if (!url || !key) throw new Error('SUPPLIER_API_URL and SUPPLIER_API_KEY env vars are required')
  return { base: url.replace(/\/$/, ''), key }
}

// ─── Raw fetch ───────────────────────────────────────────────────────────────

export async function fetchNovaPoshtaWarehouses(city?: string): Promise<NovaPoshtaWarehouse[]> {
  if (!city?.trim()) throw new Error('A city is required for warehouse lookup')
  const { base, key } = getApiConfig()
  const extra: Record<string, string> = {}
  if (city?.trim()) extra.city = city.trim()
  const params = new URLSearchParams({ key, method: 'get_novaposhta_warehouses', type: 'json', ...extra })
  const res = await fetch(`${base}?${params}`, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`get_novaposhta_warehouses → ${res.status} ${res.statusText}`)
  const rows: NovaPoshtaWarehouse[] = []
  const q = applyAlias(normalizeSearch(city))
  await readWarehouseRecords(res, (w) => {
    const cityName = String(w.city_ua ?? w.city_name ?? w.city ?? '')
    const normalizedCity = applyAlias(normalizeSearch(cityName))
    if (!normalizedCity || !(normalizedCity === q || normalizedCity.startsWith(q) ||
      normalizedCity.includes(q) || withinEditDistance(normalizedCity, q, 1))) return
    const id = String(w.internal_id ?? w.id ?? '')
    if (!id) return
    if (rows.length >= 20_000) throw new Error('Warehouse city result limit exceeded')
    rows.push({ internal_id: id, name: String(w.name ?? w.description ?? ''),
      city_name: cityName, address: String(w.address_ua ?? w.address ?? w.short_address ?? ''),
      warehouse_number: String(w.wnum ?? '') })
  })
  return rows
}

// The actual response is a 46 MB array. Decode one object at a time so an
// ignored supplier filter cannot exhaust the checkout worker's memory budget.
async function readWarehouseRecords(res: Response, accept: (row: Record<string, unknown>) => void): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Warehouse response body is missing')
  const decoder = new TextDecoder()
  let prefix = '', record = '', depth = 0, quoted = false, escaped = false
  let started = false, complete = false, bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 128 * 1024 * 1024) throw new Error('Warehouse response size limit exceeded')
      let text = decoder.decode(value, { stream: true })
      if (!started) {
        prefix += text
        const start = /^\s*(?:\{\s*"data"\s*:\s*)?\[/.exec(prefix)
        if (!start) {
          if (prefix.length > 16_384) throw new Error('Unexpected warehouse response')
          continue
        }
        text = prefix.slice(start[0].length)
        prefix = ''
        started = true
      }
      for (const ch of text) {
        if (complete) continue
        if (depth === 0) {
          if (/\s|,/.test(ch)) continue
          if (ch === ']') { complete = true; continue }
          if (ch !== '{') throw new Error('Invalid warehouse record')
          depth = 1; record = ch; continue
        }
        record += ch
        if (record.length > 1_048_576) throw new Error('Warehouse record size limit exceeded')
        if (quoted) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') quoted = false
        } else if (ch === '"') quoted = true
        else if (ch === '{' || ch === '[') depth++
        else if (ch === '}' || ch === ']') {
          depth--
          if (depth === 0) { accept(JSON.parse(record) as Record<string, unknown>); record = '' }
        }
      }
    }
    if (!complete || depth !== 0) throw new Error('Incomplete warehouse response')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

// ─── Server-side cache ────────────────────────────────────────────────────────
// Never materialize/cache the nationwide Nova Poshta response. The supplier
// ignores city filters today, so streaming discards other cities as records
// arrive. Cache only bounded city result sets within a total row budget.

const CITY_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const CITY_CACHE_MAX_ENTRIES = 100
const CITY_CACHE_MAX_ROWS = 30_000
const _cityCache = new Map<string, { at: number; rows: NovaPoshtaWarehouse[] }>()
const _cityInflight = new Map<string, Promise<NovaPoshtaWarehouse[]>>()

function supplierCityQuery(query: string): string {
  const trimmed = splitWarehouseQuery(query).city
  const normalized = normalizeSearch(trimmed)
  for (const [alias, canonical] of Object.entries(RAW_ALIASES)) {
    if (normalizeSearch(alias) === normalized) return canonical
  }
  return trimmed
}

async function getWarehousesForCityQuery(query: string): Promise<NovaPoshtaWarehouse[]> {
  const supplierCity = supplierCityQuery(query)
  const key = normalizeSearch(supplierCity)
  const now = Date.now()
  const cached = _cityCache.get(key)
  if (cached && now - cached.at < CITY_CACHE_TTL_MS) return cached.rows

  const inflight = _cityInflight.get(key)
  if (inflight) return inflight

  const request = fetchNovaPoshtaWarehouses(supplierCity)
    .then((rows) => {
      if (_cityCache.size >= CITY_CACHE_MAX_ENTRIES && !_cityCache.has(key)) {
        const oldestKey = _cityCache.keys().next().value
        if (oldestKey) _cityCache.delete(oldestKey)
      }
      let retained = [..._cityCache.values()].reduce((n, entry) => n + entry.rows.length, 0)
      for (const [oldKey, entry] of _cityCache) {
        if (retained + rows.length <= CITY_CACHE_MAX_ROWS) break
        _cityCache.delete(oldKey)
        retained -= entry.rows.length
      }
      _cityCache.set(key, { at: Date.now(), rows })
      return rows
    })
    .finally(() => {
      _cityInflight.delete(key)
    })

  _cityInflight.set(key, request)
  return request
}

// ─── Normalization ────────────────────────────────────────────────────────────
// Fold Ukrainian/Russian letter variants so queries match regardless of which
// keyboard layout or spelling the user typed.

const CHAR_FOLD: Record<string, string> = {
  'і': 'и', 'ї': 'и', 'ы': 'и',  // i-family → и
  'є': 'е', 'ё': 'е',              // e-family → е
  'ґ': 'г',                         // ґ → г
  'ь': '', 'ъ': '',                 // soft/hard signs are noise
  "'": '', '’': '', '`': '',   // apostrophes
}

export function normalizeSearch(input: string): string {
  let s = (input ?? '').toLowerCase().trim()
  // strip punctuation that is not part of a settlement name
  s = s.replace(/[.,/#!$%^&*;:{}=\-_~()"]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  let out = ''
  for (const ch of s) out += ch in CHAR_FOLD ? CHAR_FOLD[ch] : ch
  return out.replace(/\s+/g, ' ').trim()
}

// Manual Russian → Ukrainian city aliases. Keys + values stored post-normalization.
const RAW_ALIASES: Record<string, string> = {
  'харьков':        'харків',
  'киев':           'київ',
  'львов':          'львів',
  'днепр':          'дніпро',
  'днепропетровск': 'дніпро',
  'запорожье':      'запоріжжя',
  'песочин':        'пісочин',
  'одесса':         'одеса',
  'николаев':       'миколаїв',
  'чернигов':       'чернігів',
  'кривой рог':     'кривий ріг',
  'белая церковь':  'біла церква',
  'ужгород':        'ужгород',
}

const ALIASES: Map<string, string> = new Map(
  Object.entries(RAW_ALIASES).map(([k, v]) => [normalizeSearch(k), normalizeSearch(v)])
)

function applyAlias(q: string): string {
  return ALIASES.get(q) ?? q
}

// Cheap bounded Levenshtein: stops early when we already exceed max distance.
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  const dp: number[] = Array.from({ length: a.length + 1 }, (_, i) => i)
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]
    dp[0] = j
    let rowMin = dp[0]
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i]
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1])
      prev = tmp
      if (dp[i] < rowMin) rowMin = dp[i]
    }
    if (rowMin > max) return false
  }
  return dp[a.length] <= max
}

// ─── Search + rank ────────────────────────────────────────────────────────────
function splitWarehouseQuery(query: string): { city: string; number?: string } {
  const cleaned = query.trim().replace(/[,#№]/g, ' ').replace(/\s+/g, ' ')
  const match = /^(.+?)\s+(\d{1,6})$/.exec(cleaned)
  if (!match) return { city: cleaned }
  const city = match[1].replace(/\s+(?:відділення|отделение|поштомат|почтомат|відд\.?|отд\.?)$/iu, '').trim()
  return { city, number: match[2] }
}

function warehouseNumber(row: NovaPoshtaWarehouse): string | undefined {
  return row.warehouse_number || /[№#]\s*(\d+)/u.exec(row.name)?.[1] || /^\s*(\d+)\b/u.exec(row.address)?.[1]
}
// Rank tiers:
//   0 exact city match
//   1 city startsWith query
//   2 city contains query
//   3 warehouse name or address contains query
//   4 fuzzy city (Levenshtein ≤ 1)

export function searchWarehouses(rows: NovaPoshtaWarehouse[], query: string, limit = 30): WarehouseResult[] {
  const parts = splitWarehouseQuery(query)
  const normRaw = normalizeSearch(parts.city)
  if (normRaw.length < 2) return []
  const q = applyAlias(normRaw)

  type Scored = { row: NovaPoshtaWarehouse; rank: number }
  const scored: Scored[] = []

  for (const row of rows) {
    if (parts.number && warehouseNumber(row) !== parts.number) continue
    // Fold city aliases on both sides so supplier rows returned in Russian
    // still match a Ukrainian query (and vice versa).
    const city = applyAlias(normalizeSearch(row.city_name))
    if (parts.number && city !== q) continue
    const name = normalizeSearch(row.name)
    const addr = normalizeSearch(row.address)

    let rank = -1
    if (city === q) rank = 0
    else if (city.startsWith(q)) rank = 1
    else if (city.includes(q)) rank = 2
    else if (name.includes(q) || addr.includes(q)) rank = 3
    else if (city.length > 0 && withinEditDistance(city, q, 1)) rank = 4

    if (rank >= 0) scored.push({ row, rank })
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    // Within a tier: shorter city first (closer match), then by name numerically
    const cityLen = a.row.city_name.length - b.row.city_name.length
    if (cityLen !== 0) return cityLen
    return a.row.name.localeCompare(b.row.name, 'uk', { numeric: true })
  })

  return scored.slice(0, limit).map(({ row }) => {
    const city = row.city_name?.trim() ?? ''
    const name = row.name?.trim() ?? ''
    const address = row.address?.trim() ?? ''
    const label =
      [city, name].filter(Boolean).join(', ') +
      (address && address !== name ? ` — ${address}` : '')
    return {
      internal_id: row.internal_id,
      city,
      name,
      address,
      label: label || name || row.internal_id,
    }
  })
}

// Top-level entry point used by the API route: bounded city fetch + filter + cap.
// Critical production invariant: never call fetchNovaPoshtaWarehouses() without
// a city here; the nationwide payload is too large for a cold checkout request.
export async function searchNovaPoshtaWarehouses(query: string, limit = 30): Promise<WarehouseResult[]> {
  if (normalizeSearch(query).length < 2) return []
  const rows = await getWarehousesForCityQuery(query)
  return searchWarehouses(rows, query, limit)
}
