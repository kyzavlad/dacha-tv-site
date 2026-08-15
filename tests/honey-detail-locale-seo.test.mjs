import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/honey/[slug]/page.tsx', import.meta.url), 'utf8')

test('honey detail metadata has locale-native fallback copy and localized social metadata', () => {
  assert.match(src, /function honeyFallbackDescription\(locale:/)
  assert.match(src, /Натуральный мёд/)
  assert.match(src, /Natural honey/)
  assert.match(src, /seoTitle = resolveManualField\(null, tr, 'seo_title', locale\) \|\| name/)
  assert.match(src, /url: canonical/)
  assert.match(src, /alt: imageAlt/)
})

test('RU and EN detail copy do not intentionally fall back to Ukrainian descriptions', () => {
  assert.match(src, /const shortDesc = locale === 'uk'[\s\S]*resolveManualField\(null, tr, 'short_description', locale\)/)
  assert.match(src, /const fullDesc = locale === 'uk'[\s\S]*resolveManualField\(null, tr, 'description', locale\)/)
})

test('Product schema uses localized values and correct availability semantics', () => {
  assert.match(src, /const schemaDescription = shortDesc \|\| details\?\.taste \|\| honeyFallbackDescription\(locale, name\)/)
  assert.match(src, /name,\s*description: schemaDescription/)
  assert.match(src, /https:\/\/schema\.org\/PreOrder/)
  assert.match(src, /schemaOffer = unitPrice != null && unitPrice > 0/)
  assert.doesNotMatch(src, /name: product\.name/)
})

test('related honey cards receive the active locale explicitly', () => {
  assert.match(src, /<HoneyCard key=\{p\.id\} product=\{p\} locale=\{locale\} \/>/)
})
