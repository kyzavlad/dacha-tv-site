// ─── Google Analytics 4 / Google Ads event layer ─────────────────────────────
// A thin, dependency-free wrapper over gtag(). Every helper is SAFE to call on
// the server or when analytics is not configured: if `window.gtag` is missing
// (env vars unset, SSR, ad-blocker) the call is a no-op that only logs to the
// console in debug mode. Nothing here ever throws, so wiring an event into a
// checkout/cart path can never break that flow.
//
// Required env (all optional — missing ⇒ safe no-op, documented in .env.example):
//   NEXT_PUBLIC_GA_MEASUREMENT_ID        GA4 measurement id, e.g. G-XXXXXXXXXX
//   NEXT_PUBLIC_GOOGLE_ADS_ID            Google Ads tag id, e.g. AW-XXXXXXXXXX
//   NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL  Ads purchase conversion label
//   NEXT_PUBLIC_ANALYTICS_DEBUG          '1' to force console logging in prod

export const GA_MEASUREMENT_ID = (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '').trim()
export const GOOGLE_ADS_ID = (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? '').trim()
export const GOOGLE_ADS_PURCHASE_LABEL = (process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL ?? '').trim()

// Debug logging is on outside production, or when explicitly forced. Lets us
// verify events in the browser console / Network tab (requirement 7).
export const ANALYTICS_DEBUG =
  process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === '1' || process.env.NODE_ENV !== 'production'

// Single storefront currency.
export const CURRENCY = 'UAH'

export type GtagParams = Record<string, unknown>

// A GA4 ecommerce item. Keep it minimal — item_id + item_name are the only
// truly required fields; the rest enrich reporting when available.
export interface AnalyticsItem {
  item_id: string
  item_name: string
  price?: number
  quantity?: number
  item_variant?: string
  item_category?: string
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

export function analyticsConfigured(): boolean {
  return Boolean(GA_MEASUREMENT_ID || GOOGLE_ADS_ID)
}

function debugLog(event: string, params: GtagParams): void {
  if (!ANALYTICS_DEBUG) return
  // eslint-disable-next-line no-console
  console.debug(`[analytics] ${event}`, params)
}

// Fire a raw gtag event. No-op (but still debug-logged) when gtag is unavailable.
export function gaEvent(event: string, params: GtagParams = {}): void {
  debugLog(event, params)
  if (typeof window === 'undefined') return
  if (typeof window.gtag !== 'function') return
  try {
    window.gtag('event', event, params)
  } catch {
    /* never let analytics break the caller */
  }
}

// Round to whole UAH — GA4/Ads want a numeric value, not a currency string.
function toValue(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0
}

// ── Standard GA4 events ──────────────────────────────────────────────────────

export function trackSearch(searchTerm: string, resultCount?: number): void {
  const term = searchTerm.trim()
  if (!term) return
  gaEvent('search', {
    search_term: term,
    ...(typeof resultCount === 'number' ? { result_count: resultCount } : {}),
  })
}

export function trackViewItem(item: AnalyticsItem): void {
  gaEvent('view_item', {
    currency: CURRENCY,
    value: toValue(item.price),
    items: [item],
  })
}

// GA4 view_item_list — fired once when a model landing's product grid is shown.
// `item_list_id`/`item_list_name` are stamped on each item so GA4 attributes the
// downstream select_item / view_item to this list.
export function trackViewItemList(listId: string, listName: string, items: AnalyticsItem[]): void {
  if (items.length === 0) return
  gaEvent('view_item_list', {
    item_list_id: listId,
    item_list_name: listName,
    items: items.map((it) => ({ ...it, item_list_id: listId, item_list_name: listName })),
  })
}

// GA4 select_item — fired when a product is clicked from a model landing list.
export function trackSelectItem(listId: string, listName: string, item: AnalyticsItem): void {
  gaEvent('select_item', {
    item_list_id: listId,
    item_list_name: listName,
    items: [{ ...item, item_list_id: listId, item_list_name: listName }],
  })
}

export function trackAddToCart(item: AnalyticsItem): void {
  const qty = item.quantity ?? 1
  gaEvent('add_to_cart', {
    currency: CURRENCY,
    value: toValue((item.price ?? 0) * qty),
    items: [{ ...item, quantity: qty }],
  })
}

export function trackBeginCheckout(items: AnalyticsItem[], value: number): void {
  gaEvent('begin_checkout', {
    currency: CURRENCY,
    value: toValue(value),
    items,
  })
}

export interface PurchaseArgs {
  orderId: string
  value: number
  items: AnalyticsItem[]
  isTest?: boolean
}

// Purchase / order_submit. Called ONLY after a successful internal order
// creation. Real orders fire the GA4 `purchase` event AND the Google Ads
// conversion (when configured). Test/internal orders instead fire a clearly
// marked `order_submit_test` debug event and NEVER the real Ads conversion.
export function trackPurchase({ orderId, value, items, isTest }: PurchaseArgs): void {
  const payload: GtagParams = {
    transaction_id: orderId,
    currency: CURRENCY,
    value: toValue(value),
    items,
  }

  if (isTest) {
    gaEvent('order_submit_test', { ...payload, test_order: true })
    return
  }

  gaEvent('purchase', payload)

  // Google Ads purchase conversion — only when both id + label are configured.
  if (GOOGLE_ADS_ID && GOOGLE_ADS_PURCHASE_LABEL) {
    gaEvent('conversion', {
      send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`,
      transaction_id: orderId,
      currency: CURRENCY,
      value: toValue(value),
    })
  }
}

export function trackPhoneClick(phone?: string, location?: string): void {
  gaEvent('phone_click', {
    ...(phone ? { phone_number: phone } : {}),
    ...(location ? { location } : {}),
    ...(typeof window !== 'undefined' ? { page_path: window.location.pathname } : {}),
  })
}
