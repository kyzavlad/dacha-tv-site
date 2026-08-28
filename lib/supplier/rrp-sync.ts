import { getAdminClient } from '@/lib/supabase/admin'
import { extractRootCurrency, resolvePriceUah } from '@/lib/supplier/sync'

// The full Personal.cab catalog is ~110k products. Production measurement on
// 2026-08-28 showed the official rrp=on JSON taking 40.73s for ~29 MiB, so the
// former 40s timeout rejected a healthy response. Allow measured headroom while
// still staying below the route's 60s budget and bounding the ENTIRE body read.
const SUPPLIER_TIMEOUT_MS = 52_000
const DEFAULT_BATCH_SIZE = 5_000
const DEFAULT_MAX_BATCHES = 1_000
const DEFAULT_MAX_MILLIS = 50_000

interface RpcError {
  message: string
}

interface RpcResult {
  data: unknown
  error: RpcError | null
}

interface RrpRpcClient {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>
}

export interface RrpSyncResult {
  ok: boolean
  totalInFeed: number
  validPrices: number
  processed: number
  supplierUpdated: number
  catalogUpdated: number
  missingPrice: number
  offset: number
  nextOffset: number | null
  done: boolean
  durationMs: number
  message: string
  safeUrl?: string
}

function getApiConfig(): { base: string; key: string } {
  const url = process.env.SUPPLIER_API_URL
  const key = process.env.SUPPLIER_API_KEY
  if (!url || !key) {
    throw new Error('SUPPLIER_API_URL and SUPPLIER_API_KEY env vars are required')
  }
  return { base: url.replace(/\/$/, ''), key }
}

function extractProducts(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>

  for (const key of ['products', 'tovar', 'data', 'items', 'result', 'results', 'list', 'goods']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }

  const values = Object.values(obj)
  if (values.length > 0 && typeof values[0] === 'object' && values[0] !== null) {
    const first = values[0] as Record<string, unknown>
    if (first.id != null || first.name != null || first.price != null) return values
  }

  return []
}

function skuOf(product: Record<string, unknown>): string {
  return String(
    product.vendor_code ??
    product.sku ??
    product.article ??
    product.supplier_sku ??
    product.id ??
    '',
  ).trim()
}

function parseRpcCounts(data: unknown): { supplierUpdated: number; catalogUpdated: number } {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined
  return {
    supplierUpdated: Number(row?.supplier_updated ?? 0),
    catalogUpdated: Number(row?.catalog_updated ?? 0),
  }
}

async function loadOfficialRrpFeed(): Promise<{
  products: unknown[]
  rootCurrency: number | null
  safeUrl: string
}> {
  const { base, key } = getApiConfig()
  const params = new URLSearchParams({
    key,
    method: 'get_products',
    type: 'json',
    rrp: 'on',
  })
  const fullUrl = `${base}?${params}`
  const safeUrl = `${base}?method=get_products&type=json&rrp=on&key=***`

  try {
    const response = await fetch(fullUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(SUPPLIER_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`personal.cab RRP feed → ${response.status} ${response.statusText}`)
    }

    // Keep body streaming/parsing inside the timeout-protected try. fetch()
    // resolves after headers, so placing response.json() outside this block let
    // a stalled 29 MiB body hang until the outer shell curl killed the request.
    const raw = await response.json()
    return {
      products: extractProducts(raw),
      rootCurrency: extractRootCurrency(raw),
      safeUrl,
    }
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`personal.cab RRP feed timed out after ${SUPPLIER_TIMEOUT_MS}ms`)
    }
    throw error
  }
}

/**
 * Synchronize Personal.cab's OFFICIAL retail/RRP prices (`rrp=on`).
 *
 * Important separation:
 * - the existing product sync keeps supplier_products.price_uah as the
 *   account/base price for unit economics;
 * - this sync writes only supplier_products.our_price_uah through the
 *   apply_supplier_rrp_batch SQL RPC;
 * - that RPC also propagates RRP to unlocked supplier-owned catalog rows.
 *
 * The feed has no supplier-side pagination, so every invocation downloads it
 * once and processes a bounded slice. `offset` makes the operation resumable.
 * `maxBatches=1` is intended for the first production pilot so only one small
 * window is changed before the resulting prices are audited.
 */
export async function syncSupplierRrpPrices(options?: {
  offset?: number
  batchSize?: number
  maxBatches?: number
  maxMillis?: number
}): Promise<RrpSyncResult> {
  const startedAt = Date.now()
  const requestedOffset = Math.max(0, Math.floor(options?.offset ?? 0))
  const batchSize = Math.max(100, Math.min(10_000, Math.floor(options?.batchSize ?? DEFAULT_BATCH_SIZE)))
  const maxBatches = Math.max(1, Math.min(1_000, Math.floor(options?.maxBatches ?? DEFAULT_MAX_BATCHES)))
  const maxMillis = Math.max(5_000, Math.min(55_000, Math.floor(options?.maxMillis ?? DEFAULT_MAX_MILLIS)))

  try {
    const { products, rootCurrency, safeUrl } = await loadOfficialRrpFeed()
    const totalInFeed = products.length

    if (totalInFeed === 0) {
      return {
        ok: false,
        totalInFeed: 0,
        validPrices: 0,
        processed: 0,
        supplierUpdated: 0,
        catalogUpdated: 0,
        missingPrice: 0,
        offset: requestedOffset,
        nextOffset: null,
        done: true,
        durationMs: Date.now() - startedAt,
        message: 'Personal.cab RRP feed returned 0 products; no prices were changed',
        safeUrl,
      }
    }

    const client = getAdminClient()
    const rpcClient = client as unknown as RrpRpcClient

    let offset = Math.min(requestedOffset, totalInFeed)
    let processed = 0
    let validPrices = 0
    let missingPrice = 0
    let supplierUpdated = 0
    let catalogUpdated = 0
    let batchesProcessed = 0

    while (
      offset < totalInFeed &&
      batchesProcessed < maxBatches &&
      (Date.now() - startedAt) < maxMillis
    ) {
      const sourceWindow = products.slice(offset, offset + batchSize)
      if (sourceWindow.length === 0) break

      // First occurrence wins when the supplier feed repeats a SKU.
      const rowsBySku = new Map<string, { sku: string; price_uah: number }>()
      for (const item of sourceWindow) {
        if (!item || typeof item !== 'object') {
          missingPrice++
          continue
        }
        const product = item as Record<string, unknown>
        const sku = skuOf(product)
        if (!sku || rowsBySku.has(sku)) continue

        const { priceUah } = resolvePriceUah(product, rootCurrency)
        if (priceUah == null || !Number.isFinite(priceUah) || priceUah <= 0) {
          missingPrice++
          continue
        }

        rowsBySku.set(sku, { sku, price_uah: priceUah })
      }

      const rows = [...rowsBySku.values()]
      validPrices += rows.length

      if (rows.length > 0) {
        const { data, error } = await rpcClient.rpc('apply_supplier_rrp_batch', { p_rows: rows })
        if (error) throw new Error(`apply_supplier_rrp_batch failed: ${error.message}`)
        const counts = parseRpcCounts(data)
        supplierUpdated += counts.supplierUpdated
        catalogUpdated += counts.catalogUpdated
      }

      processed += sourceWindow.length
      offset += sourceWindow.length
      batchesProcessed++
    }

    const done = offset >= totalInFeed
    const nextOffset = done ? null : offset
    const durationMs = Date.now() - startedAt

    // Reaching the end of a non-empty feed is a successful traversal even when
    // the tail contains no valid retail rows, or when a previously persisted
    // cursor is now beyond the end because the supplier feed shrank. Missing or
    // rejected prices remain visible through counters/DB audits; they are not a
    // transport/persistence failure and must not strand the durable cursor.
    const ok = processed > 0 || done

    return {
      ok,
      totalInFeed,
      validPrices,
      processed,
      supplierUpdated,
      catalogUpdated,
      missingPrice,
      offset: requestedOffset,
      nextOffset,
      done,
      durationMs,
      safeUrl,
      message: done
        ? `RRP sync complete: ${processed} feed rows processed, ${supplierUpdated} supplier and ${catalogUpdated} catalog prices changed`
        : `RRP sync paused safely at offset ${nextOffset}: ${processed} feed rows processed; call again with offset=${nextOffset}`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      totalInFeed: 0,
      validPrices: 0,
      processed: 0,
      supplierUpdated: 0,
      catalogUpdated: 0,
      missingPrice: 0,
      offset: requestedOffset,
      nextOffset: requestedOffset,
      done: false,
      durationMs: Date.now() - startedAt,
      message,
    }
  }
}
