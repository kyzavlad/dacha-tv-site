import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shopUiDict } from '../lib/i18n/sections/shop-ui.ts'
import { homeDict } from '../lib/i18n/sections/home.ts'
import { pageDict, tr } from '../lib/i18n/pages.ts'
import { LOCALES, PUBLIC_LOCALES } from '../lib/i18n.ts'

// ── UA and RU render DIFFERENT localized body content (not just the header) ───

test('home hero + body copy differs between uk and ru (whole-page localization)', () => {
  const uk = homeDict('uk')
  const ru = homeDict('ru')
  for (const key of ['heroTitle', 'heroSubtext', 'orderTitle', 'orderSubtitle']) {
    assert.ok(uk[key] && ru[key], `home.${key} present for both`)
    assert.notEqual(uk[key], ru[key], `home.${key} must differ uk vs ru`)
  }
})

test('static page bodies (about/contact/delivery) differ between uk and ru', () => {
  const uk = pageDict('uk')
  const ru = pageDict('ru')
  assert.notEqual(uk.about.title, ru.about.title)
  // delivery.title is legitimately identical ("Доставка") in uk/ru — assert on
  // the intro prose, which genuinely differs.
  assert.notEqual(uk.delivery.intro, ru.delivery.intro)
  assert.notEqual(uk.delivery.eyebrow, ru.delivery.eyebrow)
  assert.notEqual(uk.notFound.title, ru.notFound.title)
})

// ── Checkout success + validation messages are localized ──────────────────────

test('checkout SUCCESS state is localized (title/body/home button differ uk vs ru)', () => {
  const uk = shopUiDict('uk')
  const ru = shopUiDict('ru')
  for (const key of ['successTitle', 'successBody', 'successHome']) {
    assert.ok(uk[key] && ru[key], `${key} present for both`)
    assert.notEqual(uk[key], ru[key], `checkout ${key} must be localized`)
  }
  // Sanity: the RU success title is actually Russian, not left in Ukrainian.
  assert.match(ru.successTitle, /Спасибо/)
})

test('checkout VALIDATION messages are localized (phone / warehouse / cyrillic)', () => {
  const uk = shopUiDict('uk')
  const ru = shopUiDict('ru')
  for (const key of ['phoneError', 'warehouseError', 'cyrillicHint', 'phoneHint']) {
    assert.ok(uk[key] && ru[key], `${key} present for both`)
    assert.notEqual(uk[key], ru[key], `validation ${key} must be localized`)
  }
})

test('empty-cart + core actions are localized', () => {
  const uk = shopUiDict('uk')
  const ru = shopUiDict('ru')
  for (const key of ['cartEmpty', 'backToShopping', 'checkout', 'outOfStock', 'priceOnRequest']) {
    assert.notEqual(uk[key], ru[key], `${key} must be localized`)
  }
})

// ── EN remains supported in code, but is not publicly advertised ─────────────

test('EN is supported internally but excluded from PUBLIC_LOCALES', () => {
  assert.ok(LOCALES.includes('en'), 'en must remain in LOCALES')
  assert.ok(!PUBLIC_LOCALES.includes('en'), 'en must not be public before complete translations exist')
})

test('tr() falls back to Ukrainian for a value that has no ru (never blank)', () => {
  // A Tr with only uk resolves to uk for every locale — so a half-translated
  // string is never blank; it shows Ukrainian until ru is filled in.
  assert.equal(tr({ uk: 'Тест' }, 'ru'), 'Тест')
  assert.equal(tr({ uk: 'Тест', ru: 'Тест-ру' }, 'ru'), 'Тест-ру')
  assert.equal(tr({ uk: 'Тест', ru: 'Тест-ру' }, 'uk'), 'Тест')
})

// ── Sitemap emits per-locale alternates for all enabled locales ───────────────

test('sitemap source builds per-locale alternates over PUBLIC_LOCALES', () => {
  const src = readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8')
  // The sitemap now emits alternates.languages for every URL, prefixing each
  // enabled locale via localizedPath (so uk/ru/en are all represented).
  assert.match(src, /alternates/, 'sitemap must emit alternates')
  assert.match(src, /PUBLIC_LOCALES/, 'sitemap iterates the enabled public locales')
  assert.match(src, /localizedPath\(loc,/, 'sitemap localizes each URL per locale')
})
