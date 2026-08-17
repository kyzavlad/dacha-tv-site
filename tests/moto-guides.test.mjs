import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SCOOTER_GUIDE_SLUGS,
  SCOOTER_GUIDES,
} from '../lib/moto/scooter-guides.ts'

const EXPECTED = [
  'honda-dio-yak-vyznachyty-ramu',
  'yamaha-jog-3kj-sa36-sa39',
  'suzuki-lets-2-4-5',
  'yak-pidibraty-remin-variatora',
  'yak-pidibraty-karbiurator-skutera',
]

const indexSrc = readFileSync(new URL('../app/moto/guides/page.tsx', import.meta.url), 'utf8')
const detailSrc = readFileSync(new URL('../app/moto/guides/[guide]/page.tsx', import.meta.url), 'utf8')
const sitemapSrc = readFileSync(new URL('../app/sitemap.ts', import.meta.url), 'utf8')

test('the P1 guide queue stays intentionally small and explicit', () => {
  assert.deepEqual(SCOOTER_GUIDE_SLUGS, EXPECTED)
  assert.equal(new Set(SCOOTER_GUIDE_SLUGS).size, 5)
})

test('every guide has complete UA/RU metadata, useful content, FAQ and a commerce CTA', () => {
  for (const slug of SCOOTER_GUIDE_SLUGS) {
    const guide = SCOOTER_GUIDES[slug]
    assert.ok(guide, `${slug}: guide config exists`)
    assert.ok(guide.primaryHref.startsWith('/'), `${slug}: primary href is an internal route`)
    assert.ok(guide.relatedHrefs.length >= 3, `${slug}: enough useful internal links`)

    for (const locale of ['uk', 'ru']) {
      const copy = guide.copy[locale]
      assert.ok(copy.title.length >= 20, `${slug}/${locale}: useful H1`)
      assert.ok(copy.metaTitle.length >= 20, `${slug}/${locale}: useful title`)
      assert.ok(copy.metaDescription.length >= 80, `${slug}/${locale}: useful description`)
      assert.ok(copy.intro.length >= 80, `${slug}/${locale}: useful intro`)
      assert.ok(copy.sections.length >= 3, `${slug}/${locale}: substantial body`)
      assert.ok(copy.faq.length >= 3, `${slug}/${locale}: visible FAQ`)
      assert.ok(copy.ctaLabel.length > 0, `${slug}/${locale}: commerce CTA`)
    }
  }
})

test('internal guide links are localized instead of hardcoding RU/UA prefixes', () => {
  assert.match(indexSrc, /localizedPath\(locale, `\/moto\/guides\/\$\{guide\.slug\}`\)/)
  assert.match(detailSrc, /localizedPath\(locale, guide\.primaryHref\)/)
  assert.match(detailSrc, /localizedPath\(locale, item\.href\)/)
})

test('guides expose only the public UA/RU locales and never index hidden EN', () => {
  assert.match(indexSrc, /robots: \{ index: false, follow: false \}/)
  assert.match(indexSrc, /if \(locale === 'en'\) notFound\(\)/)
  assert.match(indexSrc, /buildAlternates\(locale, '\/moto\/guides', \['uk', 'ru'\]\)/)

  assert.match(detailSrc, /robots: \{ index: false, follow: false \}/)
  assert.match(detailSrc, /if \(locale === 'en'\) notFound\(\)/)
  assert.match(detailSrc, /buildAlternates\(locale, `\/moto\/guides\/\$\{guide\.slug\}`, \['uk', 'ru'\]\)/)
})

test('detail pages render visible FAQ and an explicit compatibility disclaimer', () => {
  assert.match(detailSrc, /<FaqBlock items=\{copy\.faq\}/)
  assert.match(detailSrc, /compatibilityText/)
  assert.match(detailSrc, /guide\.primaryHref/)
})

test('sitemap carries the guide index and all config-driven guide URLs', () => {
  assert.match(sitemapSrc, /`\$\{BASE_URL\}\/moto\/guides`/)
  assert.match(sitemapSrc, /\.\.\.SCOOTER_GUIDE_SLUGS\.map/)
  assert.match(sitemapSrc, /`\$\{BASE_URL\}\/moto\/guides\/\$\{slug\}`/)
})
