export const dynamic = 'force-dynamic'

import {
  displayProductName,
  getCatalogProductImage,
  formatCatalogPrice,
  normalizeSort,
} from '@/lib/supabase/catalog'
import { searchPublishedCatalogProductsFast } from '@/lib/catalog/public-search'

// ─── Public product search (server-side, paginated) ───────────────────────────
// Full-catalog search that NEVER loads the full catalog and NEVER requests an
// exact total. It shares the same bounded page-size+1 search implementation as
// /search, so API consumers cannot accidentally reintroduce the production
// exact-count statement-timeout path.
//
// `count` is intentionally the number of products in THIS response only; it has
// never been an authoritative catalog-wide total in this API contract.
//
//   GET /api/catalog/search?q=…&page=1&sort=featured&locale=ua
//   → { ok, q, page, hasMore, count, products: [{ slug, categorySlug, name, price, image, sku }] }
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const sort = normalizeSort(url.searchParams.get('sort') ?? undefined)

  if (q.length < 2) {
    return Response.json({ ok: true, q, page, hasMore: false, count: 0, products: [] })
  }

  // Do not catch an authoritative DB failure and manufacture a legitimate empty
  // result set. Let the route fail observably; the shared search path logs the
  // underlying PostgREST error first.
  const { products, hasNext } = await searchPublishedCatalogProductsFast(q, page, sort)

  return Response.json({
    ok: true,
    q,
    page,
    hasMore: hasNext,
    count: products.length,
    products: products.map((p) => ({
      slug: p.slug,
      categorySlug: p.category_slug ?? 'all',
      name: displayProductName(p),
      price: formatCatalogPrice(p),
      image: getCatalogProductImage(p),
      sku: p.supplier_sku ?? null,
    })),
  })
}
