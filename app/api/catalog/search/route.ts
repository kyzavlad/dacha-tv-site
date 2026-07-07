export const dynamic = 'force-dynamic'

import {
  searchPublishedCatalogProducts,
  displayProductName,
  getCatalogProductImage,
  formatCatalogPrice,
  normalizeSort,
  CATALOG_PAGE_SIZE,
} from '@/lib/supabase/catalog'

// ─── Public product search (server-side, paginated) ───────────────────────────
// Full-catalog search that NEVER loads all 105k products: it delegates to
// searchPublishedCatalogProducts, which matches tokens against name_ua (UA),
// name (RU supplier feed) and supplier_sku, returns only published +
// public-listable products, and paginates by CATALOG_PAGE_SIZE. `locale` is
// accepted for parity with the localized pages (results are the same products;
// translated-name search is a future enhancement — see TODO in catalog.ts).
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

  const { products } = await searchPublishedCatalogProducts(q, page, sort).catch(() => ({ products: [], total: 0 }))

  return Response.json({
    ok: true,
    q,
    page,
    // A full page means there is (probably) a next page — the search function
    // intentionally avoids an expensive exact COUNT over the whole match set.
    hasMore: products.length >= CATALOG_PAGE_SIZE,
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
