// ─── Locale-prefixed rewrite target construction (PURE, unit-testable) ───────
// proxy.ts rewrites /ru/* and /en/* to the canonical (unprefixed) path via
// NextResponse.rewrite(absoluteUrl, ...). When that absolute URL points at a
// DIFFERENT origin than the one actually serving the request, Next.js
// performs a real internal HTTP fetch to it — which is exactly what the
// self-hosted deployment needs (Nginx terminates TLS and forwards to the
// plain-HTTP standalone Node server on 127.0.0.1:3030), but is also exactly
// what breaks if that origin is constructed wrong.
//
// Behind Nginx + X-Forwarded-Proto/Host, `request.nextUrl` reconstructs an
// HTTPS origin (matching the public site) while the standalone server itself
// only ever speaks plain HTTP on 127.0.0.1:3030. Rewriting to that
// HTTPS-but-actually-HTTP origin makes Next.js's internal fetch attempt a TLS
// handshake against a plain-HTTP port, which fails with a "wrong version
// number" TLS error — the production 500 on every /ru/* and /en/* route.
//
// The fix: when INTERNAL_APP_ORIGIN is set (self-hosted deployments only),
// target that known-good plain-HTTP internal origin instead of trusting the
// externally-visible one. Vercel / local `next dev` never set this env var,
// so their behavior — rewriting against request.nextUrl's own origin — is
// unchanged.

export interface LocaleRewriteUrlOptions {
  // The canonical (locale-prefix-stripped) pathname, e.g. '/services'. Always
  // starts with '/'.
  canonicalPathname: string
  // The original request's query string, including a leading '?' when
  // non-empty (matches URL.prototype.search), or '' when there is none.
  search: string
  // The origin Next.js itself resolved for this request (request.nextUrl.origin).
  // Used as-is when internalAppOrigin is not set — preserves the existing
  // Vercel/local-dev behavior exactly.
  requestOrigin: string
  // process.env.INTERNAL_APP_ORIGIN — optional, server-only. Never sent to
  // the client (read only in proxy.ts, a server-only module; not prefixed
  // with NEXT_PUBLIC_, so Next.js never inlines it into any client bundle).
  internalAppOrigin?: string | null
}

// Returns the absolute URL string proxy.ts should pass to
// NextResponse.rewrite() for a locale-prefixed public request.
export function buildLocaleRewriteUrl(opts: LocaleRewriteUrlOptions): string {
  const trimmedInternal = opts.internalAppOrigin?.trim()
  const base = trimmedInternal ? trimmedInternal.replace(/\/+$/, '') : opts.requestOrigin.replace(/\/+$/, '')
  return `${base}${opts.canonicalPathname}${opts.search}`
}
