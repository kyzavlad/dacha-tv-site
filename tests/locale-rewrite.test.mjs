import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLocaleRewriteUrl } from '../lib/locale-rewrite.ts'

test('with INTERNAL_APP_ORIGIN set, targets the internal origin + canonical path', () => {
  const url = buildLocaleRewriteUrl({
    canonicalPathname: '/services',
    search: '',
    requestOrigin: 'https://dachatv.com',
    internalAppOrigin: 'http://127.0.0.1:3030',
  })
  assert.equal(url, 'http://127.0.0.1:3030/services')
})

test('query strings survive the rewrite', () => {
  const url = buildLocaleRewriteUrl({
    canonicalPathname: '/flowers',
    search: '?utm_source=ads&x=1',
    requestOrigin: 'https://dachatv.com',
    internalAppOrigin: 'http://127.0.0.1:3030',
  })
  assert.equal(url, 'http://127.0.0.1:3030/flowers?utm_source=ads&x=1')
})

test('without INTERNAL_APP_ORIGIN, falls back to the request origin (Vercel/local dev unchanged)', () => {
  const url = buildLocaleRewriteUrl({
    canonicalPathname: '/beekeeper',
    search: '',
    requestOrigin: 'https://dachatv.com',
    internalAppOrigin: undefined,
  })
  assert.equal(url, 'https://dachatv.com/beekeeper')
})

test('an empty-string INTERNAL_APP_ORIGIN is treated as absent, not as an empty base', () => {
  const url = buildLocaleRewriteUrl({
    canonicalPathname: '/services',
    search: '',
    requestOrigin: 'http://localhost:3000',
    internalAppOrigin: '',
  })
  assert.equal(url, 'http://localhost:3000/services')
})

test('a whitespace-only INTERNAL_APP_ORIGIN is treated as absent', () => {
  const url = buildLocaleRewriteUrl({
    canonicalPathname: '/services',
    search: '',
    requestOrigin: 'http://localhost:3000',
    internalAppOrigin: '   ',
  })
  assert.equal(url, 'http://localhost:3000/services')
})

test('a trailing slash on INTERNAL_APP_ORIGIN does not produce a double slash', () => {
  const url = buildLocaleRewriteUrl({
    canonicalPathname: '/services',
    search: '',
    requestOrigin: 'https://dachatv.com',
    internalAppOrigin: 'http://127.0.0.1:3030/',
  })
  assert.equal(url, 'http://127.0.0.1:3030/services')
})

test('the root path rewrites correctly with a query string', () => {
  const url = buildLocaleRewriteUrl({
    canonicalPathname: '/',
    search: '?ref=x',
    requestOrigin: 'https://dachatv.com',
    internalAppOrigin: 'http://127.0.0.1:3030',
  })
  assert.equal(url, 'http://127.0.0.1:3030/?ref=x')
})

test('INTERNAL_APP_ORIGIN never appears alongside the request origin — it fully replaces it', () => {
  const url = buildLocaleRewriteUrl({
    canonicalPathname: '/services',
    search: '',
    requestOrigin: 'https://dachatv.com',
    internalAppOrigin: 'http://127.0.0.1:3030',
  })
  assert.equal(url.includes('dachatv.com'), false)
})
