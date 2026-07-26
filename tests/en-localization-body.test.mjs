import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageDict } from '../lib/i18n/pages.ts'
import { homeDict } from '../lib/i18n/sections/home.ts'
import { shopUiDict } from '../lib/i18n/sections/shop-ui.ts'
import { PUBLIC_LOCALES, switchLocaleHref } from '../lib/i18n.ts'

const CYRILLIC = /[а-яіїєґёА-ЯІЇЄҐЁ]/

// A representative-body-text check across UK/RU/EN — proves the three render
// DIFFERENT real copy, and that English body text is actually English (no
// Cyrillic), not a Ukrainian fallback.
function assertTrilingual(label, uk, ru, en) {
  assert.ok(uk && ru && en, `${label}: all three locales present`)
  assert.notEqual(uk, ru, `${label}: uk vs ru differ`)
  assert.notEqual(uk, en, `${label}: uk vs en differ`)
  assert.notEqual(ru, en, `${label}: ru vs en differ`)
  assert.ok(!CYRILLIC.test(en), `${label}: EN text must contain no Cyrillic — got "${en}"`)
}

// ── EN copy remains ready in code, but is not public until data is complete ───

test('English is hidden from the public language set', () => {
  assert.ok(!PUBLIC_LOCALES.includes('en'), 'en must stay hidden until catalog data is translated')
  assert.ok(PUBLIC_LOCALES.includes('uk') && PUBLIC_LOCALES.includes('ru'))
})

// ── Static page bodies differ across all three locales ────────────────────────

test('static page bodies (about/delivery/footer/notFound) are trilingual', () => {
  const uk = pageDict('uk'), ru = pageDict('ru'), en = pageDict('en')
  assertTrilingual('about.title', uk.about.title, ru.about.title, en.about.title)
  assertTrilingual('about.intro', uk.about.intro, ru.about.intro, en.about.intro)
  assertTrilingual('delivery.intro', uk.delivery.intro, ru.delivery.intro, en.delivery.intro)
  assertTrilingual('footer.tagline', uk.footer.tagline, ru.footer.tagline, en.footer.tagline)
  assertTrilingual('notFound.body', uk.notFound.body, ru.notFound.body, en.notFound.body)
  assertTrilingual('privacy[0].body', uk.privacy.sections[0].body, ru.privacy.sections[0].body, en.privacy.sections[0].body)
})

// ── Home hero + sections differ across all three ──────────────────────────────

test('home hero + order copy is trilingual', () => {
  const uk = homeDict('uk'), ru = homeDict('ru'), en = homeDict('en')
  assertTrilingual('home.heroTitle', uk.heroTitle, ru.heroTitle, en.heroTitle)
  assertTrilingual('home.heroSubtext', uk.heroSubtext, ru.heroSubtext, en.heroSubtext)
  assertTrilingual('home.orderTitle', uk.orderTitle, ru.orderTitle, en.orderTitle)
})

// ── Checkout success + validation differ across all three ─────────────────────

test('checkout success + validation copy is trilingual', () => {
  const uk = shopUiDict('uk'), ru = shopUiDict('ru'), en = shopUiDict('en')
  assertTrilingual('checkout.successTitle', uk.successTitle, ru.successTitle, en.successTitle)
  assertTrilingual('checkout.successBody', uk.successBody, ru.successBody, en.successBody)
  assertTrilingual('checkout.phoneError', uk.phoneError, ru.phoneError, en.phoneError)
  assertTrilingual('checkout.cartEmpty', uk.cartEmpty, ru.cartEmpty, en.cartEmpty)
})

// ── Locale switch preserves the path + query, prefixes /en ────────────────────

test('switchLocaleHref preserves path + query for every locale', () => {
  assert.equal(switchLocaleHref('en', '/catalog/all', 'sort=price'), '/en/catalog/all?sort=price')
  assert.equal(switchLocaleHref('ru', '/catalog/all', 'sort=price'), '/ru/catalog/all?sort=price')
  assert.equal(switchLocaleHref('uk', '/en/catalog/all', 'sort=price'), '/catalog/all?sort=price')
  // switching FROM /ru TO /en keeps the canonical path + query
  assert.equal(switchLocaleHref('en', '/ru/honey', ''), '/en/honey')
  // admin/api are never localized
  assert.equal(switchLocaleHref('en', '/admin/orders', ''), '/admin/orders')
})
