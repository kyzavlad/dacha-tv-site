import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import * as proxyModule from '../proxy.ts'
import {
  LOCALES,
  PUBLIC_LOCALES,
  PUBLIC_PREFIXED_LOCALES,
  isPublicLocale,
  localizedPath,
  switchLocaleHref,
} from '../lib/i18n.ts'
import { buildAlternates } from '../lib/seo.ts'

// proxy.ts has a default export AND a named `config`; tsx's loader double-wraps
// the default in that case (see tests/proxy-locale-rewrite.test.mjs). Unwrap.
const proxy = typeof proxyModule.default === 'function' ? proxyModule.default : proxyModule.default.default

function req(url, opts = {}) {
  return new NextRequest(url, opts)
}

// ── Requirement 1/4: EN is hidden publicly, but its dictionaries stay in code ──

test('PUBLIC_LOCALES exposes only uk + ru (EN hidden for launch)', () => {
  assert.deepEqual([...PUBLIC_LOCALES], ['uk', 'ru'])
  assert.equal(isPublicLocale('uk'), true)
  assert.equal(isPublicLocale('ru'), true)
  assert.equal(isPublicLocale('en'), false)
  assert.equal(isPublicLocale('de'), false)
})

test('EN is NOT deleted — it stays a supported Locale in code for a future phase', () => {
  assert.ok(LOCALES.includes('en'), 'en must remain in LOCALES (dictionaries kept)')
  assert.deepEqual([...LOCALES], ['uk', 'ru', 'en'])
})

test('only ru is a publicly-served prefixed locale (en prefix is disabled)', () => {
  assert.deepEqual([...PUBLIC_PREFIXED_LOCALES], ['ru'])
})

// ── Requirement 3: EN removed from hreflang/alternate links ───────────────────

test('buildAlternates advertises uk + ru + x-default, never en', () => {
  const { canonical, languages } = buildAlternates('uk', '/products')
  assert.ok(languages.uk, 'uk hreflang present')
  assert.ok(languages.ru, 'ru hreflang present')
  assert.equal(languages.en, undefined, 'en hreflang must be gone while EN is disabled')
  assert.equal(languages['x-default'], languages.uk, 'x-default points at uk')
  assert.ok(canonical.endsWith('/products'), 'uk canonical is prefix-less')
})

test('buildAlternates ru canonical is /ru-prefixed and still lists no en', () => {
  const { canonical, languages } = buildAlternates('ru', '/products')
  assert.ok(canonical.endsWith('/ru/products'))
  assert.equal(languages.en, undefined)
  assert.ok(languages.ru.endsWith('/ru/products'))
})

// ── Requirement 5 helpers: RU prefix persistence primitives ───────────────────

test('localizedPath keeps ru prefix and leaves uk prefix-less', () => {
  assert.equal(localizedPath('ru', '/catalog'), '/ru/catalog')
  assert.equal(localizedPath('ru', '/'), '/ru')
  assert.equal(localizedPath('uk', '/catalog'), '/catalog')
  assert.equal(localizedPath('uk', '/'), '/')
})

test('switchLocaleHref only ever targets a public locale prefix', () => {
  assert.equal(switchLocaleHref('ru', '/catalog/x'), '/ru/catalog/x')
  assert.equal(switchLocaleHref('uk', '/ru/catalog/x'), '/catalog/x')
})

// ── Requirement 2: /en and /en/* TEMPORARILY redirect (307) to canonical UA ───
// 307 (not 308) because EN is only paused for launch and will be restored — a
// permanent redirect would be cached and outlive the pause.

test('/en temporarily (307) redirects to the canonical UA home', async () => {
  const res = await proxy(req('https://dachatv.com/en'))
  assert.equal(res.status, 307)
  assert.equal(res.headers.get('location'), 'https://dachatv.com/')
})

test('/en/products temporarily (307) redirects to /products (canonical UA)', async () => {
  const res = await proxy(req('https://dachatv.com/en/products'))
  assert.equal(res.status, 307)
  assert.equal(res.headers.get('location'), 'https://dachatv.com/products')
})

test('/en deep path 307-redirects to the equivalent canonical path, preserving the query', async () => {
  const res = await proxy(req('https://dachatv.com/en/catalog/all?sort=price&page=2'))
  assert.equal(res.status, 307)
  const loc = new URL(res.headers.get('location'))
  assert.equal(loc.pathname, '/catalog/all')
  assert.equal(loc.searchParams.get('sort'), 'price')
  assert.equal(loc.searchParams.get('page'), '2')
})

test('/en never rewrites (no x-middleware-rewrite) — it is a hard redirect, no loop', async () => {
  const res = await proxy(req('https://dachatv.com/en/checkout'))
  assert.equal(res.headers.get('x-middleware-rewrite'), null)
  assert.equal(res.status, 307)
  // The redirect target is the canonical (prefix-less) path, so it can never
  // re-enter the /en branch — no redirect loop.
  assert.equal(new URL(res.headers.get('location')).pathname, '/checkout')
})

// ── Requirement: RU still works exactly as before (rewrite, not redirect) ──────

test('/ru still rewrites (not redirects) and sets x-dacha-locale=ru', async () => {
  const res = await proxy(req('https://dachatv.com/ru'))
  assert.equal(res.status, 200, 'ru is rewritten, so status is a pass-through 200, not a redirect')
  assert.equal(res.headers.get('location'), null, 'ru must NOT redirect')
  assert.equal(res.headers.get('x-middleware-rewrite') != null, true, 'ru is rewritten internally')
  assert.equal(res.headers.get('x-middleware-request-x-dacha-locale'), 'ru')
})

test('/ru/products rewrites to /products with the ru locale header', async () => {
  const res = await proxy(req('https://dachatv.com/ru/products'))
  assert.equal(res.headers.get('location'), null)
  const rewrite = res.headers.get('x-middleware-rewrite')
  assert.ok(rewrite, 'ru path is rewritten')
  assert.equal(new URL(rewrite).pathname, '/products')
  assert.equal(res.headers.get('x-middleware-request-x-dacha-locale'), 'ru')
})
