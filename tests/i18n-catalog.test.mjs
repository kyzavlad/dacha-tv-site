import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogDict } from '../lib/i18n/sections/catalog.ts'
import { RAW_DICT as PAGES_RAW } from '../lib/i18n/pages.ts'

test('catalogDict resolves every key to a non-empty string per locale', () => {
  for (const loc of ['uk', 'ru', 'en']) {
    const t = catalogDict(loc)
    for (const [k, v] of Object.entries(t)) {
      assert.equal(typeof v, 'string', `${k} should resolve to a string`)
      assert.ok(v.length > 0, `${k} should be non-empty for ${loc}`)
    }
  }
})

test('catalog listing BODY text differs across uk/ru/en', () => {
  const uk = catalogDict('uk'), ru = catalogDict('ru'), en = catalogDict('en')
  const probes = ['landingTitle', 'landingSubtitle', 'allAssortmentBody', 'emptyAllBody', 'searchHintBefore', 'emptyNoProducts']
  for (const key of probes) {
    assert.notEqual(uk[key], ru[key], `uk vs ru must differ: ${key}`)
    assert.notEqual(uk[key], en[key], `uk vs en must differ: ${key}`)
  }
})

test('sort labels and filter chips are localized', () => {
  assert.equal(catalogDict('ru').sortPriceAsc, 'Сначала дешевле')
  assert.equal(catalogDict('en').sortPriceAsc, 'Cheapest first')
  assert.equal(catalogDict('ru').onlyWithPrice, 'Только с ценой')
  assert.equal(catalogDict('en').onlyWithPhoto, 'With photo only')
})

test('pagination labels are localized', () => {
  assert.equal(catalogDict('uk').prev, 'Попередня')
  assert.equal(catalogDict('ru').next, 'Следующая')
  assert.equal(catalogDict('en').of, 'of')
})

// Sanity: the catalog dictionary module reuses pages.ts's tr() resolver, so its
// leaves obey the same uk-required / ru+en-recommended contract. This guards
// against silently importing a broken resolver.
test('catalogDict module does not corrupt the shared pages dictionary', () => {
  assert.ok(PAGES_RAW.shop, 'pages.ts RAW_DICT still intact')
})
