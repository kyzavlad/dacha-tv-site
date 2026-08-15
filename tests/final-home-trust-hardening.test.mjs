import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const availableNowSrc = readFileSync(new URL('../components/home/AvailableNow.tsx', import.meta.url), 'utf8')
const deliveryTeaserSrc = readFileSync(new URL('../components/home/DeliveryTeaser.tsx', import.meta.url), 'utf8')

test('AvailableNow is backed by storefront production queries, not manual prices', () => {
  for (const fn of [
    'getAllHoneyProducts',
    'getAllApiaryProducts',
    'getAllBeekeeperProducts',
    'getAllFlowerProducts',
  ]) {
    assert.ok(availableNowSrc.includes(fn), `${fn} must feed AvailableNow`)
  }

  assert.ok(availableNowSrc.includes('honeyUnitPriceUah'), 'honey price must use the storefront pricing helper')
  assert.ok(availableNowSrc.includes("if (items.length === 0) return null"), 'stale fallback cards must not render when data is unavailable')
  assert.ok(!availableNowSrc.includes("note: t.availHoneyNote"), 'old hardcoded honey note must not be rendered')
  assert.ok(!availableNowSrc.includes("note: t.availChocolateNote"), 'old hardcoded chocolate note must not be rendered')
  assert.ok(!availableNowSrc.includes("note: t.availOilNote"), 'old hardcoded oil note must not be rendered')
})

test('homepage catalog delivery copy exposes both verified checkout payment methods', () => {
  assert.match(deliveryTeaserSrc, /Оплата при отриманні або передоплата до відправки після підтвердження менеджером/)
  assert.match(deliveryTeaserSrc, /Оплата при получении или предоплата до отправки после подтверждения менеджером/)
  assert.ok(!deliveryTeaserSrc.includes('Оплата накладеним платежем при отриманні.'))
  assert.ok(!deliveryTeaserSrc.includes('Оплата наложенным платежом при получении.'))
})
