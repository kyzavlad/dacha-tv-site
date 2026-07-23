import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSeoAutomationEnabled, seoAutomationDisabledBody } from '../lib/catalog/seo-automation-guard.ts'
import { GET as aiCandidatesGet } from '../app/api/admin/seo/ai-candidates/route.ts'
import { POST as applyAiBatchPost } from '../app/api/admin/seo/apply-ai-batch/route.ts'
import { POST as applyCategoryAiBatchPost } from '../app/api/admin/seo/apply-category-ai-batch/route.ts'
import { GET as batchReportGet, POST as batchReportPost } from '../app/api/admin/seo/batch-report/route.ts'
import { GET as categoryAiCandidatesGet } from '../app/api/admin/seo/category-ai-candidates/route.ts'
import { POST as ruApplyCategoryAiBatchPost } from '../app/api/admin/seo/ru/apply-category-ai-batch/route.ts'
import { POST as ruApplyProductAiBatchPost } from '../app/api/admin/seo/ru/apply-product-ai-batch/route.ts'
import { GET as ruCategoryAiCandidatesGet } from '../app/api/admin/seo/ru/category-ai-candidates/route.ts'
import { GET as ruProductAiCandidatesGet } from '../app/api/admin/seo/ru/product-ai-candidates/route.ts'

const CRON_SECRET = 'test-cron-secret-seo-guard'

function withEnv(overrides, fn) {
  const keys = ['CRON_SECRET', 'SEO_AUTOMATION_ENABLED', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  // Deliberately do NOT set Supabase creds here — if a route reaches
  // getAdminClient() it throws immediately ("Supabase admin credentials are
  // not configured"), which is exactly the tripwire this test suite uses to
  // prove a disabled route never touches the database.
  for (const k of keys) delete process.env[k]
  Object.assign(process.env, { CRON_SECRET, ...overrides })
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of keys) {
        if (previous[k] === undefined) delete process.env[k]
        else process.env[k] = previous[k]
      }
    })
}

function getReq(url) {
  return new Request(url, { headers: { authorization: `Bearer ${CRON_SECRET}` } })
}
function postReq(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${CRON_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? { items: [] }),
  })
}

const ROUTES = [
  { name: 'ai-candidates GET', call: () => aiCandidatesGet(getReq('https://x/api/admin/seo/ai-candidates')) },
  { name: 'apply-ai-batch POST', call: () => applyAiBatchPost(postReq('https://x/api/admin/seo/apply-ai-batch')) },
  { name: 'apply-category-ai-batch POST', call: () => applyCategoryAiBatchPost(postReq('https://x/api/admin/seo/apply-category-ai-batch')) },
  { name: 'batch-report GET', call: () => batchReportGet(getReq('https://x/api/admin/seo/batch-report?locale=uk')) },
  { name: 'batch-report POST', call: () => batchReportPost(postReq('https://x/api/admin/seo/batch-report', { locale: 'uk', apply: {} })) },
  { name: 'category-ai-candidates GET', call: () => categoryAiCandidatesGet(getReq('https://x/api/admin/seo/category-ai-candidates')) },
  { name: 'ru/apply-category-ai-batch POST', call: () => ruApplyCategoryAiBatchPost(postReq('https://x/api/admin/seo/ru/apply-category-ai-batch')) },
  { name: 'ru/apply-product-ai-batch POST', call: () => ruApplyProductAiBatchPost(postReq('https://x/api/admin/seo/ru/apply-product-ai-batch')) },
  { name: 'ru/category-ai-candidates GET', call: () => ruCategoryAiCandidatesGet(getReq('https://x/api/admin/seo/ru/category-ai-candidates')) },
  { name: 'ru/product-ai-candidates GET', call: () => ruProductAiCandidatesGet(getReq('https://x/api/admin/seo/ru/product-ai-candidates')) },
]

test('isSeoAutomationEnabled requires the literal string "true" — nothing else', () => {
  const prev = process.env.SEO_AUTOMATION_ENABLED
  try {
    delete process.env.SEO_AUTOMATION_ENABLED
    assert.equal(isSeoAutomationEnabled(), false)
    for (const v of ['1', 'TRUE', 'True', 'yes', 'on', '']) {
      process.env.SEO_AUTOMATION_ENABLED = v
      assert.equal(isSeoAutomationEnabled(), false, `"${v}" must not enable automation`)
    }
    process.env.SEO_AUTOMATION_ENABLED = 'true'
    assert.equal(isSeoAutomationEnabled(), true)
  } finally {
    if (prev === undefined) delete process.env.SEO_AUTOMATION_ENABLED
    else process.env.SEO_AUTOMATION_ENABLED = prev
  }
})

test('seoAutomationDisabledBody matches the exact required contract', () => {
  assert.deepEqual(seoAutomationDisabledBody(), {
    ok: true,
    disabled: true,
    reason: 'SEO_AUTOMATION_ENABLED is not true',
  })
})

for (const route of ROUTES) {
  test(`${route.name}: disabled by default — no SEO_AUTOMATION_ENABLED set, no DB work`, async () => {
    await withEnv({}, async () => {
      const res = await route.call()
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.deepEqual(body, { ok: true, disabled: true, reason: 'SEO_AUTOMATION_ENABLED is not true' })
    })
  })

  test(`${route.name}: disabled when SEO_AUTOMATION_ENABLED is not exactly "true"`, async () => {
    await withEnv({ SEO_AUTOMATION_ENABLED: '1' }, async () => {
      const res = await route.call()
      const body = await res.json()
      assert.equal(body.disabled, true)
    })
  })

  test(`${route.name}: still requires CRON_SECRET auth even when automation is enabled`, async () => {
    await withEnv({ SEO_AUTOMATION_ENABLED: 'true', CRON_SECRET: 'a-different-secret' }, async () => {
      const res = await route.call()
      assert.equal(res.status, 401)
    })
  })

  // Contrast case: proves the guard is the actual gate, not a coincidence.
  // With automation ENABLED and no Supabase credentials configured, the
  // route must proceed past the guard and hit getAdminClient() — which
  // throws without credentials — instead of returning the disabled body.
  // Some routes catch that error and return it as JSON (ok:false); others
  // (the unguarded POST-apply routes) let it propagate — both are equally
  // valid proof the route reached real DB-touching code, so both are accepted.
  test(`${route.name}: when enabled, the route proceeds past the guard (hits the missing-Supabase-credentials tripwire, not the disabled body)`, async () => {
    await withEnv({ SEO_AUTOMATION_ENABLED: 'true' }, async () => {
      try {
        const res = await route.call()
        const body = await res.json()
        assert.notEqual(body.disabled, true, 'must not return the disabled body when automation is enabled')
      } catch (e) {
        assert.match(String(e instanceof Error ? e.message : e), /Supabase admin credentials are not configured/)
      }
    })
  })
}
