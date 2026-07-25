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

// ── EN is publicly RESTORED — served as real 200 pages under /en ──────────────

test('PUBLIC_LOCALES exposes uk + ru + en (English restored)', () => {
  assert.deepEqual([...PUBLIC_LOCALES], ['uk', 'ru', 'en'])
  assert.equal(isPublicLocale('uk'), true)
  assert.equal(isPublicLocale('ru'), true)
  assert.equal(isPublicLocale('en'), true)
  assert.equal(isPublicLocale('de'), false)
})

test('LOCALES is the full trilingual set', () => {
  assert.deepEqual([...LOCALES], ['uk', 'ru', 'en'])
})

test('ru and en are both publicly-served prefixed locales', () => {
  assert.deepEqual([...PUBLIC_PREFIXED_LOCALES], ['ru', 'en'])
})

// ── Requirement 3: EN is in hreflang/alternate links again ────────────────────

test('buildAlternates advertises uk + ru + en + x-default', () => {
  const { canonical, languages } = buildAlternates('uk', '/products')
  assert.ok(languages.uk, 'uk hreflang present')
  assert.ok(languages.ru, 'ru hreflang present')
  assert.ok(languages.en && languages.en.endsWith('/en/products'), 'en hreflang present and /en-prefixed')
  assert.equal(languages['x-default'], languages.uk, 'x-default points at uk')
  assert.ok(canonical.endsWith('/products'), 'uk canonical is prefix-less')
})

test('buildAlternates en canonical is /en-prefixed and lists all three', () => {
  const { canonical, languages } = buildAlternates('en', '/products')
  assert.ok(canonical.endsWith('/en/products'))
  assert.ok(languages.uk.endsWith('/products'))
  assert.ok(languages.ru.endsWith('/ru/products'))
  assert.ok(languages.en.endsWith('/en/products'))
})

// ── Prefix persistence primitives ─────────────────────────────────────────────

test('localizedPath keeps ru/en prefixes and leaves uk prefix-less', () => {
  assert.equal(localizedPath('ru', '/catalog'), '/ru/catalog')
  assert.equal(localizedPath('en', '/catalog'), '/en/catalog')
  assert.equal(localizedPath('en', '/'), '/en')
  assert.equal(localizedPath('uk', '/catalog'), '/catalog')
})

test('switchLocaleHref targets every public locale prefix', () => {
  assert.equal(switchLocaleHref('ru', '/catalog/x'), '/ru/catalog/x')
  assert.equal(switchLocaleHref('en', '/catalog/x'), '/en/catalog/x')
  assert.equal(switchLocaleHref('uk', '/en/catalog/x'), '/catalog/x')
})

// ── /en is now REWRITTEN (like /ru), not redirected ───────────────────────────

test('/en rewrites (not redirects) and sets x-dacha-locale=en', async () => {
  const res = await proxy(req('https://dachatv.com/en'))
  assert.equal(res.headers.get('location'), null, '/en must NOT redirect anymore')
  assert.ok(res.headers.get('x-middleware-rewrite'), '/en is rewritten internally')
  assert.equal(res.headers.get('x-middleware-request-x-dacha-locale'), 'en')
})

test('/en/products rewrites to /products with the en locale header', async () => {
  const res = await proxy(req('https://dachatv.com/en/products'))
  assert.equal(res.headers.get('location'), null)
  const rewrite = res.headers.get('x-middleware-rewrite')
  assert.ok(rewrite)
  assert.equal(new URL(rewrite).pathname, '/products')
  assert.equal(res.headers.get('x-middleware-request-x-dacha-locale'), 'en')
})

test('/en deep path rewrites, preserving the query, no redirect loop', async () => {
  const res = await proxy(req('https://dachatv.com/en/catalog/all?sort=price&page=2'))
  assert.equal(res.headers.get('location'), null)
  const rewrite = new URL(res.headers.get('x-middleware-rewrite'))
  assert.equal(rewrite.pathname, '/catalog/all')
  assert.equal(rewrite.searchParams.get('sort'), 'price')
  assert.equal(rewrite.searchParams.get('page'), '2')
})

// ── RU still works exactly as before (rewrite, not redirect) ──────────────────

test('/ru still rewrites (not redirects) and sets x-dacha-locale=ru', async () => {
  const res = await proxy(req('https://dachatv.com/ru'))
  assert.equal(res.headers.get('location'), null, 'ru must NOT redirect')
  assert.equal(res.headers.get('x-middleware-rewrite') != null, true, 'ru is rewritten internally')
  assert.equal(res.headers.get('x-middleware-request-x-dacha-locale'), 'ru')
})
