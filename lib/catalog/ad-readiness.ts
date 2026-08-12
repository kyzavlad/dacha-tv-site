// ─── Paid-search readiness for one demand cluster ────────────────────────────
// Turns "people search for X" into "we may send paid traffic to X", using only
// evidence the storefront can actually honour: matched published products, live
// stock, and a real displayable price. A cluster that fails any gate is NOT
// ad-ready — sending clicks to it burns budget on a page that cannot convert.
//
// Pure and DB-free: the counts come from countSearchSupply() (lib/supabase/
// catalog.ts), which reuses the public search matching, so the assessment can be
// unit-tested and reused by the admin page, the growth audit and the docs.

export interface ClusterSupply {
  matched: number   // published, in storefront scope, matching the query
  inStock: number   // of those, is_in_stock = true
  buyable: number   // of those, real non-suspicious price (ad landing must show a price)
}

export interface ClusterDemand {
  searches30: number
  searches7?: number
}

// Deliberately modest floors: enough inventory that a landing page looks like a
// real category rather than a dead end, not a growth target.
export const AD_READY_MIN_SEARCHES_30 = 3
export const AD_READY_MIN_IN_STOCK = 20
export const AD_READY_MIN_BUYABLE = 20

export type AdBlocker =
  | 'no_demand'
  | 'no_matching_products'
  | 'insufficient_stock'
  | 'insufficient_priced_inventory'

export interface AdReadiness {
  ready: boolean
  blockers: AdBlocker[]
  landingPath: string
  score: number // demand × sellable supply, for ranking only — never a forecast
}

// The landing page an ad click should reach. The buyable filter is part of the
// contract: a paid click must land on products that show a price and can be
// added to the cart, which is exactly what `?buyable=1` guarantees.
export function clusterLandingPath(query: string): string {
  return `/search?q=${encodeURIComponent(query.trim())}&buyable=1`
}

export function assessAdReadiness(query: string, demand: ClusterDemand, supply: ClusterSupply): AdReadiness {
  const blockers: AdBlocker[] = []
  if (demand.searches30 < AD_READY_MIN_SEARCHES_30) blockers.push('no_demand')
  if (supply.matched === 0) blockers.push('no_matching_products')
  else {
    if (supply.inStock < AD_READY_MIN_IN_STOCK) blockers.push('insufficient_stock')
    if (supply.buyable < AD_READY_MIN_BUYABLE) blockers.push('insufficient_priced_inventory')
  }
  // Ranking signal only: observed demand weighted by inventory that can actually
  // be bought. It is NOT a CTR/CPA/ROAS estimate and must never be presented as one.
  const sellable = Math.min(supply.inStock, supply.buyable)
  const score = demand.searches30 * Math.log10(Math.max(sellable, 1) + 1)
  return {
    ready: blockers.length === 0,
    blockers,
    landingPath: clusterLandingPath(query),
    score: Math.round(score * 100) / 100,
  }
}

export const AD_BLOCKER_LABELS: Record<AdBlocker, string> = {
  no_demand: 'замало внутрішнього попиту',
  no_matching_products: 'немає товарів за запитом',
  insufficient_stock: 'замало товарів в наявності',
  insufficient_priced_inventory: 'замало товарів з реальною ціною',
}

export interface RankedCluster {
  query: string
  demand: ClusterDemand
  supply: ClusterSupply
  readiness: AdReadiness
}

// Ad-ready clusters first, then by score. Deterministic tiebreak on the query so
// the admin table and the audit report agree.
export function rankClusters(rows: RankedCluster[]): RankedCluster[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.readiness.ready) - Number(a.readiness.ready) ||
      b.readiness.score - a.readiness.score ||
      a.query.localeCompare(b.query),
  )
}
