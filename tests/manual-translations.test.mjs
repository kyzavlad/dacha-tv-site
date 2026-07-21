import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveManualField } from '../lib/i18n/manual-translations.ts'

const ruRow = { entity_type: 'honey_product', entity_id: 'x', locale: 'ru', name: 'Мёд акациевый', description: 'Описание' }

test('uk locale always returns the Ukrainian base', () => {
  assert.equal(resolveManualField('Мед акацієвий', ruRow, 'name', 'uk'), 'Мед акацієвий')
})

test('ru locale returns the translation when present', () => {
  assert.equal(resolveManualField('Мед акацієвий', ruRow, 'name', 'ru'), 'Мёд акациевый')
})

test('falls back to Ukrainian base when the translation row is missing', () => {
  assert.equal(resolveManualField('Мед акацієвий', null, 'name', 'ru'), 'Мед акацієвий')
  assert.equal(resolveManualField('Мед акацієвий', undefined, 'name', 'en'), 'Мед акацієвий')
})

test('falls back to base when the specific field is empty in the translation', () => {
  assert.equal(resolveManualField('Короткий опис', ruRow, 'short_description', 'ru'), 'Короткий опис')
})

test('never returns empty when the base has content', () => {
  assert.equal(resolveManualField('База', { name: '   ' }, 'name', 'en'), 'База')
})
