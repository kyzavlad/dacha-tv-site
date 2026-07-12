// ─── Marketing attribution (UTM + referrer) ──────────────────────────────────
// Captures where a visitor came from into a cookie on landing, and reads it back
// server-side when an order/inquiry is created so the admin can see which ad /
// campaign / channel produced the conversion — WITHOUT any schema change (the
// value is folded into the existing `source` text column) and WITHOUT touching
// analytics/Ads code. Everything is wrapped so it can never break a page or a
// submission.

export const ATTRIBUTION_COOKIE = 'dacha_attribution'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

// CLIENT: store UTM params + referrer host + landing path in a cookie. A paid/UTM
// click overwrites (last non-direct touch — the most relevant for the current
// conversion); otherwise we only seed the cookie once if nothing is stored yet.
// Never throws.
export function captureAttribution(): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    const hasUtm = UTM_KEYS.some((k) => url.searchParams.get(k))
    const alreadyStored = document.cookie.split('; ').some((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`))
    if (!hasUtm && alreadyStored) return

    const params = new URLSearchParams()
    for (const k of UTM_KEYS) {
      const v = url.searchParams.get(k)
      if (v) params.set(k, v.slice(0, 120))
    }
    if (document.referrer) {
      try { params.set('ref', new URL(document.referrer).hostname) } catch { /* ignore bad referrer */ }
    }
    params.set('lp', url.pathname.slice(0, 200))

    document.cookie =
      `${ATTRIBUTION_COOKIE}=${encodeURIComponent(params.toString())}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`
  } catch {
    /* never break the page */
  }
}

// SERVER / PURE: turn the stored cookie value into a compact, human-readable
// string for the `source` column, e.g. "utm: google/cpc/moto-parts · ref:
// instagram.com · lp: /catalog/na-skuter". Returns '' when there is nothing.
export function formatAttribution(cookieValue: string | undefined | null): string {
  if (!cookieValue) return ''
  try {
    const p = new URLSearchParams(decodeURIComponent(cookieValue))
    const utm = UTM_KEYS.map((k) => p.get(k)).filter(Boolean)
    const parts: string[] = []
    if (utm.length) parts.push(`utm: ${utm.join('/')}`)
    if (p.get('ref')) parts.push(`ref: ${p.get('ref')}`)
    if (p.get('lp')) parts.push(`lp: ${p.get('lp')}`)
    return parts.join(' · ')
  } catch {
    return ''
  }
}

// Combine the page path the form already sends with the attribution string.
export function buildStoredSource(pagePath: string | null | undefined, attribution: string): string | null {
  const combined = [pagePath, attribution].filter(Boolean).join(' · ')
  return combined || null
}

// ── Reading a stored `source` back for admin display / notifications ──────────
export interface ParsedSource {
  page: string | null   // the page path the form sent (e.g. /checkout)
  utm: string | null    // "source/medium/campaign/..." (raw joined)
  ref: string | null    // referrer host
  lp: string | null     // landing page path
  raw: string
}

// Parse a stored `source` value (page · utm: … · ref: … · lp: …) into parts so
// the admin can show attribution cleanly instead of one long string. Pure.
export function parseStoredSource(source: string | null | undefined): ParsedSource {
  const raw = (source ?? '').trim()
  const out: ParsedSource = { page: null, utm: null, ref: null, lp: null, raw }
  if (!raw) return out
  for (const part of raw.split(' · ')) {
    const p = part.trim()
    if (p.startsWith('utm: ')) out.utm = p.slice(5).trim() || null
    else if (p.startsWith('ref: ')) out.ref = p.slice(5).trim() || null
    else if (p.startsWith('lp: ')) out.lp = p.slice(4).trim() || null
    else if (!out.page) out.page = p || null
  }
  return out
}

// Compact one-line attribution for a Telegram/notification message, e.g.
// "Source: google / cpc / campaign-name · LP: /catalog/...". Empty when there is
// no UTM/landing info (so a direct/organic order adds no noise).
export function attributionNotificationLine(cookieValue: string | undefined | null): string {
  const parsed = parseStoredSource(formatAttribution(cookieValue))
  const bits: string[] = []
  if (parsed.utm) bits.push(`Source: ${parsed.utm.split('/').join(' / ')}`)
  if (parsed.lp) bits.push(`LP: ${parsed.lp}`)
  return bits.join(' · ')
}
