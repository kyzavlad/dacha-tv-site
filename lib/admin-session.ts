// ─── Signed, expiring admin session token ──────────────────────────────────
// Replaces the old `admin_session=1` cookie (a fixed literal string anyone
// could set via document.cookie in devtools to gain full /admin access
// without ever knowing ADMIN_PASSWORD). Uses only Web Crypto APIs
// (crypto.subtle, TextEncoder/Decoder, atob/btoa) so this module works
// identically in proxy.ts's Edge runtime and in Node route handlers/Server
// Actions — no Node-only crypto module, no next/headers import here (cookie
// access stays at each call site).
//
// Token shape: `<base64url(JSON{v,iat,exp})>.<base64url(HMAC-SHA256 signature)>`
// Verification checks, in order: legacy-value rejection, structural shape,
// HMAC signature (constant-time-safe compare), version, and expiration.
// Rotating ADMIN_SESSION_SECRET changes the HMAC key, so every previously
// issued token fails signature verification immediately.

export const ADMIN_SESSION_COOKIE = 'admin_session'
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 hours — bounded, not the old 30 days
const SESSION_VERSION = 'v1'

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  return secret
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signPayload(payloadB64: string, secret: string): Promise<string> {
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return base64UrlEncode(new Uint8Array(sig))
}

// Practical constant-time compare for two equal-length base64url strings —
// never short-circuits on the first differing character. (A true
// side-channel-proof compare would also need to hide length; token
// signatures here are always a fixed HMAC-SHA256 output length, so an
// attacker learns nothing new from a length check before this runs.)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface AdminSessionPayload {
  v: string
  iat: number
  exp: number
}

// Issues a fresh, signed session token valid for ADMIN_SESSION_TTL_SECONDS
// from `nowSeconds` (defaults to the real current time — tests may pass a
// fixed value for determinism).
export async function createAdminSessionToken(nowSeconds: number = Math.floor(Date.now() / 1000)): Promise<string> {
  const secret = getSecret()
  const payload: AdminSessionPayload = { v: SESSION_VERSION, iat: nowSeconds, exp: nowSeconds + ADMIN_SESSION_TTL_SECONDS }
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await signPayload(payloadB64, secret)
  return `${payloadB64}.${sig}`
}

// Verifies a cookie value is a well-formed, correctly-signed, non-expired,
// current-version admin session token. Returns false (never throws) for
// every failure mode — missing, the legacy "1" literal, malformed shape, bad
// signature, wrong version, or expired — so every call site can treat "not
// true" as "deny" uniformly.
export async function verifyAdminSessionToken(
  token: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token) return false
  if (token === '1') return false // explicit legacy-value rejection
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payloadB64, sig] = parts
  if (!payloadB64 || !sig) return false

  let secret: string
  try {
    secret = getSecret()
  } catch {
    return false
  }

  let expectedSig: string
  try {
    expectedSig = await signPayload(payloadB64, secret)
  } catch {
    return false
  }
  if (!timingSafeEqual(sig, expectedSig)) return false

  let payload: AdminSessionPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as AdminSessionPayload
  } catch {
    return false
  }
  if (payload.v !== SESSION_VERSION) return false
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return false
  if (nowSeconds > payload.exp) return false

  return true
}
