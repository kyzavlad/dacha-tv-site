import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAdminSessionToken, verifyAdminSessionToken, ADMIN_SESSION_COOKIE } from '../lib/admin-session.ts'

const withSecret = async (secret, fn) => {
  const previous = process.env.ADMIN_SESSION_SECRET
  process.env.ADMIN_SESSION_SECRET = secret
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.ADMIN_SESSION_SECRET
    else process.env.ADMIN_SESSION_SECRET = previous
  }
}

test('ADMIN_SESSION_COOKIE is a stable, expected cookie name', () => {
  assert.equal(ADMIN_SESSION_COOKIE, 'admin_session')
})

test('a freshly issued token is accepted', async () => {
  await withSecret('secret-a', async () => {
    const token = await createAdminSessionToken()
    assert.equal(await verifyAdminSessionToken(token), true)
  })
})

test('the legacy admin_session=1 literal is rejected', async () => {
  await withSecret('secret-a', async () => {
    assert.equal(await verifyAdminSessionToken('1'), false)
  })
})

test('no cookie / undefined / empty string is rejected', async () => {
  await withSecret('secret-a', async () => {
    assert.equal(await verifyAdminSessionToken(undefined), false)
    assert.equal(await verifyAdminSessionToken(null), false)
    assert.equal(await verifyAdminSessionToken(''), false)
  })
})

test('a malformed token (no signature part, garbage string) is rejected', async () => {
  await withSecret('secret-a', async () => {
    assert.equal(await verifyAdminSessionToken('not-a-real-token'), false)
    assert.equal(await verifyAdminSessionToken('a.b.c'), false)
    assert.equal(await verifyAdminSessionToken('..'), false)
  })
})

test('an expired token is rejected', async () => {
  await withSecret('secret-a', async () => {
    const issuedLongAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24 // 1 day ago
    const token = await createAdminSessionToken(issuedLongAgo)
    // Verify "now" (default) — TTL (12h) has long since passed.
    assert.equal(await verifyAdminSessionToken(token), false)
  })
})

test('a token still within its TTL window is accepted', async () => {
  await withSecret('secret-a', async () => {
    const issuedRecently = Math.floor(Date.now() / 1000) - 60 // 1 minute ago
    const token = await createAdminSessionToken(issuedRecently)
    assert.equal(await verifyAdminSessionToken(token), true)
  })
})

test('a forged token (tampered payload, original signature) is rejected', async () => {
  await withSecret('secret-a', async () => {
    const token = await createAdminSessionToken()
    const [payload, sig] = token.split('.')
    // Flip a character in the payload without re-signing — simulates an
    // attacker trying to extend expiration or change fields without the key.
    const tamperedPayload = payload.slice(0, -1) + (payload.at(-1) === 'A' ? 'B' : 'A')
    const forged = `${tamperedPayload}.${sig}`
    assert.equal(await verifyAdminSessionToken(forged), false)
  })
})

test('a token signed with a different secret is rejected (wrong signature)', async () => {
  const tokenFromSecretA = await withSecret('secret-a', () => createAdminSessionToken())
  await withSecret('secret-b', async () => {
    assert.equal(await verifyAdminSessionToken(tokenFromSecretA), false)
  })
})

test('rotating ADMIN_SESSION_SECRET invalidates all previously issued tokens', async () => {
  const oldToken = await withSecret('old-secret', () => createAdminSessionToken())
  await withSecret('old-secret', async () => {
    assert.equal(await verifyAdminSessionToken(oldToken), true, 'sanity check: valid under the original secret')
  })
  await withSecret('new-secret-after-rotation', async () => {
    assert.equal(await verifyAdminSessionToken(oldToken), false, 'must be rejected after the secret rotates')
    const newToken = await createAdminSessionToken()
    assert.equal(await verifyAdminSessionToken(newToken), true, 'a freshly issued token under the new secret still works')
  })
})

test('verification fails closed (returns false, never throws) when ADMIN_SESSION_SECRET is unset', async () => {
  const previous = process.env.ADMIN_SESSION_SECRET
  delete process.env.ADMIN_SESSION_SECRET
  try {
    assert.equal(await verifyAdminSessionToken('anything.here'), false)
  } finally {
    if (previous !== undefined) process.env.ADMIN_SESSION_SECRET = previous
  }
})

test('token issuance throws a clear error when ADMIN_SESSION_SECRET is unset (fails closed, never issues an unsigned token)', async () => {
  const previous = process.env.ADMIN_SESSION_SECRET
  delete process.env.ADMIN_SESSION_SECRET
  try {
    await assert.rejects(() => createAdminSessionToken())
  } finally {
    if (previous !== undefined) process.env.ADMIN_SESSION_SECRET = previous
  }
})

test('two tokens issued back-to-back have different signatures tied to their own payload (no signature reuse across timestamps)', async () => {
  await withSecret('secret-a', async () => {
    const t1 = await createAdminSessionToken(1000)
    const t2 = await createAdminSessionToken(2000)
    assert.notEqual(t1, t2)
  })
})
