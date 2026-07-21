import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageDict, tr, RAW_DICT } from '../lib/i18n/pages.ts'

test('pageDict resolves nested Tr trees to plain strings per locale', () => {
  const uk = pageDict('uk')
  const ru = pageDict('ru')
  const en = pageDict('en')
  assert.equal(typeof uk.about.title, 'string')
  assert.equal(typeof uk.delivery.sections[0].heading, 'string')
  assert.equal(typeof uk.about.apiaryFacts[0].label, 'string')
})

test('PAGE BODIES (not just header) change across uk/ru/en', () => {
  const uk = pageDict('uk'), ru = pageDict('ru'), en = pageDict('en')
  // Static page bodies — the exact failure this fixes.
  const probes = [
    (d) => d.notFound.body,
    (d) => d.delivery.sections[1].body,       // packaging paragraph
    (d) => d.privacy.sections[0].body,        // general provisions
    (d) => d.about.story[0],                  // story paragraph
    (d) => d.about.approach[2],
    (d) => d.contact.responseBody,
    (d) => d.faq.intro,
  ]
  for (const p of probes) {
    assert.notEqual(p(uk), p(ru), `uk vs ru body must differ: ${p(uk).slice(0, 30)}`)
    assert.notEqual(p(uk), p(en), `uk vs en body must differ: ${p(uk).slice(0, 30)}`)
    assert.notEqual(p(ru), p(en), `ru vs en body must differ`)
    for (const v of [p(uk), p(ru), p(en)]) assert.ok(v && v.length > 10, 'body non-trivial')
  }
})

test('shared chrome (footer/shop) is translated', () => {
  assert.equal(pageDict('uk').footer.navigation, 'Навігація')
  assert.equal(pageDict('ru').footer.navigation, 'Навигация')
  assert.equal(pageDict('en').footer.navigation, 'Navigation')
  assert.equal(pageDict('en').shop.addToCart, 'Add to cart')
  assert.equal(pageDict('ru').shop.outOfStock, 'Нет в наличии')
})

test('tr() falls back to Ukrainian when a locale value is missing', () => {
  assert.equal(tr({ uk: 'Привіт' }, 'ru'), 'Привіт') // ru absent → uk
  assert.equal(tr({ uk: 'Привіт', en: 'Hi' }, 'en'), 'Hi')
  assert.equal(tr(undefined, 'uk'), '')
})

test('every Tr leaf has ru and en (no accidental Ukrainian-only strings)', () => {
  const missing = []
  const walk = (node, path) => {
    if (node && typeof node === 'object' && 'uk' in node && typeof node.uk === 'string') {
      if (!node.ru) missing.push(`${path}.ru`)
      if (!node.en) missing.push(`${path}.en`)
      return
    }
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`))
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`)
  }
  walk(RAW_DICT, 'dict')
  assert.deepEqual(missing, [], `Untranslated leaves: ${missing.join(', ')}`)
})
