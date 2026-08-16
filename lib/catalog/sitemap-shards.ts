import { createClient } from '@supabase/supabase-js'
import { STOREFRONT_SCOPE_OR } from '@/lib/supabase/catalog'

// 9 high-order UUID bits => 512 deterministic, equal address-space buckets.
// Production currently has ~168-253 storefront products per bucket, leaving
// substantial headroom below PostgREST's 1000-row response ceiling.
export const SITEMAP_PRODUCT_SHARD_COUNT = 512
export const SITEMAP_SHARD_ROW_LIMIT = 1000

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
 * Exact boundary for one of 512 equal ranges over the 128-bit UUID space.
 *
 * A boundary index is a 9-bit number. The first 8 bits become the first UUID
 * byte; the ninth bit becomes the high bit of the following hex nibble (0 or 8),
 * and all remaining 119 bits are zero. This is exact integer bit partitioning,
 * implemented without BigInt because this project targets ES2017.
 *
 * Boundary 512 is 2^128, which cannot be represented as a UUID; callers use
 * `upper: null` for the final open-ended range.
 */
export function sitemapUuidBoundary(boundaryIndex: number): string | null {
  if (!Number.isInteger(boundaryIndex) || boundaryIndex < 0 || boundaryIndex > SITEMAP_PRODUCT_SHARD_COUNT) {
    throw new RangeError(`invalid sitemap UUID boundary index: ${boundaryIndex}`)
  }
  if (boundaryIndex === SITEMAP_PRODUCT_SHARD_COUNT) return null

  const firstByte = Math.floor(boundaryIndex / 2).toString(16).padStart(2, '0')
  const ninthBitNibble = boundaryIndex % 2 === 0 ? '0' : '8'
  const hex = `${firstByte}${ninthBitNibble}${'0'.repeat(29)}`
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
  // id 0 is static/categories; ids 1..512 are product UUID buckets.
  return Array.from({ length: SITEMAP_PRODUCT_SHARD_COUNT + 1 }, (_, id) => id)
}

/**
 * Read one product sitemap shard by UUID range. No OFFSET and no global count.
 *
 * A cheap exact count is intentionally scoped to this one narrow UUID bucket and
 * requested in the SAME PostgREST statement as the bounded rows. That gives the
 * overflow guard and the returned data one database snapshot: a concurrent sync
 * cannot change the bucket between a separate count request and a data request.
 * If future growth crosses the response ceiling, the shard fails loudly instead
 * of publishing a truncated successful sitemap.
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

  let query = client
    .from('catalog_products')
    .select('slug, category_slug', { count: 'exact' })
    .eq('status', 'published')
    .or(STOREFRONT_SCOPE_OR)
    .gte('id', range.lower)
  if (range.upper) query = query.lt('id', range.upper)

  const { data, count, error } = await query
    .order('id', { ascending: true })
    .limit(SITEMAP_SHARD_ROW_LIMIT)

  if (error) {
    throw new Error(`sitemap shard ${shardId} query failed: ${error.message}`)
  }
  if (count == null) {
    throw new Error(`sitemap shard ${shardId} count was unavailable`)
  }
  if (count > SITEMAP_SHARD_ROW_LIMIT) {
    throw new Error(
      `sitemap shard ${shardId} overflow: ${count} rows exceeds ${SITEMAP_SHARD_ROW_LIMIT}; increase shard cardinality before serving this shard`,
    )
  }

  const rows = (data ?? []) as { slug: string | null; category_slug: string | null }[]
  if (rows.length !== count) {
    throw new Error(`sitemap shard ${shardId} row mismatch: expected ${count}, received ${rows.length}`)
  }

  return rows.map((row) => {
    if (!row.slug) throw new Error(`sitemap shard ${shardId} contains a published storefront row without a slug`)
    return {
      category: row.category_slug ?? 'all',
      product: row.slug,
    }
  })
}
