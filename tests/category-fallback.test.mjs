import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deterministicCategoryIntro, isFallbackFillAllowed, isCodeLikeCategoryName, isValidHumanCategoryName } from '../lib/catalog/category-fallback.ts'

test('isCodeLikeCategoryName flags numeric / code-like / empty names', () => {
  for (const bad of ['', '   ', '123', '456789', 'cat-123', 'CAT_42', 'c99', 'id-7', '---', '№№']) {
    assert.equal(isCodeLikeCategoryName(bad), true, `expected code-like: ${JSON.stringify(bad)}`)
  }
})

test('isValidHumanCategoryName accepts real names (uk/ru/en, with digits)', () => {
  for (const good of ['Мотокоси', 'Запчастини на скутер', 'Акумулятори 12В', 'Металопрофіль', 'Bosch фільтри', 'Цветы']) {
    assert.equal(isValidHumanCategoryName(good), true, `expected valid: ${JSON.stringify(good)}`)
  }
})

test('empty / numeric names produce no intro', () => {
  assert.equal(deterministicCategoryIntro(''), '')
  assert.equal(deterministicCategoryIntro(null), '')
  assert.equal(deterministicCategoryIntro('12345'), '')
})

test('intro contains the real category name and varies by name', () => {
  const a = deterministicCategoryIntro('Запчастини на скутер')
  const b = deterministicCategoryIntro('Мотокоси')
  assert.match(a, /Запчастини на скутер/)
  assert.match(b, /Мотокоси/)
  assert.notEqual(a, b)
})

test('intro is deterministic (same input → same output) and short', () => {
  const x = deterministicCategoryIntro('Акумулятори')
  assert.equal(x, deterministicCategoryIntro('Акумулятори'))
  assert.ok(x.length < 160)
})

test('ALL-CAPS supplier name is normalised', () => {
  assert.match(deterministicCategoryIntro('АКУМУЛЯТОРИ'), /Акумулятори/)
})

// ── Fallback fill is gated behind legacy migration completion ─────────────────

test('isFallbackFillAllowed is false by default (legacy content has priority)', () => {
  assert.equal(isFallbackFillAllowed({}), false)
  assert.equal(isFallbackFillAllowed({ LEGACY_MIGRATION_COMPLETE: 'false' }), false)
  assert.equal(isFallbackFillAllowed({ LEGACY_MIGRATION_COMPLETE: undefined }), false)
})

test('isFallbackFillAllowed requires the exact string "true"', () => {
  assert.equal(isFallbackFillAllowed({ LEGACY_MIGRATION_COMPLETE: '1' }), false)
  assert.equal(isFallbackFillAllowed({ LEGACY_MIGRATION_COMPLETE: 'TRUE' }), false)
  assert.equal(isFallbackFillAllowed({ LEGACY_MIGRATION_COMPLETE: 'true' }), true)
})
