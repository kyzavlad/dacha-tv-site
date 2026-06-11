export const dynamic = 'force-dynamic'

import { fetchNovaPoshtaWarehouses } from '@/lib/supplier/warehouses'

// Returns Nova Poshta warehouses from the supplier API for checkout warehouse selection.
// Optional query param: ?city=Київ  to filter by city name.
// Public endpoint (no auth) — only returns public warehouse data, no secrets exposed.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const city = searchParams.get('city') ?? undefined
    if (!city?.trim()) {
      return Response.json({ ok: false, error: 'city param required' }, { status: 400 })
    }
    const warehouses = await fetchNovaPoshtaWarehouses(city)
    return Response.json({ ok: true, warehouses })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
