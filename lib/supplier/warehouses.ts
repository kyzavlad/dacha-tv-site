// Nova Poshta warehouse fetching + server-side search via personal.cab API.
//
// WHY server-side filtering:
//   get_novaposhta_warehouses returns the FULL Nova Poshta dataset (thousands of
//   rows). Sending all of that to the checkout UI caused lag and showed every
//   warehouse in Ukraine. We now fetch once, cache in module memory for 5 min,
//   and do normalization + ranked filtering here — the client receives ≤30 rows.

export interface NovaPoshtaWarehouse {
  internal_id: string
  name: string
  city_name: string
  address: string
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
  const { base, key } = getApiConfig()
  const extra: Record<string, string> = {}
  if (city?.trim()) extra.city = city.trim()
  const params = new URLSearchParams({ key, method: 'get_novaposhta_warehouses', type: 'json', ...extra })
  const res = await fetch(`${base}?${params}`, { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`get_novaposhta_warehouses → ${res.status} ${res.statusText}`)

  const raw = await res.json() as unknown
  const rows = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && 'data' in (raw as object)
        ? (raw as { data: unknown[] }).data
        : [])

  return (rows as Record<string, unknown>[]).map((w) => ({
    internal_id: String(w.internal_id ?? w.id ?? ''),
    name: String(w.name ?? w.description ?? ''),
    city_name: String(w.city_name ?? w.city ?? city ?? ''),
    address: String(w.address ?? w.short_address ?? ''),
  })).filter((w) => w.internal_id)
}

// ─── Server-side cache ────────────────────────────────────────────────────────
// Full list is large (~10k rows) and changes infrequently.
// Cache per server instance; no secrets stored, only public warehouse data.

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours — NP warehouse list changes rarely
let _cache: { at: number; rows: NovaPoshtaWarehouse[] } | null = null
let _inflight: Promise<NovaPoshtaWarehouse[]> | null = null

async function getAllWarehouses(): Promise<NovaPoshtaWarehouse[]> {
  const now = Date.now()
  if (_cache && now - _cache.at < CACHE_TTL_MS) return _cache.rows
  if (_inflight) return _inflight
  _inflight = fetchNovaPoshtaWarehouses()
    .then((rows) => { _cache = { at: Date.now(), rows }; return rows })
    .finally(() => { _inflight = null })
  return _inflight
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
// Rank tiers:
//   0 exact city match
//   1 city startsWith query
//   2 city contains query
//   3 warehouse name or address contains query
//   4 fuzzy city (Levenshtein ≤ 1)

export function searchWarehouses(rows: NovaPoshtaWarehouse[], query: string, limit = 30): WarehouseResult[] {
  const normRaw = normalizeSearch(query)
  if (normRaw.length < 2) return []
  const q = applyAlias(normRaw)

  type Scored = { row: NovaPoshtaWarehouse; rank: number }
  const scored: Scored[] = []

  for (const row of rows) {
    const city = normalizeSearch(row.city_name)
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

// Top-level entry point used by the API route: cached fetch + filter + cap.
export async function searchNovaPoshtaWarehouses(query: string, limit = 30): Promise<WarehouseResult[]> {
  if (normalizeSearch(query).length < 2) return []
  const rows = await getAllWarehouses()
  return searchWarehouses(rows, query, limit)
}
