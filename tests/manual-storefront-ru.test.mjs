import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const apiaryCard = readFileSync(new URL('../components/products/ProductCard.tsx', import.meta.url), 'utf8')
const beekeeperCard = readFileSync(new URL('../components/beekeeper/BeekeeperCard.tsx', import.meta.url), 'utf8')
const flowerCard = readFileSync(new URL('../components/flowers/FlowerCard.tsx', import.meta.url), 'utf8')
const flowersPage = readFileSync(new URL('../app/flowers/page.tsx', import.meta.url), 'utf8')
const attrs = readFileSync(new URL('../lib/i18n/manual-attributes.ts', import.meta.url), 'utf8')

test('apiary cards resolve request locale and translated product copy', () => {
  assert.match(apiaryCard, /await getRequestLocale\(\)/)
  assert.match(apiaryCard, /getManualTranslations\('apiary_product'/)
  assert.match(apiaryCard, /resolveManualField\(product\.name, translation, 'name', loc\)/)
  assert.match(apiaryCard, /name,\s*price:/)
  assert.match(apiaryCard, /localizeApiaryPackaging\(pack, loc\)/)
  assert.doesNotMatch(apiaryCard, /DEFAULT_LOCALE/)
  assert.doesNotMatch(apiaryCard, /name: product\.name/)
})

test('beekeeper cards localize dynamic copy and seasonal labels', () => {
  assert.match(beekeeperCard, /getManualTranslations\('beekeeper_product'/)
  assert.match(beekeeperCard, /resolveManualField\(product\.name, translation, 'name', locale\)/)
  assert.match(beekeeperCard, /localizeBeekeeperSeasonNote\(product\.season_note, locale\)/)
  assert.match(beekeeperCard, /\{name\}/)
})

test('flower cards localize dynamic copy, attributes and cart name', () => {
  assert.match(flowerCard, /getManualTranslations\('flower_product'/)
  assert.match(flowerCard, /localizeFlowerVariety\(product\.variety, locale\)/)
  assert.match(flowerCard, /localizeFlowerColor\(product\.color, locale\)/)
  assert.match(flowerCard, /localizeFlowerBloomSeason\(product\.bloom_season, locale\)/)
  assert.match(flowerCard, /name,\s*price:/)
  assert.doesNotMatch(flowerCard, /name: product\.name/)
})

test('flower landing localizes variety labels without changing canonical DB keys', () => {
  assert.match(flowersPage, /localizeFlowerVariety\(variety, locale\)/)
  assert.match(flowersPage, /id=\{encodeURIComponent\(variety\)\}/)
  assert.match(attrs, /'Помпонова': 'Помпонная'/)
  assert.match(attrs, /'Вересень–Жовтень': 'Сентябрь–Октябрь'/)
})
