import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Merchant-facing support identity is canonical and reachable', () => {
  const defaults = read('lib/launch-defaults.ts')
  const seller = read('components/shared/SellerInfo.tsx')
  const contact = read('app/contact/page.tsx')
  const footer = read('components/layout/Footer.tsx')
  const home = read('app/page.tsx')

  assert.match(defaults, /LAUNCH_SUPPORT_EMAIL = 'ai@vladkuzmenko\.com'/)
  assert.match(defaults, /LAUNCH_LEGAL_ADDRESS = '61032, м\. Харків, просп\. Героїв Харкова, буд\. 300, кв\. 156, Україна'/)

  assert.match(seller, /mailto:\$\{LAUNCH_SUPPORT_EMAIL\}/)
  assert.match(seller, /61032, м\. Харків, просп\. Героїв Харкова, буд\. 300, кв\. 156, Україна/)

  assert.match(contact, /const address = LAUNCH_LEGAL_ADDRESS/)
  assert.match(contact, /email: LAUNCH_SUPPORT_EMAIL/)
  assert.match(contact, /streetAddress: 'просп\. Героїв Харкова, 300, кв\. 156'/)

  assert.match(footer, /const address = LAUNCH_LEGAL_ADDRESS/)
  assert.match(footer, /mailto:\$\{LAUNCH_SUPPORT_EMAIL\}/)

  assert.match(home, /email: LAUNCH_SUPPORT_EMAIL/)
  assert.match(home, /postalCode: '61032'/)
  assert.match(home, /addressLocality: 'Харків'/)
})
