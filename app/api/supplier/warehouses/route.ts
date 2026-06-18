export const dynamic = 'force-dynamic'

import { searchNovaPoshtaWarehouses } from '@/lib/supplier/warehouses'

// Returns a small, filtered set of Nova Poshta warehouses for the checkout picker.
// Filtering + ranking happens server-side; the client never sees the full dataset.
//
//   GET /api/supplier/warehouses?q=пісочин   (preferred)
//   GET /api/supplier/warehouses?city=Київ   (alias, backwards-compatible)
//
// Returns [] when the query is < 2 chars rather than an error, so the client
// can call this on every keystroke without handling a 400.
//
// Public endpoint — returns only public warehouse data, no secrets exposed.
// The supplier API key stays server-side.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const query = (searchParams.get('q') ?? searchParams.get('city') ?? '').trim()

    if (query.length < 2) {
      return Response.json({ ok: true, warehouses: [] })
    }

    const warehouses = await searchNovaPoshtaWarehouses(query, 30)
    return Response.json({ ok: true, warehouses })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
