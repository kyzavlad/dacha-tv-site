import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestProductName, displayProductName } from '../lib/supabase/catalog.ts'

// Real supplier fields: name_ua = Ukrainian base, name = Russian supplier name.
// UK prefers name_ua; RU and EN prefer the Russian name, then fall back to UK.
// (EN has no dedicated product-name column yet — intentional per the launch spec.)

test('UK uses the Ukrainian base name', () => {
  const p = { name_ua: 'Ланцюг пиляльний INTERTOOL', name: 'Цепь пильная INTERTOOL', supplier_sku: 'DT-0530' }
  assert.equal(bestProductName(p, 'uk'), 'Ланцюг пиляльний INTERTOOL')
})

test('RU uses the Russian supplier name', () => {
  const p = { name_ua: 'Ланцюг пиляльний INTERTOOL', name: 'Цепь пильная INTERTOOL', supplier_sku: 'DT-0530' }
  assert.equal(bestProductName(p, 'ru'), 'Цепь пильная INTERTOOL')
})

test('EN falls back to the Russian name, then Ukrainian (EN→RU→UK)', () => {
  // With a Russian name present, EN shows RU (never blank, never a raw code).
  assert.equal(bestProductName({ name_ua: 'Ланцюг', name: 'Цепь', supplier_sku: 'S1' }, 'en'), 'Цепь')
  // With NO Russian name, EN falls through to the Ukrainian base.
  assert.equal(bestProductName({ name_ua: 'Ланцюг пиляльний', name: null, supplier_sku: 'S2' }, 'en'), 'Ланцюг пиляльний')
})

test('a code-only / garbage name is rejected in every locale (never shown)', () => {
  const codey = { name_ua: 'DT-0530', name: 'DT-0530', supplier_sku: 'DT-0530' }
  assert.equal(bestProductName(codey, 'uk'), null)
  assert.equal(bestProductName(codey, 'ru'), null)
  assert.equal(bestProductName(codey, 'en'), null)
})

test('displayProductName never returns blank (falls back to a SKU label)', () => {
  const p = { name_ua: '', name: '', supplier_sku: 'AT-0132' }
  assert.match(displayProductName(p, 'en'), /AT-0132/)
})
