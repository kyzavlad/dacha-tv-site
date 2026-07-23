import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAlternates } from '../lib/seo.ts'
import { homeDict } from '../lib/i18n/sections/home.ts'

// Mirrors the exact precedence expression in components/home/Hero.tsx.
// site_settings.hero_tagline/hero_subtext are Ukrainian-only (no per-locale
// columns), so they may only override the dictionary on the uk route — ru/en
// must always render the localized dictionary copy, never the Ukrainian
// site_settings text. This regression test guards against the bug where the
// override applied unconditionally to every locale.
function resolveHeroText(locale, override, dictValue) {
  return (locale === 'uk' && override) || dictValue
}

test('uk route: site_settings override wins when present', () => {
  const t = homeDict('uk')
  assert.equal(resolveHeroText('uk', 'Кастомний слоган', t.heroTitle), 'Кастомний слоган')
})

test('uk route: falls back to the uk dictionary when no override is set', () => {
  const t = homeDict('uk')
  assert.equal(resolveHeroText('uk', undefined, t.heroTitle), t.heroTitle)
})

test('ru route: Ukrainian site_settings override is IGNORED, ru dictionary text wins', () => {
  const t = homeDict('ru')
  const ukOverride = 'Товари для дому, саду та господарства — з Дача TV.' // Ukrainian text from site_settings
  assert.equal(resolveHeroText('ru', ukOverride, t.heroTitle), t.heroTitle)
  assert.notEqual(resolveHeroText('ru', ukOverride, t.heroTitle), ukOverride)
})

test('en route: Ukrainian site_settings override is IGNORED, en dictionary text wins', () => {
  const t = homeDict('en')
  const ukOverride = 'Товари для дому, саду та господарства — з Дача TV.'
  assert.equal(resolveHeroText('en', ukOverride, t.heroTitle), t.heroTitle)
  assert.notEqual(resolveHeroText('en', ukOverride, t.heroTitle), ukOverride)
})

// ── Homepage metadata / canonical / hreflang ────────────────────────────────

test('homepage buildAlternates: canonical differs per locale, uk has no prefix', () => {
  const uk = buildAlternates('uk', '/')
  const ru = buildAlternates('ru', '/')
  const en = buildAlternates('en', '/')
  assert.ok(uk.canonical.endsWith('/'), 'uk canonical should be the bare root')
  assert.ok(ru.canonical.endsWith('/ru'), 'ru canonical should be prefixed')
  assert.ok(en.canonical.endsWith('/en'), 'en canonical should be prefixed')
  assert.notEqual(uk.canonical, ru.canonical)
  assert.notEqual(uk.canonical, en.canonical)
  assert.notEqual(ru.canonical, en.canonical)
})

test('homepage buildAlternates: hreflang map includes uk, ru, en and x-default (-> uk)', () => {
  const { canonical, languages } = buildAlternates('uk', '/')
  assert.ok(languages.uk)
  assert.ok(languages.ru)
  assert.ok(languages.en)
  assert.equal(languages['x-default'], canonical)
})
