export const dynamic = 'force-dynamic'

import { suggestCatalogProducts } from '@/lib/supabase/catalog'

// Public typeahead for the storefront search box. Bounded (limit 8), minimal
// columns, no COUNT — safe per keystroke ONLY because catalog_products has the
// pg_trgm GIN indexes (migration 20260630). Short client-cache to smooth typing.
//   GET /api/catalog/suggest?q=мед
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return Response.json({ suggestions: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const suggestions = await suggestCatalogProducts(q, 8)
    return Response.json(
      { suggestions },
      { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } },
    )
  } catch {
    return Response.json({ suggestions: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
