// Nova Poshta warehouse fetching via the supplier personal.cab API.
// Uses the same query-param routing as other supplier API calls.

export interface NovaPoshtaWarehouse {
  internal_id: string
  name: string
  city_name: string
  address: string
}

function getApiConfig() {
  const url = process.env.SUPPLIER_API_URL
  const key = process.env.SUPPLIER_API_KEY
  if (!url || !key) throw new Error('SUPPLIER_API_URL and SUPPLIER_API_KEY env vars are required')
  return { base: url.replace(/\/$/, ''), key }
}

export async function fetchNovaPoshtaWarehouses(city?: string): Promise<NovaPoshtaWarehouse[]> {
  const { base, key } = getApiConfig()
  const extra: Record<string, string> = {}
  if (city?.trim()) extra.city = city.trim()
  const params = new URLSearchParams({ key, method: 'get_novaposhta_warehouses', type: 'json', ...extra })
  const res = await fetch(`${base}?${params}`, { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`get_novaposhta_warehouses → ${res.status} ${res.statusText}`)

  const raw = await res.json() as unknown
  const rows = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && 'data' in (raw as object) ? (raw as { data: unknown[] }).data : [])

  return (rows as Record<string, unknown>[]).map((w) => ({
    internal_id: String(w.internal_id ?? w.id ?? ''),
    name: String(w.name ?? w.description ?? ''),
    city_name: String(w.city_name ?? w.city ?? city ?? ''),
    address: String(w.address ?? w.short_address ?? ''),
  })).filter((w) => w.internal_id)
}
