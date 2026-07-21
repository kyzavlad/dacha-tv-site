import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  METAL_CONTENT, METAL_CONTENT_SLUGS, METAL_UNKNOWN_SPECS, METAL_CHARACTERISTIC_FIELDS, metalContentBySlug,
} from '../lib/catalog/metal-content.ts'

const EXPECTED_SLUGS = [
  'profnastyl-hvylia-10', 'profnastyl-hvylia-20', 'profnastyl-hvylia-35',
  'profnastyl-hvylia-8-biudzhetnyi', 'metalocherepytsia-pid-rozmir',
  'standartnyi-lyst-2-0h1-18', 'metalevyi-shtaketnyk',
  'dobirni-elementy-pokrivlia-fasad', 'pokrivelni-samorizy-korotki',
  'pokrivelni-samorizy-dovhi', 'skladski-zalyshky-metalu',
]

test('exactly the 11 canonical metal slugs', () => {
  assert.equal(METAL_CONTENT.length, 11)
  assert.deepEqual([...METAL_CONTENT_SLUGS].sort(), [...EXPECTED_SLUGS].sort())
})

test('every entry has complete non-empty UA/RU/EN content', () => {
  const fields = ['name', 'short_description', 'description', 'seo_description', 'meta_title', 'meta_description', 'seo_keywords']
  for (const e of METAL_CONTENT) {
    for (const loc of ['ua', 'ru', 'en']) {
      for (const f of fields) {
        assert.ok(e[loc][f] && e[loc][f].trim().length > 0, `${e.slug}.${loc}.${f} must be non-empty`)
      }
    }
  }
})

test('RU and EN are actually translated (differ from UA)', () => {
  for (const e of METAL_CONTENT) {
    assert.notEqual(e.ru.name, e.ua.name, `${e.slug} ru.name should differ from ua`)
    assert.notEqual(e.en.name, e.ua.name, `${e.slug} en.name should differ from ua`)
    assert.notEqual(e.ru.meta_title, e.ua.meta_title, `${e.slug} ru.meta_title should differ`)
    assert.notEqual(e.en.meta_title, e.ua.meta_title, `${e.slug} en.meta_title should differ`)
  }
})

test('meta lengths within SEO sanity bounds', () => {
  for (const e of METAL_CONTENT) {
    for (const loc of ['ua', 'ru', 'en']) {
      assert.ok(e[loc].meta_title.length <= 70, `${e.slug}.${loc}.meta_title ≤ 70 (${e[loc].meta_title.length})`)
      assert.ok(e[loc].meta_description.length <= 200, `${e.slug}.${loc}.meta_description ≤ 200 (${e[loc].meta_description.length})`)
    }
  }
})

test('UA descriptions are unique across products', () => {
  const seen = new Set()
  for (const e of METAL_CONTENT) {
    assert.ok(!seen.has(e.ua.description), `${e.slug} ua.description must be unique`)
    seen.add(e.ua.description)
  }
})

test('every entry has localized main + gallery alt for all locales', () => {
  for (const e of METAL_CONTENT) {
    for (const loc of ['uk', 'ru', 'en']) {
      assert.ok(e.main_image_alt[loc]?.trim(), `${e.slug}.main_image_alt.${loc}`)
      assert.ok(e.gallery_alt_pattern[loc]?.includes('{n}'), `${e.slug}.gallery_alt_pattern.${loc} must contain {n}`)
    }
  }
})

test('METAL_UNKNOWN_SPECS only references genuinely null characteristics', () => {
  for (const u of METAL_UNKNOWN_SPECS) {
    const e = metalContentBySlug(u.slug)
    assert.ok(e, `content exists for ${u.slug}`)
    for (const f of u.missing) {
      assert.ok(METAL_CHARACTERISTIC_FIELDS.includes(f), `${f} is a known characteristic field`)
      const v = e.characteristics[f]
      assert.ok(v == null || v.trim() === '', `${u.slug}.${f} must actually be empty to be reported missing`)
    }
    // Fields NOT listed must be present (consistency both ways).
    for (const f of METAL_CHARACTERISTIC_FIELDS) {
      if (!u.missing.includes(f)) {
        const v = e.characteristics[f]
        assert.ok(v != null && v.trim() !== '', `${u.slug}.${f} not-missing must be filled`)
      }
    }
  }
})
