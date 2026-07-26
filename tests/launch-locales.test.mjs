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

// ── Public launch locales: complete UA + RU only ──────────────────────────────

test('PUBLIC_LOCALES exposes only fully maintained uk + ru', () => {
  assert.deepEqual([...PUBLIC_LOCALES], ['uk', 'ru'])
  assert.equal(isPublicLocale('uk'), true)
  assert.equal(isPublicLocale('ru'), true)
  assert.equal(isPublicLocale('en'), false)
  assert.equal(isPublicLocale('de'), false)
})

test('LOCALES is the full trilingual set', () => {
  assert.deepEqual([...LOCALES], ['uk', 'ru', 'en'])
})

test('ru is the only publicly-served prefixed locale', () => {
  assert.deepEqual([...PUBLIC_PREFIXED_LOCALES], ['ru'])
})

// ── hreflang never advertises an incomplete English page ─────────────────────

test('buildAlternates advertises uk + ru + x-default, not en', () => {
  const { canonical, languages } = buildAlternates('uk', '/products')
  assert.ok(languages.uk, 'uk hreflang present')
  assert.ok(languages.ru, 'ru hreflang present')
  assert.equal(languages.en, undefined, 'disabled en hreflang must be absent')
  assert.equal(languages['x-default'], languages.uk, 'x-default points at uk')
  assert.ok(canonical.endsWith('/products'), 'uk canonical is prefix-less')
})

test('an internal en canonical still never advertises en as public', () => {
  const { canonical, languages } = buildAlternates('en', '/products')
  assert.ok(canonical.endsWith('/en/products'))
  assert.ok(languages.uk.endsWith('/products'))
  assert.ok(languages.ru.endsWith('/ru/products'))
  assert.equal(languages.en, undefined)
})

// ── Prefix persistence primitives ─────────────────────────────────────────────

test('localizedPath keeps ru/en prefixes and leaves uk prefix-less', () => {
  assert.equal(localizedPath('ru', '/catalog'), '/ru/catalog')
  assert.equal(localizedPath('en', '/catalog'), '/en/catalog')
  assert.equal(localizedPath('en', '/'), '/en')
  assert.equal(localizedPath('uk', '/catalog'), '/catalog')
})

test('switchLocaleHref retains the supported en primitive for a future launch', () => {
  assert.equal(switchLocaleHref('ru', '/catalog/x'), '/ru/catalog/x')
  assert.equal(switchLocaleHref('en', '/catalog/x'), '/en/catalog/x')
  assert.equal(switchLocaleHref('uk', '/en/catalog/x'), '/catalog/x')
})

// ── /en redirects to the equivalent RU page (never Russian under /en) ─────────

test('/en redirects to /ru', async () => {
  const res = await proxy(req('https://dachatv.com/en'))
  assert.equal(res.status, 307)
  assert.equal(res.headers.get('location'), 'https://dachatv.com/ru')
  assert.equal(res.headers.get('x-middleware-rewrite'), null)
})

test('/en/products redirects to the equivalent /ru/products page', async () => {
  const res = await proxy(req('https://dachatv.com/en/products'))
  assert.equal(res.status, 307)
  assert.equal(res.headers.get('location'), 'https://dachatv.com/ru/products')
})

test('/en deep path redirects to RU and preserves the query', async () => {
  const res = await proxy(req('https://dachatv.com/en/catalog/all?sort=price&page=2'))
  assert.equal(res.status, 307)
  const location = new URL(res.headers.get('location'))
  assert.equal(location.pathname, '/ru/catalog/all')
  assert.equal(location.searchParams.get('sort'), 'price')
  assert.equal(location.searchParams.get('page'), '2')
})

// ── RU still works exactly as before (rewrite, not redirect) ──────────────────

test('/ru still rewrites (not redirects) and sets x-dacha-locale=ru', async () => {
  const res = await proxy(req('https://dachatv.com/ru'))
  assert.equal(res.headers.get('location'), null, 'ru must NOT redirect')
  assert.equal(res.headers.get('x-middleware-rewrite') != null, true, 'ru is rewritten internally')
  assert.equal(res.headers.get('x-middleware-request-x-dacha-locale'), 'ru')
})
