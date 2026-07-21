import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VARIETY_DETAILS } from '../lib/honey/variety-details.ts'

const VARIETIES = ['Акація', 'Липа', 'Сонях', "Різнотрав'я", 'Сади', 'Ліс']
const FIELDS = ['season', 'taste', 'crystallisation', 'storage', 'uses']

test('every honey variety has uk/ru/en entries with all fields non-empty', () => {
  for (const variety of VARIETIES) {
    const entry = VARIETY_DETAILS[variety]
    assert.ok(entry, `missing VARIETY_DETAILS entry for ${variety}`)
    for (const loc of ['uk', 'ru', 'en']) {
      const byLocale = entry[loc]
      assert.ok(byLocale, `missing ${loc} entry for ${variety}`)
      for (const field of FIELDS) {
        assert.equal(typeof byLocale[field], 'string', `${variety}.${loc}.${field} should be a string`)
        assert.ok(byLocale[field].length > 0, `${variety}.${loc}.${field} should be non-empty`)
      }
    }
  }
})

test('season/taste/crystallisation/storage/uses content differs across uk/ru/en for every variety', () => {
  for (const variety of VARIETIES) {
    const { uk, ru, en } = VARIETY_DETAILS[variety]
    for (const field of FIELDS) {
      assert.notEqual(uk[field], ru[field], `${variety}.${field}: uk vs ru must differ`)
      assert.notEqual(uk[field], en[field], `${variety}.${field}: uk vs en must differ`)
      assert.notEqual(ru[field], en[field], `${variety}.${field}: ru vs en must differ`)
    }
  }
})

test('spot check known translated values for a specific variety (Акація/Acacia)', () => {
  const { uk, ru, en } = VARIETY_DETAILS['Акація']
  assert.equal(uk.season, 'Кінець травня – початок червня')
  assert.equal(ru.season, 'Конец мая – начало июня')
  assert.equal(en.season, 'Late May – early June')
  assert.match(en.taste, /floral/i)
  assert.match(ru.taste, /цветочный/i)
})

test('all six DB-facing variety keys are present (matches product.variety values)', () => {
  assert.deepEqual(Object.keys(VARIETY_DETAILS).sort(), [...VARIETIES].sort())
})
