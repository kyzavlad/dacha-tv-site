import { createClient } from '@supabase/supabase-js'
import { isStorefrontProduct } from '@/lib/supabase/catalog'

// Keep the sitemap fan-out small enough that a crawler cannot open hundreds of
// concurrent catalog scans against Supabase Free. Sixteen equal UUID ranges put
// the current ~106k catalog at roughly 6-7k rows per sitemap while leaving each
// XML file far below Google's 50k URL limit.
export const SITEMAP_PRODUCT_SHARD_COUNT = 16
// PostgREST is configured to return at most ~1000 rows per response, so each
// sitemap shard walks its UUID range with keyset pagination instead of OFFSET.
export const SITEMAP_SHARD_ROW_LIMIT = 1000
// 50 full pages would already reach Google's per-sitemap URL ceiling. Treat a
// completely full 50th page as overflow so we fail visibly rather than silently
// omitting URLs if the catalog ever grows far beyond today's size.
export const SITEMAP_MAX_PAGES_PER_SHARD = 50
// Multiple sitemap HTTP requests can arrive together when a crawler reads the
// sitemap index. Limit the actual Supabase reads across the single PM2 process
// so crawler traffic cannot create the previous 512-query burst.
export const SITEMAP_DB_CONCURRENCY = 2

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function canonicalUuid(hex: string): string {
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`invalid UUID hex boundary: ${hex}`)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Exact boundary for one of 16 equal ranges over the 128-bit UUID space.
 * Each range owns one high-order hexadecimal nibble (0..f). Boundary 16 is
 * 2^128 and cannot be represented as a UUID, so callers use `upper: null` for
 * the final open-ended range.
 */
export function sitemapUuidBoundary(boundaryIndex: number): string | null {
  if (!Number.isInteger(boundaryIndex) || boundaryIndex < 0 || boundaryIndex > SITEMAP_PRODUCT_SHARD_COUNT) {
    throw new RangeError(`invalid sitemap UUID boundary index: ${boundaryIndex}`)
  }
  if (boundaryIndex === SITEMAP_PRODUCT_SHARD_COUNT) return null

  const hex = `${boundaryIndex.toString(16)}${'0'.repeat(31)}`
  return canonicalUuid(hex)
}

export interface SitemapUuidRange {
  bucketIndex: number
  lower: string
  upper: string | null
}

export function getSitemapUuidRange(bucketIndex: number): SitemapUuidRange {
  if (!Number.isInteger(bucketIndex) || bucketIndex < 0 || bucketIndex >= SITEMAP_PRODUCT_SHARD_COUNT) {
    throw new RangeError(`invalid sitemap product bucket: ${bucketIndex}`)
  }
  const lower = sitemapUuidBoundary(bucketIndex)
  if (!lower) throw new Error(`missing lower UUID boundary for bucket ${bucketIndex}`)
  return {
    bucketIndex,
    lower,
    upper: sitemapUuidBoundary(bucketIndex + 1),
  }
}

export function getAllSitemapIds(): number[] {
  // id 0 is static/categories; ids 1..16 are product UUID buckets.
  return Array.from({ length: SITEMAP_PRODUCT_SHARD_COUNT + 1 }, (_, id) => id)
}

interface SitemapCatalogRow {
  id: string | null
  slug: string | null
  category_slug: string | null
  source: string | null
  lead_type: string | null
  supplier_sku: string | null
  supplier_product_id: string | null
}

let sitemapDbSlotsInUse = 0
const sitemapDbWaiters: Array<() => void> = []

async function acquireSitemapDbSlot(): Promise<void> {
  if (sitemapDbSlotsInUse < SITEMAP_DB_CONCURRENCY) {
    sitemapDbSlotsInUse += 1
    return
  }
  await new Promise<void>((resolve) => sitemapDbWaiters.push(resolve))
}

function releaseSitemapDbSlot(): void {
  const next = sitemapDbWaiters.shift()
  if (next) {
    // Transfer the slot directly to the oldest waiter. Keeping the in-use count
    // unchanged avoids a race where a newly arriving request could steal it.
    next()
    return
  }
  sitemapDbSlotsInUse = Math.max(0, sitemapDbSlotsInUse - 1)
}

async function withSitemapDbSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquireSitemapDbSlot()
  try {
    return await task()
  } finally {
    releaseSitemapDbSlot()
  }
}

/**
 * Read one product sitemap shard by UUID range with bounded keyset pagination.
 *
 * The public RLS policy already restricts anon reads to status='published'. Keep
 * the database predicate deliberately limited to the UUID primary-key range so
 * PostgreSQL can use the id index even while the Free-plan catalog is oversized.
 * The rows are then filtered in memory with the exact same pure storefront
 * predicate used elsewhere. No OFFSET and no exact COUNT are used.
 *
 * A crawler can request all sitemap files concurrently, so every individual DB
 * page also passes through the small process-wide semaphore above. This keeps
 * sitemap reads from starving the supplier write pipeline under Free-plan I/O.
 */
export async function getPublishedCatalogSlugsForShard(
  shardId: number,
): Promise<{ category: string; product: string }[]> {
  if (!Number.isInteger(shardId) || shardId < 1 || shardId > SITEMAP_PRODUCT_SHARD_COUNT) {
    throw new RangeError(`invalid product sitemap shard id: ${shardId}`)
  }

  const client = getClient()
  if (!client) throw new Error('Supabase public credentials are unavailable for sitemap generation')

  const range = getSitemapUuidRange(shardId - 1)
  const rows: SitemapCatalogRow[] = []
  let cursor: string | null = null

  for (let page = 1; page <= SITEMAP_MAX_PAGES_PER_SHARD; page += 1) {
    const { data, error } = await withSitemapDbSlot(async () => {
      let query = client
        .from('catalog_products')
        .select('id, slug, category_slug, source, lead_type, supplier_sku, supplier_product_id')
        .gte('id', range.lower)
      if (range.upper) query = query.lt('id', range.upper)
      if (cursor) query = query.gt('id', cursor)

      return await query
        .order('id', { ascending: true })
        .limit(SITEMAP_SHARD_ROW_LIMIT)
    })

    if (error) {
      throw new Error(`sitemap shard ${shardId} page ${page} query failed: ${error.message}`)
    }

    const pageRows = (data ?? []) as SitemapCatalogRow[]
    rows.push(...pageRows)

    if (pageRows.length === 0) break

    const lastId = pageRows.at(-1)?.id
    if (!lastId) {
      throw new Error(`sitemap shard ${shardId} page ${page} returned a row without an id`)
    }
    cursor = lastId

    if (pageRows.length < SITEMAP_SHARD_ROW_LIMIT) break
    if (page === SITEMAP_MAX_PAGES_PER_SHARD) {
      throw new Error(
        `sitemap shard ${shardId} overflow: reached ${SITEMAP_MAX_PAGES_PER_SHARD * SITEMAP_SHARD_ROW_LIMIT} published rows; increase shard cardinality before serving this shard`,
      )
    }
  }

  return rows.filter(isStorefrontProduct).map((row) => {
    if (!row.slug) throw new Error(`sitemap shard ${shardId} contains a published storefront row without a slug`)
    return {
      category: row.category_slug ?? 'all',
      product: row.slug,
    }
  })
}
