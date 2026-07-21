import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homeDict, RAW_HOME } from '../lib/i18n/sections/home.ts'

test('homeDict resolves every key to a non-empty string per locale', () => {
  for (const loc of ['uk', 'ru', 'en']) {
    const t = homeDict(loc)
    for (const [k, v] of Object.entries(t)) {
      assert.equal(typeof v, 'string', `${k} should resolve to a string`)
      assert.ok(v.length > 0, `${k} should be non-empty for ${loc}`)
    }
  }
})

test('home BODY text differs across uk/ru/en (hero, story, how-to-order, reviews)', () => {
  const uk = homeDict('uk'), ru = homeDict('ru'), en = homeDict('en')
  const probes = ['heroTitle', 'storyTitle', 'orderStep1Desc', 'reviewsIntro', 'ecoIntro', 'ytIntro']
  for (const key of probes) {
    assert.notEqual(uk[key], ru[key], `uk vs ru must differ: ${key}`)
    assert.notEqual(uk[key], en[key], `uk vs en must differ: ${key}`)
    assert.notEqual(ru[key], en[key], `ru vs en must differ: ${key}`)
  }
})

test('every RAW_HOME leaf has ru and en (no accidental Ukrainian-only strings)', () => {
  const missing = []
  for (const [k, v] of Object.entries(RAW_HOME)) {
    if (!v.ru) missing.push(`${k}.ru`)
    if (!v.en) missing.push(`${k}.en`)
  }
  assert.deepEqual(missing, [], `Untranslated home leaves: ${missing.join(', ')}`)
})

test('reviews aria-label templates carry the {n} placeholder', () => {
  assert.match(homeDict('uk').reviewsRatingAria, /\{n\}/)
  assert.match(homeDict('en').reviewsDotAria, /\{n\}/)
})
