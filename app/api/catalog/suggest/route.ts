export const dynamic = 'force-dynamic'

import { displayProductName, formatCatalogPrice, getCatalogProductImage } from '@/lib/supabase/catalog'
import { searchPublishedCatalogProductsFast } from '@/lib/catalog/public-search'

// Public typeahead shares the same bounded/indexed discovery path as full search:
// temporary out-of-stock supplier products keep their PDP URLs for SEO/direct
// traffic but are not suggested to shoppers. The search reader is page-bounded
// and backed by the indexed public-catalog RPC, then this route keeps only 8.
//   GET /api/catalog/suggest?q=мед
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return Response.json({ suggestions: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const { products } = await searchPublishedCatalogProductsFast(q, 1, 'featured')
    const suggestions = products.slice(0, 8).map((p) => ({
      slug: p.slug,
      categorySlug: p.category_slug ?? null,
      name: displayProductName(p),
      image: getCatalogProductImage(p),
      price: formatCatalogPrice(p),
      sku: p.supplier_sku ?? null,
    }))

    return Response.json(
      { suggestions },
      { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } },
    )
  } catch {
    return Response.json({ suggestions: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
