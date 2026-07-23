import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import * as proxyModule from '../proxy.ts'
import { createAdminSessionToken } from '../lib/admin-session.ts'

// tsx's loader double-wraps a `.ts` file's default export when it also has
// another named export (see tests/proxy-locale-rewrite.test.mjs for the
// minimal repro) — unrelated to this module's own code, and irrelevant to
// Next.js's real build (SWC/Turbopack, not tsx).
const proxy = typeof proxyModule.default === 'function' ? proxyModule.default : proxyModule.default.default

function req(url, opts = {}) {
  return new NextRequest(url, opts)
}

function withAdminEnv(overrides, fn) {
  const keys = ['ADMIN_SESSION_SECRET', 'CRON_SECRET']
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  Object.assign(process.env, { ADMIN_SESSION_SECRET: 'test-admin-secret', CRON_SECRET: 'test-cron-secret', ...overrides })
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of keys) {
        if (previous[k] === undefined) delete process.env[k]
        else process.env[k] = previous[k]
      }
    })
}

// ── /admin/* pages ──────────────────────────────────────────────────────────

test('no cookie -> /admin page is redirected to /admin/login', async () => {
  await withAdminEnv({}, async () => {
    const res = await proxy(req('https://dachatv.com/admin/orders'))
    assert.equal(res.status, 307)
    assert.equal(res.headers.get('location'), 'https://dachatv.com/admin/login')
  })
})

test('legacy admin_session=1 -> rejected, redirected to /admin/login', async () => {
  await withAdminEnv({}, async () => {
    const res = await proxy(req('https://dachatv.com/admin/orders', { headers: { cookie: 'admin_session=1' } }))
    assert.equal(res.status, 307)
    assert.equal(res.headers.get('location'), 'https://dachatv.com/admin/login')
  })
})

test('malformed token -> rejected, redirected to /admin/login', async () => {
  await withAdminEnv({}, async () => {
    const res = await proxy(req('https://dachatv.com/admin/orders', { headers: { cookie: 'admin_session=not-a-real-token' } }))
    assert.equal(res.status, 307)
  })
})

test('expired token -> rejected, redirected to /admin/login', async () => {
  await withAdminEnv({}, async () => {
    const issuedLongAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24
    const token = await createAdminSessionToken(issuedLongAgo)
    const res = await proxy(req('https://dachatv.com/admin/orders', { headers: { cookie: `admin_session=${token}` } }))
    assert.equal(res.status, 307)
  })
})

test('forged token (tampered payload) -> rejected, redirected to /admin/login', async () => {
  await withAdminEnv({}, async () => {
    const token = await createAdminSessionToken()
    const [payload, sig] = token.split('.')
    const forged = `${payload.slice(0, -1)}X.${sig}`
    const res = await proxy(req('https://dachatv.com/admin/orders', { headers: { cookie: `admin_session=${forged}` } }))
    assert.equal(res.status, 307)
  })
})

test('valid signed token -> accepted, no redirect, x-dacha-section=admin set', async () => {
  await withAdminEnv({}, async () => {
    const token = await createAdminSessionToken()
    const res = await proxy(req('https://dachatv.com/admin/orders', { headers: { cookie: `admin_session=${token}` } }))
    assert.equal(res.headers.get('location'), null)
    assert.equal(res.headers.get('x-middleware-request-x-dacha-section'), 'admin')
  })
})

test('rotating ADMIN_SESSION_SECRET invalidates an old token at the proxy layer', async () => {
  const token = await withAdminEnv({ ADMIN_SESSION_SECRET: 'rotation-old' }, () => createAdminSessionToken())
  await withAdminEnv({ ADMIN_SESSION_SECRET: 'rotation-new' }, async () => {
    const res = await proxy(req('https://dachatv.com/admin/orders', { headers: { cookie: `admin_session=${token}` } }))
    assert.equal(res.status, 307, 'old token must be rejected after the secret rotates')
  })
})

test('/admin/login itself is always reachable, even with no cookie', async () => {
  await withAdminEnv({}, async () => {
    const res = await proxy(req('https://dachatv.com/admin/login'))
    assert.equal(res.headers.get('location'), null)
  })
})

// ── /api/admin/* routes ──────────────────────────────────────────────────────

test('protected admin API without a session -> denied (401 JSON, not a page redirect)', async () => {
  await withAdminEnv({}, async () => {
    const res = await proxy(req('https://dachatv.com/api/admin/catalog/repair'))
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.error, 'Unauthorized')
  })
})

test('protected admin API with a valid session -> accepted', async () => {
  await withAdminEnv({}, async () => {
    const token = await createAdminSessionToken()
    const res = await proxy(req('https://dachatv.com/api/admin/catalog/repair', { headers: { cookie: `admin_session=${token}` } }))
    assert.notEqual(res.status, 401)
  })
})

test('cron endpoints continue to work via CRON_SECRET, with no session cookie at all', async () => {
  await withAdminEnv({}, async () => {
    const res = await proxy(req('https://dachatv.com/api/admin/cron/import-products', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }))
    assert.notEqual(res.status, 401, 'a valid CRON_SECRET must pass the proxy gate with no browser session at all')
  })
})

test('cron endpoints are NOT broken by the new admin-session gate when CRON_SECRET is wrong', async () => {
  await withAdminEnv({}, async () => {
    const res = await proxy(req('https://dachatv.com/api/admin/cron/import-products', {
      headers: { authorization: 'Bearer wrong-secret' },
    }))
    assert.equal(res.status, 401, 'an invalid cron secret and no session must still be denied')
  })
})

test('/api/admin/login and /api/admin/logout remain reachable with no session/cron credentials', async () => {
  await withAdminEnv({}, async () => {
    const login = await proxy(req('https://dachatv.com/api/admin/login', { method: 'POST' }))
    assert.notEqual(login.status, 401)
    const logout = await proxy(req('https://dachatv.com/api/admin/logout'))
    assert.notEqual(logout.status, 401)
  })
})

test('a legacy admin_session=1 cookie is rejected on the admin API path too', async () => {
  await withAdminEnv({}, async () => {
    const res = await proxy(req('https://dachatv.com/api/admin/catalog/repair', { headers: { cookie: 'admin_session=1' } }))
    assert.equal(res.status, 401)
  })
})
