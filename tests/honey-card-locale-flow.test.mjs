import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const cardSrc = readFileSync(new URL('../components/honey/HoneyCard.tsx', import.meta.url), 'utf8')
const widgetSrc = readFileSync(new URL('../components/cart/HoneyCartWidget.tsx', import.meta.url), 'utf8')

test('HoneyCard derives locale from the request when callers do not pass it', () => {
  assert.match(cardSrc, /await getRequestLocale\(\)/)
  assert.match(cardSrc, /localizedPath\(loc, `\/honey\/\$\{product\.slug\}`\)/)
  assert.doesNotMatch(cardSrc, /DEFAULT_LOCALE/)
})

test('HoneyCard resolves RU/EN product copy from manual_content_translations', () => {
  assert.match(cardSrc, /getManualTranslations\('honey_product', \[product\.id\], loc\)/)
  assert.match(cardSrc, /resolveManualField\(product\.name, translation, 'name', loc\)/)
  assert.match(cardSrc, /resolveManualField\(product\.short_description \?\? null, translation, 'short_description', loc\)/)
  assert.match(cardSrc, /name,\s*price,/)
  assert.doesNotMatch(cardSrc, /name: product\.name/)
})

test('HoneyCard static labels and cart variant are locale-aware', () => {
  assert.match(cardSrc, /featuredLabel = tr\(/)
  assert.match(cardSrc, /unavailableLabel = tr\(/)
  assert.match(cardSrc, /detailsLabel = tr\(/)
  assert.match(cardSrc, /variant: unitLabel/)
  assert.match(cardSrc, /en: 'Popular'/)
  assert.match(cardSrc, /en: 'Details'/)
})

test('HoneyCartWidget keeps the active locale for price enquiries and cart units', () => {
  assert.match(widgetSrc, /localizedPath\(locale, '\/contact'\)/)
  assert.match(widgetSrc, /variant: unitLabel/)
  assert.match(widgetSrc, /en: 'Ask for price'/)
  assert.doesNotMatch(widgetSrc, /href="\/contact"/)
})
