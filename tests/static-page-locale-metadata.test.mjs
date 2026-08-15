import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAlternates, buildSocialMetadata } from '../lib/seo.ts'
import { pageDict } from '../lib/i18n/pages.ts'

const PAGES = [
  ['delivery', '/delivery'],
  ['about', '/about'],
  ['contact', '/contact'],
  ['faq', '/faq'],
]

for (const [page, path] of PAGES) {
  test(`${path} wires request-locale metadata instead of static Ukrainian metadata`, () => {
    const src = readFileSync(new URL(`../app/${page}/page.tsx`, import.meta.url), 'utf8')

    assert.match(src, /export async function generateMetadata\(\): Promise<Metadata>/)
    assert.ok(!src.includes('export const metadata:'), `${path} must not export static metadata`)
    assert.ok(src.includes(`buildAlternates(locale, '${path}')`), `${path} must build locale-aware alternates`)
    assert.ok(src.includes('buildSocialMetadata({'), `${path} must use the shared social metadata builder`)
    assert.ok(src.includes(`bareTitle: t.${page}.title`), `${path} title must come from pageDict`)
    assert.ok(src.includes(`description: t.${page}.intro`), `${path} description must come from pageDict`)
  })

  test(`${path} produces self-canonical UA/RU URLs with reciprocal alternates`, () => {
    const uk = buildAlternates('uk', path)
    const ru = buildAlternates('ru', path)

    assert.equal(new URL(uk.canonical).pathname, path)
    assert.equal(new URL(ru.canonical).pathname, `/ru${path}`)

    for (const alternates of [uk.languages, ru.languages]) {
      const paths = Object.values(alternates).map((url) => new URL(url).pathname)
      assert.ok(paths.includes(path), `${path} alternates must contain Ukrainian URL`)
      assert.ok(paths.includes(`/ru${path}`), `${path} alternates must contain Russian URL`)
      assert.equal(new URL(alternates['x-default']).pathname, path)
    }
  })

  test(`${path} social metadata follows the active localized copy and canonical`, () => {
    const ukCopy = pageDict('uk')[page]
    const ruCopy = pageDict('ru')[page]
    assert.notEqual(ukCopy.intro, ruCopy.intro, `${path} must have distinct UA/RU descriptions`)

    for (const locale of ['uk', 'ru']) {
      const copy = pageDict(locale)[page]
      const { canonical, languages } = buildAlternates(locale, path)
      const meta = buildSocialMetadata({
        bareTitle: copy.title,
        description: copy.intro,
        canonical,
        languages,
        imageAlt: copy.title,
      })

      assert.equal(meta.title, copy.title)
      assert.equal(meta.description, copy.intro)
      assert.equal(meta.alternates?.canonical, canonical)
      assert.deepEqual(meta.alternates?.languages, languages)
      assert.equal(meta.openGraph?.title, copy.title)
      assert.equal(meta.openGraph?.description, copy.intro)
      assert.equal(meta.openGraph?.url, canonical)
      assert.equal(meta.twitter?.title, copy.title)
      assert.equal(meta.twitter?.description, copy.intro)
    }
  })
}
