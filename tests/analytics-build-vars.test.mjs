import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Static validation of .github/workflows/build-standalone-linux.yml — no YAML
// parser dependency in this repo, so this greps the same way
// scripts/env-inventory.ts does. Proves the analytics NEXT_PUBLIC_* variables
// actually reach `pnpm build` (they are inlined into the client bundle AT
// BUILD TIME by Next.js, so being present only in .env.production on the
// server is not enough — see lib/analytics/gtag.ts).

const WORKFLOW_PATH = new URL('../.github/workflows/build-standalone-linux.yml', import.meta.url)
const workflow = readFileSync(WORKFLOW_PATH, 'utf8')

// Isolate the "Build (Next.js standalone output)" step so assertions can't
// accidentally pass by matching an unrelated step elsewhere in the file.
const buildStepStart = workflow.indexOf('name: Build (Next.js standalone output)')
assert.ok(buildStepStart >= 0, 'the build step must exist')
const nextStepMarker = workflow.indexOf('\n      - name:', buildStepStart)
const buildStep = workflow.slice(buildStepStart, nextStepMarker > 0 ? nextStepMarker : undefined)

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'NEXT_PUBLIC_GOOGLE_ADS_ID',
  'NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL',
]

test('the build step passes every required analytics variable from secrets into the env', () => {
  for (const name of REQUIRED_VARS) {
    assert.match(
      buildStep,
      new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`),
      `${name} must be wired from secrets.${name} into the build step's env`,
    )
  }
})

test('the build step passes NEXT_PUBLIC_ANALYTICS_DEBUG from secrets too', () => {
  assert.match(
    buildStep,
    /NEXT_PUBLIC_ANALYTICS_DEBUG:\s*\$\{\{\s*secrets\.NEXT_PUBLIC_ANALYTICS_DEBUG\s*\}\}/,
  )
})

test('the build fails clearly (test -n + exit 1) when a required analytics var is missing', () => {
  for (const name of REQUIRED_VARS) {
    const guardRe = new RegExp(`test -n "\\$${name}"[\\s\\S]{0,120}exit 1`)
    assert.match(buildStep, guardRe, `${name} must have a fail-fast guard before pnpm build`)
  }
})

test('NEXT_PUBLIC_ANALYTICS_DEBUG defaults to 0 instead of failing the build when unset', () => {
  assert.match(buildStep, /NEXT_PUBLIC_ANALYTICS_DEBUG:-0/)
  // It must NOT have its own fail-fast guard like the required vars do.
  assert.doesNotMatch(buildStep, /test -n "\$NEXT_PUBLIC_ANALYTICS_DEBUG"/)
})

test('pre-existing required vars (Supabase, server actions key) still have their guards', () => {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY']) {
    assert.match(buildStep, new RegExp(`test -n "\\$${name}"`))
  }
})

test('the workflow never contains a literal secret value — only ${{ secrets.NAME }} references', () => {
  // Sanity guard against a future edit that accidentally hardcodes a real id
  // (e.g. copy-pasting a real G-XXXXXXXXXX/AW-XXXXXXXXXX from a PR description
  // instead of referencing the secret). Every `secrets.` reference must be the
  // GitHub Actions expression syntax, never a bare assigned value.
  // Anchored to a YAML "  KEY: value" line specifically — excludes bash
  // parameter-expansion syntax like `${NEXT_PUBLIC_ANALYTICS_DEBUG:-0}`,
  // which is a default-value fallback, not a hardcoded secret.
  const bareAssignments = workflow.match(/^\s*NEXT_PUBLIC_(?:GA_MEASUREMENT_ID|GOOGLE_ADS_ID|GOOGLE_ADS_PURCHASE_LABEL|SITE_URL|ANALYTICS_DEBUG):\s*(?!\$\{\{)\S+/gm)
  assert.equal(bareAssignments, null, `found a non-secrets-expression assignment: ${bareAssignments}`)
})
