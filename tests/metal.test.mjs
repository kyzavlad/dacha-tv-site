import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMetalProduct, buildMetalAttributes, metalAttrDefaults, METAL_CATEGORY_SLUG, METAL_ATTR_FIELDS } from '../lib/catalog/metal.ts'

test('isMetalProduct detects by lead_type OR metal category slug', () => {
  assert.equal(isMetalProduct({ lead_type: 'metal', category_slug: 'x' }), true)
  assert.equal(isMetalProduct({ lead_type: null, category_slug: METAL_CATEGORY_SLUG }), true)
  assert.equal(isMetalProduct({ lead_type: 'natural_products', category_slug: 'honey' }), false)
  assert.equal(isMetalProduct({ lead_type: null, category_slug: null }), false)
  assert.equal(isMetalProduct(null), false)
})

test('buildMetalAttributes overlays structured fields on an advanced base', () => {
  const base = { 'Гарантія': '10 років' }
  const structured = { metal_profile: 'Монтеррей', metal_thickness: '0.45 мм', metal_color: '', metal_coating: 'поліестер' }
  const out = buildMetalAttributes(base, structured)
  assert.equal(out['Гарантія'], '10 років') // advanced preserved
  assert.equal(out['Профіль'], 'Монтеррей')
  assert.equal(out['Товщина'], '0.45 мм')
  assert.equal(out['Покриття'], 'поліестер')
  assert.equal('Колір' in out, false) // empty structured value removes the key
})

test('buildMetalAttributes clears a previously-set key when emptied', () => {
  const out = buildMetalAttributes({ 'Профіль': 'старий' }, { metal_profile: '' })
  assert.equal('Профіль' in out, false)
})

test('metalAttrDefaults reads structured values back for the editor', () => {
  const defaults = metalAttrDefaults({ 'Профіль': 'Монтеррей', 'Виробник': 'Arcelor' })
  assert.equal(defaults.metal_profile, 'Монтеррей')
  assert.equal(defaults.metal_manufacturer, 'Arcelor')
  assert.equal(defaults.metal_color, '') // absent → empty string
})

test('every metal attr field round-trips through build + defaults', () => {
  const structured = {}
  for (const f of METAL_ATTR_FIELDS) structured[f.field] = `v-${f.field}`
  const attrs = buildMetalAttributes({}, structured)
  const back = metalAttrDefaults(attrs)
  for (const f of METAL_ATTR_FIELDS) assert.equal(back[f.field], `v-${f.field}`)
})
