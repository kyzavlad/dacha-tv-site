// ─── Set-based existing-catalog refresh (fixes the import-products 504) ──────
// syncProductsToCatalog used to refresh every EXISTING catalog row matched to an
// unapproved supplier row via a sequential per-SKU UPDATE loop — tens of
// thousands of PostgREST round-trips at limit=10000, well past the serverless
// timeout. This module is a thin wrapper around the
// `refresh_existing_catalog_from_supplier` SQL function (see migration
// 20260721233000_set_based_catalog_refresh_v6.sql), which does the whole batch
// as one set-based UPDATE. Kept in its own module (rather than inlined in
// pipeline.ts) so the RPC call itself is trivially mockable in tests.

import type { getAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof getAdminClient>

export const MIN_REFRESH_LIMIT = 1
export const MAX_REFRESH_LIMIT = 10000

// Mirrors the SQL function's own `greatest(1, least(p_limit, 10000))` clamp —
// duplicated here (pure, unit-testable) so a caller can reason about the
// effective limit without a DB round-trip, and so the API layer never sends an
// out-of-range value even if the DB-side clamp were ever changed.
export function clampRefreshLimit(limit: number): number {
  const n = Math.round(Number(limit))
  if (!Number.isFinite(n)) return MIN_REFRESH_LIMIT
  return Math.max(MIN_REFRESH_LIMIT, Math.min(n, MAX_REFRESH_LIMIT))
}

export interface RefreshExistingResult {
  ok: boolean
  processed: number
  updated: number
  approved: number
  remainingExisting: number
  remainingNew: number
  remainingTotal: number
  // Diagnostics only: valid, unapproved supplier rows shadowed by a
  // source='manual' catalog row. Neither this RPC nor the new-product insert
  // path may ever touch them (a human owns that row) — they are reported
  // separately so they never block remainingTotal from reaching zero, and are
  // NEVER auto-approved.
  blockedManual: number
  message: string
}

interface RpcRow {
  processed: number | null
  updated: number | null
  approved: number | null
  remaining_existing: number | null
  remaining_new: number | null
  remaining_total: number | null
  blocked_manual: number | null
}

// Calls the set-based RPC exactly once per invocation — never a per-SKU loop.
// On RPC failure (timeout, connection error, function exception), or when the
// RPC returns no result row at all (should never happen — the SQL function
// always returns exactly one row — but is treated as a hard failure rather
// than silently defaulting every count to zero), returns ok=false without
// throwing. Because the SQL function does its update and approval as one
// all-or-nothing statement per call, an error here guarantees no rows were
// partially refreshed-but-unapproved.
export async function refreshExistingCatalogFromSupplier(
  client: AdminClient,
  limit: number,
): Promise<RefreshExistingResult> {
  const p_limit = clampRefreshLimit(limit)
  const { data, error } = await client.rpc('refresh_existing_catalog_from_supplier', { p_limit })

  if (error) {
    return {
      ok: false,
      processed: 0, updated: 0, approved: 0,
      remainingExisting: 0, remainingNew: 0, remainingTotal: 0, blockedManual: 0,
      message: `refresh_existing_catalog_from_supplier RPC failed: ${error.message}`,
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null | undefined
  if (!row) {
    return {
      ok: false,
      processed: 0, updated: 0, approved: 0,
      remainingExisting: 0, remainingNew: 0, remainingTotal: 0, blockedManual: 0,
      message: 'refresh_existing_catalog_from_supplier RPC returned no result row',
    }
  }

  const processed = row.processed ?? 0
  const updated = row.updated ?? 0
  const approved = row.approved ?? 0
  const remainingExisting = row.remaining_existing ?? 0
  const remainingNew = row.remaining_new ?? 0
  const remainingTotal = row.remaining_total ?? (remainingExisting + remainingNew)
  const blockedManual = row.blocked_manual ?? 0

  return {
    ok: true,
    processed, updated, approved,
    remainingExisting, remainingNew, remainingTotal, blockedManual,
    message: `Оновлення існуючих товарів: оброблено ${processed}, оновлено ${updated}, підтверджено ${approved}`,
  }
}

// ─── Pure mirror of the SQL function's per-row CASE logic ─────────────────────
// supabase/migrations/20260721233000_set_based_catalog_refresh_v6.sql is the
// production source of truth (it runs as one set-based UPDATE, not per-row);
// this function reproduces the exact same field-by-field rules so they can be
// unit-tested without a live Postgres instance. Keep the two in sync.

export interface CatalogRowOwnership {
  source: string | null
  priceManualLock: boolean
  imageManualLock: boolean
}

export interface SupplierRefreshFacts {
  priceUah: number | null
  mainImageUrl: string | null
  images: unknown
  stockQuantity: number | null
  isInStock: boolean | null
}

export interface CurrentCatalogValues {
  priceUah: number | null
  mainImageUrl: string | null
  images: unknown
}

export interface SimulatedRefreshOutcome {
  priceUah: number | null
  mainImageUrl: string | null
  images: unknown
  stockQuantity: number
  isInStock: boolean
}

// Returns null when the row would never be selected as an RPC candidate at all
// (source='manual' — the WHERE clause excludes it entirely, so it is left
// completely untouched, not just "refreshed with old values").
export function simulateExistingRowRefresh(
  current: CurrentCatalogValues,
  ownership: CatalogRowOwnership,
  supplier: SupplierRefreshFacts,
): SimulatedRefreshOutcome | null {
  if (ownership.source === 'manual') return null

  const priceUah = !ownership.priceManualLock && supplier.priceUah != null && supplier.priceUah > 0
    ? supplier.priceUah
    : current.priceUah

  const mainImageUrl = !ownership.imageManualLock ? supplier.mainImageUrl : current.mainImageUrl
  const images = !ownership.imageManualLock ? supplier.images : current.images

  // Stock is operational — always refreshed for a non-manual row, regardless
  // of price/image locks. Negative/null supplier stock normalizes to 0.
  const stockQuantity = Math.max(0, Math.round(supplier.stockQuantity ?? 0))
  const isInStock = stockQuantity > 0 || supplier.isInStock === true

  return { priceUah, mainImageUrl, images, stockQuantity, isInStock }
}
