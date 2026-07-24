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

// ── EN dictionaries are preserved in code but never publicly exposed ──────────

test('EN stays a supported Locale in code (dictionaries preserved for a future phase)', () => {
  assert.ok(LOCALES.includes('en'), 'en must remain in LOCALES')
  assert.ok(!PUBLIC_LOCALES.includes('en'), 'en must NOT be public')
})

test('tr() falls back to Ukrainian for a value that has no ru (never blank)', () => {
  // A Tr with only uk resolves to uk for every locale — so a half-translated
  // string is never blank; it shows Ukrainian until ru is filled in.
  assert.equal(tr({ uk: 'Тест' }, 'ru'), 'Тест')
  assert.equal(tr({ uk: 'Тест', ru: 'Тест-ру' }, 'ru'), 'Тест-ру')
  assert.equal(tr({ uk: 'Тест', ru: 'Тест-ру' }, 'uk'), 'Тест')
})

// ── Sitemap excludes EN (and only emits canonical UA paths) ───────────────────

test('sitemap source never constructs /en URLs', () => {
  const src = readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8')
  // No literal /en path and no en-locale prefixing in the sitemap generator.
  assert.doesNotMatch(src, /['"`]\/en(\/|['"`])/, 'sitemap must not emit /en URLs')
  assert.doesNotMatch(src, /localizedPath\(\s*['"]en['"]/, 'sitemap must not localize to en')
})
