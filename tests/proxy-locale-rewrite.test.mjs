import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import * as proxyModule from '../proxy.ts'

// tsx's loader double-wraps a `.ts` file's default export when it also has
// another named export (reproduced with a trivial two-line file — unrelated
// to this module's own code, and irrelevant to Next.js's real build, which
// uses SWC/Turbopack, not tsx). Unwrap defensively so this test targets the
// actual proxy() function either way.
const proxy = typeof proxyModule.default === 'function' ? proxyModule.default : proxyModule.default.default

// Next.js edge middleware signals a rewrite/redirect/header-override to the
// underlying dev/production server via these x-middleware-* response
// headers (verified directly against NextResponse's own behavior — see the
// commit that introduced this fix). Reading them here lets us assert on
// proxy.ts's actual behavior end-to-end without a running Next.js server.
function rewriteTarget(res) {
  return res.headers.get('x-middleware-rewrite')
}
function overriddenLocale(res) {
  return res.headers.get('x-middleware-request-x-dacha-locale')
}

function req(url, opts = {}) {
  return new NextRequest(url, opts)
}

// proxy() is async (it awaits verifyAdminSessionToken for /admin* gating),
// so every call site below must be awaited — Next.js's own middleware
// runtime already awaits handler results, this just mirrors that at the
// test layer.

test('/ru/services rewrites internally to /services', async () => {
  const previous = process.env.INTERNAL_APP_ORIGIN
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const res = await proxy(req('https://dachatv.com/ru/services', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    assert.equal(rewriteTarget(res), 'http://127.0.0.1:3030/services')
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_APP_ORIGIN
    else process.env.INTERNAL_APP_ORIGIN = previous
  }
})

test('/ru/flowers rewrites internally to /flowers', async () => {
  const previous = process.env.INTERNAL_APP_ORIGIN
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const res = await proxy(req('https://dachatv.com/ru/flowers', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    assert.equal(rewriteTarget(res), 'http://127.0.0.1:3030/flowers')
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_APP_ORIGIN
    else process.env.INTERNAL_APP_ORIGIN = previous
  }
})

test('/en/* is launch-disabled: it 307-redirects to canonical UA, never rewrites', async () => {
  const previous = process.env.INTERNAL_APP_ORIGIN
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const res = await proxy(req('https://dachatv.com/en/flowers', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    assert.equal(res.status, 307, 'EN is temporarily redirected (paused for launch)')
    assert.equal(rewriteTarget(res), null, 'EN must NOT rewrite')
    // Browser-facing redirect uses the public origin, never INTERNAL_APP_ORIGIN.
    assert.equal(res.headers.get('location'), 'https://dachatv.com/flowers')
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_APP_ORIGIN
    else process.env.INTERNAL_APP_ORIGIN = previous
  }
})

test('query strings survive the locale rewrite', async () => {
  const previous = process.env.INTERNAL_APP_ORIGIN
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const res = await proxy(req('https://dachatv.com/ru/beekeeper?utm_source=ads&page=2', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    assert.equal(rewriteTarget(res), 'http://127.0.0.1:3030/beekeeper?utm_source=ads&page=2')
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_APP_ORIGIN
    else process.env.INTERNAL_APP_ORIGIN = previous
  }
})

test('x-dacha-locale is set for the active ru locale (en is redirected, so it never sets one)', async () => {
  const previous = process.env.INTERNAL_APP_ORIGIN
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const ru = await proxy(req('https://dachatv.com/ru/services', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    assert.equal(overriddenLocale(ru), 'ru')
    // EN is launch-disabled: it 307-redirects and never sets a locale header.
    const en = await proxy(req('https://dachatv.com/en/services', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    assert.equal(en.status, 307)
    assert.equal(overriddenLocale(en), null)
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_APP_ORIGIN
    else process.env.INTERNAL_APP_ORIGIN = previous
  }
})

test('without INTERNAL_APP_ORIGIN, the rewrite still works (Vercel/local-dev behavior unchanged)', async () => {
  const previous = process.env.INTERNAL_APP_ORIGIN
  delete process.env.INTERNAL_APP_ORIGIN
  try {
    const res = await proxy(req('https://dachatv.com/ru/services'))
    assert.equal(rewriteTarget(res), 'https://dachatv.com/services')
    assert.equal(overriddenLocale(res), 'ru')
  } finally {
    if (previous !== undefined) process.env.INTERNAL_APP_ORIGIN = previous
  }
})

test('admin and API locale prefixes still REDIRECT (not rewrite), on the public origin', async () => {
  const previous = process.env.INTERNAL_APP_ORIGIN
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const resAdmin = await proxy(req('https://dachatv.com/ru/admin/orders', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    assert.equal(resAdmin.status, 307)
    assert.equal(resAdmin.headers.get('location'), 'https://dachatv.com/admin/orders')
    assert.equal(rewriteTarget(resAdmin), null, 'admin must redirect, not rewrite')

    // api under an ACTIVE locale (ru) still redirects to the canonical api path
    // (307, the admin/api branch) rather than rewriting.
    const resApi = await proxy(req('https://dachatv.com/ru/api/catalog/search', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    assert.equal(resApi.status, 307)
    assert.equal(resApi.headers.get('location'), 'https://dachatv.com/api/catalog/search')
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_APP_ORIGIN
    else process.env.INTERNAL_APP_ORIGIN = previous
  }
})

test('admin redirect never targets the internal origin, even when INTERNAL_APP_ORIGIN is set', async () => {
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const res = await proxy(req('https://dachatv.com/ru/admin', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    const location = res.headers.get('location')
    assert.ok(location, 'expected a redirect Location header')
    assert.equal(location.includes('127.0.0.1'), false, 'a browser-facing redirect must never point at the internal origin')
  } finally {
    delete process.env.INTERNAL_APP_ORIGIN
  }
})

test('Ukrainian unprefixed routes are untouched — no rewrite, no redirect', async () => {
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const res = await proxy(req('https://dachatv.com/services', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    assert.equal(rewriteTarget(res), null)
    assert.equal(res.headers.get('location'), null)
    assert.equal(overriddenLocale(res), null)
  } finally {
    delete process.env.INTERNAL_APP_ORIGIN
  }
})

test('INTERNAL_APP_ORIGIN value is never exposed in any response header key or value', async () => {
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const res = await proxy(req('https://dachatv.com/ru/services', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    for (const [key, value] of res.headers.entries()) {
      // The internal origin string itself is expected exactly once, as the
      // rewrite TARGET (x-middleware-rewrite) — that's the whole point of
      // the fix, and it's an internal Next.js signaling header stripped
      // before the response ever reaches a browser. It must never appear
      // anywhere else (e.g. echoed into a body, a Set-Cookie, a custom
      // header) and the variable NAME must never leak either.
      if (key === 'x-middleware-rewrite') continue
      assert.equal(value.includes('127.0.0.1'), false, `unexpected internal-origin leak in header ${key}`)
      assert.equal(key.toLowerCase().includes('internal_app_origin'), false)
      assert.equal(value.toLowerCase().includes('internal_app_origin'), false)
    }
  } finally {
    delete process.env.INTERNAL_APP_ORIGIN
  }
})

test('no redirect loop: the internal rewrite target is a plain canonical path the middleware will not re-match', async () => {
  process.env.INTERNAL_APP_ORIGIN = 'http://127.0.0.1:3030'
  try {
    const res = await proxy(req('https://dachatv.com/ru/services', { headers: { 'x-forwarded-proto': 'https', host: 'dachatv.com' } }))
    const target = rewriteTarget(res)
    const targetPath = new URL(target).pathname
    assert.equal(targetPath, '/services')
    // Simulate the app receiving that exact rewritten request path — proxy()
    // must treat it as an ordinary Ukrainian route (no locale prefix) and do
    // nothing further, not loop back into another rewrite.
    const second = await proxy(req(`http://127.0.0.1:3030${targetPath}`))
    assert.equal(rewriteTarget(second), null)
    assert.equal(second.headers.get('location'), null)
  } finally {
    delete process.env.INTERNAL_APP_ORIGIN
  }
})
