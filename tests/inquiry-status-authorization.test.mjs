import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'

const require = createRequire(import.meta.url)
const { transformSync } = createRequire(require.resolve('tsx/package.json'))('esbuild')
const actionSource = readFileSync(new URL('../actions/submitInquiry.ts', import.meta.url), 'utf8')
const sessionSource = readFileSync(new URL('../lib/admin-session.ts', import.meta.url), 'utf8')
const id = '11111111-1111-4111-8111-111111111111'

function evaluate(source, filename, imports, env) {
  const cjsModule = { exports: {} }
  const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node22', sourcefile: filename }).code
  vm.runInNewContext(code, {
    module: cjsModule, exports: cjsModule.exports,
    require(name) {
      if (!Object.hasOwn(imports, name)) throw new Error('Unexpected test import: ' + name)
      return imports[name]
    },
    process: { env }, crypto: webcrypto, TextEncoder, TextDecoder,
    btoa, atob, FormData, URL, console,
  }, { filename })
  return cjsModule.exports
}

// Execute the real action body and real signature verifier. Only Next's request
// cookie adapter and side effects are replaced. No credentials or network exist
// in this isolated harness; every database effect is an in-memory synthetic row.
function harness({ cookie, cookieError = false, secret = 'audit-only-session-secret', dbError = false } = {}) {
  const env = secret ? { ADMIN_SESSION_SECRET: secret } : {}
  const auth = evaluate(sessionSource, 'lib/admin-session.ts', {}, env)
  const effects = { factories: 0, writes: [], notices: 0 }
  const row = { id, status: 'new' }
  const database = {
    from(table) {
      assert.equal(table, 'inquiries')
      return {
        update(payload) {
          return {
            async eq(column, value) {
              effects.writes.push({ table, payload: { ...payload }, column, value })
              if (!dbError && value === row.id) row.status = payload.status
              return { error: dbError ? { message: 'synthetic private failure' } : null }
            },
          }
        },
        async insert(payload) {
          effects.writes.push({ table, inserted: { ...payload } })
          return { error: null }
        },
      }
    },
  }
  const actions = evaluate(actionSource, 'actions/submitInquiry.ts', {
    zod: require('zod'),
    'next/headers': {
      cookies: async () => {
        if (cookieError) throw new Error('synthetic cookie failure')
        return { get: name => name === 'admin_session' && cookie ? { value: cookie } : undefined }
      },
    },
    '@/lib/admin-session': auth,
    '@/lib/supabase/client': { getSupabaseClient() { effects.factories++; return database } },
    '@/lib/notifications/telegram': { async sendTelegramNotification() { effects.notices++ } },
    '@/lib/notifications/email': { async sendEmailNotification() { effects.notices++ } },
    '@/lib/analytics/attribution': {
      ATTRIBUTION_COOKIE: 'test_attribution',
      formatAttribution: () => '',
      buildStoredSource: value => value,
    },
  }, env)
  return { actions, effects, row, auth }
}

async function signed({ issued, secret } = {}) {
  return harness({ secret }).auth.createAdminSessionToken(issued)
}

async function denied(options, status = 'completed', rowId = id) {
  const h = harness(options)
  const result = await h.actions.updateInquiryStatus(rowId, status)
  assert.equal(result.success, false, 'must fail closed')
  assert.equal(h.effects.factories, 0, 'must reject before creating a privileged DB client')
  assert.equal(h.effects.writes.length, 0, 'must not mutate the database')
  assert.equal(h.row.status, 'new')
}

test('guest cannot change inquiry status', () => denied({}))
test('legacy unsigned admin_session=1 cannot change status', () => denied({ cookie: '1' }))
test('malformed session cannot change status', () => denied({ cookie: 'not-a-session' }))
test('tampered signed token cannot change status', async () => {
  const token = await signed()
  const [body, signature] = token.split('.')
  const changed = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1)
  await denied({ cookie: body + '.' + changed })
})
test('expired signed token cannot change status', async () => {
  await denied({ cookie: await signed({ issued: Math.floor(Date.now() / 1000) - 13 * 60 * 60 }) })
})
test('missing session secret fails closed', async () => {
  await denied({ cookie: await signed(), secret: '' })
})
test('rotated session secret rejects an earlier token', async () => {
  await denied({ cookie: await signed({ secret: 'old-audit-secret' }), secret: 'new-audit-secret' })
})
test('cookie adapter failure cannot reach privileged database', () => denied({ cookieError: true }))
test('authenticated admin updates exactly the selected inquiry', async () => {
  const h = harness({ cookie: await signed() })
  const result = await h.actions.updateInquiryStatus(id, 'completed')
  assert.equal(result.success, true)
  assert.equal(h.effects.factories, 1)
  assert.deepEqual(h.effects.writes.map(x => [x.table, x.column, x.value, x.payload.status]),
    [['inquiries', 'id', id, 'completed']])
  assert.equal(h.row.status, 'completed')
  assert.equal(h.effects.notices, 0)
})
test('authenticated caller cannot supply an invalid status', async () => {
  await denied({ cookie: await signed() }, 'arbitrary-status')
})
test('authenticated caller cannot supply a malformed inquiry identifier', async () => {
  await denied({ cookie: await signed() }, 'completed', 'not-a-uuid')
})
test('authenticated caller cannot supply an object instead of a status', async () => {
  await denied({ cookie: await signed() }, { status: 'completed', admin_notes: 'unexpected' })
})
test('database failure is returned without private error details', async () => {
  const h = harness({ cookie: await signed(), dbError: true })
  const result = await h.actions.updateInquiryStatus(id, 'completed')
  assert.equal(result.success, false)
  assert.doesNotMatch(JSON.stringify(result), /synthetic private failure/)
  assert.equal(h.row.status, 'new')
})
test('all four valid inquiry statuses remain supported', async () => {
  for (const status of ['new', 'contacted', 'completed', 'cancelled']) {
    const h = harness({ cookie: await signed() })
    const result = await h.actions.updateInquiryStatus(id, status)
    assert.equal(result.success, true)
    assert.equal(h.row.status, status)
  }
})
for (const [method, extra] of [
  ['submitGeneralContact', {}],
  ['submitHoneyOrder', { product: 'Audit honey', packaging: '', quantity: '1' }],
  ['submitBeekeeperInquiry', { productType: 'Audit supply', breed: '', quantity: '1', timing: '' }],
  ['submitFlowerInquiry', { product: 'Audit flower' }],
]) {
  test('anonymous customer creation still works: ' + method, async () => {
    const h = harness()
    const form = new FormData()
    for (const [key, value] of Object.entries({
      name: 'Synthetic audit customer', phone: '0990000000',
      message: '', source: 'local-security-test', _honeypot: '', ...extra,
    })) form.set(key, value)
    const result = await h.actions[method](form)
    assert.equal(result.success, true)
    assert.equal(h.effects.writes.length, 1)
    assert.ok(h.effects.writes[0].inserted)
    assert.equal(h.effects.notices, 2)
  })
}
test('public inquiry honeypot still rejects before database access', async () => {
  const h = harness()
  const form = new FormData()
  for (const [k, v] of Object.entries({
    name: 'Synthetic audit customer', phone: '0990000000',
    message: '', source: '', _honeypot: 'bot',
  })) form.set(k, v)
  const result = await h.actions.submitGeneralContact(form)
  assert.equal(result.success, false)
  assert.equal(h.effects.factories, 0)
})
