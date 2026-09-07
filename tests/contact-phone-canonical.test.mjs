import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAUNCH_PHONE, LAUNCH_PHONE_SECONDARY } from '../lib/launch-defaults.ts'

test('canonical storefront phone order matches current commercial decision', () => {
  assert.equal(LAUNCH_PHONE, '+380951444853')
  assert.equal(LAUNCH_PHONE_SECONDARY, '+380967657772')
})

test('global chrome overrides stale site_settings phone values', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  assert.match(layout, /phone: LAUNCH_PHONE/)
  assert.match(layout, /phone_secondary: LAUNCH_PHONE_SECONDARY/)
})

test('contact page uses canonical phone constants in content and structured data', () => {
  const contact = readFileSync(new URL('../app/contact/page.tsx', import.meta.url), 'utf8')
  assert.match(contact, /const phone = LAUNCH_PHONE/)
  assert.match(contact, /const phoneSecondary = LAUNCH_PHONE_SECONDARY/)
  assert.match(contact, /telephone: phone/)
})
