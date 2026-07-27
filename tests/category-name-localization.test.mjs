import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  resolveUkCategoryName,
  resolveRuCategoryName,
  curatedUkCategoryName,
  planCategoryNameBackfill,
  isGenericCategoryName,
  isCodeLikeName,
  hasRussianOnlyLetters,
  hasUkrainianOnlyLetters,
  GENERIC_CATEGORY_NAMES,
  CURATED_UK_CATEGORY_NAMES,
  REVIEWED_UK_CATEGORY_NAMES,
  isVerifiedUkrainianName,
} from '../lib/catalog/uk-category-name.ts'
import { isUkrainianText, containsLikelyRussianWords } from '../lib/catalog/russian-text.ts'

// ─────────────────────────────────────────────────────────────────────────────
// /catalog rendered many DIFFERENT categories under one shared title
// («Товари для дому та господарства»). Names are now resolved from real sources,
// Russian text (including shared-Cyrillic Russian) is never accepted as
// Ukrainian, and a machine transliteration is never shown to a visitor.
// ─────────────────────────────────────────────────────────────────────────────

// ── Required curated translations ────────────────────────────────────────────

const REQUIRED = [
  ['Абразивные материалы', 'Абразивні матеріали'],
  ['Автоаксессуары', 'Автоаксесуари'],
  ['Свечи зажигания', 'Свічки запалювання'],
  ['Тормозные колодки', 'Гальмівні колодки'],
  ['Бытовая техника', 'Побутова техніка'],
  ['Цепи и звезды', 'Ланцюги та зірки'],
]

for (const [ru, uk] of REQUIRED) {
  test(`«${ru}» → «${uk}» (verified curated mapping)`, () => {
    assert.equal(curatedUkCategoryName(ru), uk)
    const r = resolveUkCategoryName({ supplier_name: ru })
    assert.equal(r.name, uk)
    assert.equal(r.source, 'curated')
    assert.equal(r.needsReview, false)
  })
}

test('every curated Ukrainian name passes the shared Ukrainian validator', () => {
  for (const [, uk] of REQUIRED) {
    assert.equal(hasRussianOnlyLetters(uk), false)
    assert.equal(isUkrainianText(uk), true, `must read as Ukrainian: ${uk}`)
  }
})

// ── EVERY curated Russian key resolves to its Ukrainian value ────────────────
// A Russian key stored in a locale-labelled column («Вентиляция» in name_ua)
// must map to the curated Ukrainian value and must NEVER be reported as an
// already-valid stored Ukrainian name.

test('every curated Russian key resolves to its curated Ukrainian value', () => {
  const entries = Object.entries(CURATED_UK_CATEGORY_NAMES)
  assert.ok(entries.length >= 49, `expected the full curated table, got ${entries.length}`)

  for (const [key, uk] of entries) {
    for (const field of ['name_ua', 'h1', 'uk_translation', 'supplier_name_ua', 'supplier_name']) {
      const r = resolveUkCategoryName({ [field]: key })
      assert.equal(r.name, uk, `${field}=«${key}» must resolve to «${uk}»`)
      assert.equal(r.source, 'curated', `${field}=«${key}» must never be reported as ${r.source}`)
      assert.notEqual(r.source, 'stored_uk')
      assert.equal(r.needsReview, false)
    }
  }
})

// The 18 names that the previous validator wrongly accepted as Ukrainian.
const PREVIOUSLY_MISCLASSIFIED = [
  ['Вентиляция', 'Вентиляція'],
  ['Двигатели', 'Двигуни'],
  ['Зеркала', 'Дзеркала'],
  ['Кабели и провода', 'Кабелі та дроти'],
  ['Мебель', 'Меблі'],
  ['Подшипники', 'Підшипники'],
  ['Посуда', 'Посуд'],
  ['Сантехника', 'Сантехніка'],
  ['Трансмиссия', 'Трансмісія'],
  ['Все категории', 'Усі категорії'],
  ['Детали двигателя', 'Деталі двигуна'],
  ['Запчасти для мототехники', 'Запчастини для мототехніки'],
  ['Запчасти для скутеров', 'Запчастини для скутерів'],
  ['Крепеж', 'Кріплення'],
  ['Масла и смазки', 'Оливи та мастила'],
  ['Подшипники и сальники', 'Підшипники та сальники'],
  ['Принадлежности', 'Приладдя'],
  ['Сад и огород', 'Сад і город'],
]

for (const [ru, uk] of PREVIOUSLY_MISCLASSIFIED) {
  test(`stored «${ru}» resolves to «${uk}», never to itself`, () => {
    const stored = resolveUkCategoryName({ name_ua: ru })
    assert.equal(stored.name, uk)
    assert.equal(stored.source, 'curated')
    assert.equal(resolveUkCategoryName({ h1: ru }).name, uk)
    // The Russian form is never publicly renderable Ukrainian on its own.
    assert.equal(isVerifiedUkrainianName(ru), false, `«${ru}» must not pass as Ukrainian`)
  })
}

// ── FAIL CLOSED: ambiguous Cyrillic without Ukrainian evidence ───────────────

test('an unknown ambiguous Russian noun never becomes a public Ukrainian name', () => {
  // No ы/э/ъ/ё, no Russian-only ending, no curated entry, no і/ї/є/ґ.
  for (const ambiguous of ['Гидравлика', 'Компрессоры', 'Радиаторы', 'Тросы']) {
    assert.equal(isVerifiedUkrainianName(ambiguous), false, `«${ambiguous}» lacks Ukrainian evidence`)
    for (const field of ['name_ua', 'h1', 'uk_translation', 'supplier_name_ua']) {
      const r = resolveUkCategoryName({ [field]: ambiguous })
      assert.equal(r.name, null, `${field}=«${ambiguous}» must not be renderable`)
      assert.equal(r.needsReview, true, 'it belongs in the review queue')
      assert.ok(r.suggestedName, 'a diagnostic suggestion is still offered')
    }
  }
})

test('a locale-labelled column is not proof — every UA-labelled source fails closed', () => {
  for (const field of ['name_ua', 'h1', 'uk_translation', 'supplier_name_ua']) {
    const r = resolveUkCategoryName({ [field]: 'Ручной инструмент однородный' })
    assert.equal(r.name, null, `${field} must not be trusted on its label alone`)
  }
})

test('positive Ukrainian evidence is accepted', () => {
  // a. Ukrainian-specific letters.
  assert.equal(isVerifiedUkrainianName('Абразивні матеріали'), true)
  assert.equal(resolveUkCategoryName({ supplier_name_ua: 'Абразивні матеріали' }).source, 'supplier_uk')
  // b. exact curated Ukrainian value with no Ukrainian-specific letter.
  assert.equal(hasUkrainianOnlyLetters('Посуд'), false)
  assert.equal(isVerifiedUkrainianName('Посуд'), true)
  assert.equal(resolveUkCategoryName({ name_ua: 'Посуд' }).source, 'stored_uk')
  // c. the explicit reviewed whitelist.
  for (const name of REVIEWED_UK_CATEGORY_NAMES) {
    assert.equal(isVerifiedUkrainianName(name), true, `whitelisted: ${name}`)
  }
})

test('every curated Ukrainian VALUE is itself accepted as Ukrainian', () => {
  for (const uk of Object.values(CURATED_UK_CATEGORY_NAMES)) {
    assert.equal(isVerifiedUkrainianName(uk), true, `curated target must be renderable: ${uk}`)
  }
})

// ── DEFECT 1: shared-Cyrillic Russian must NOT be accepted as Ukrainian ──────

const SHARED_CYRILLIC_RUSSIAN = [
  'Металлические профили',
  'Сетка абразивная',
  'Моторные масла',
  'Запасные части',
  'Ручной инструмент',
]

for (const ru of SHARED_CYRILLIC_RUSSIAN) {
  test(`name_ua = «${ru}» is REJECTED as a stored Ukrainian name`, () => {
    // The shared robust detector must flag it…
    assert.equal(containsLikelyRussianWords(ru), true, `robust detector must catch: ${ru}`)
    assert.equal(isUkrainianText(ru), false)
    // …and the resolver must never surface it as the Ukrainian display name.
    const r = resolveUkCategoryName({ name_ua: ru })
    assert.notEqual(r.name, ru, 'Russian text must never become the UA name')
    assert.notEqual(r.source, 'stored_uk')
  })
}

test('the resolver reuses the SHARED validator (no second, weaker one)', () => {
  const src = readFileSync(new URL('../lib/catalog/uk-category-name.ts', import.meta.url), 'utf8')
  assert.match(src, /from '@\/lib\/catalog\/russian-text'/, 'must import the shared detector')
  assert.match(src, /isUkrainianText/, 'verifiedUk must use it')
  const catalog = readFileSync(new URL('../lib/supabase/catalog.ts', import.meta.url), 'utf8')
  assert.match(catalog, /from '@\/lib\/catalog\/russian-text'/, 'catalog.ts uses the same extracted module')
})

test('genuine Ukrainian names still pass the strengthened validator', () => {
  for (const uk of [
    'Абразивні матеріали', 'Ручний інструмент', 'Садовий інвентар', 'Побутова техніка',
    'Запчастини для скутерів', 'Оливи та мастила', 'Будівельні матеріали', 'Двигуни',
  ]) {
    assert.equal(isUkrainianText(uk), true, `false positive on: ${uk}`)
  }
})

// ── DEFECT 2: supplier_categories.name_ua is a Ukrainian source ──────────────

test('supplier_name_ua = «Абразивні матеріали» is accepted WITHOUT the heuristic', () => {
  const r = resolveUkCategoryName({ name_ua: 'cat-1', supplier_name_ua: 'Абразивні матеріали', supplier_name: 'Абразивные материалы' })
  assert.equal(r.name, 'Абразивні матеріали')
  assert.equal(r.source, 'supplier_uk')
  assert.equal(r.needsReview, false)
  assert.equal(r.suggestedName, null, 'no heuristic path was taken')
})

test('a RUSSIAN supplier_name_ua is not mistaken for a Ukrainian source', () => {
  const r = resolveUkCategoryName({ name_ua: 'cat-1', supplier_name_ua: 'Моторные масла' })
  assert.notEqual(r.source, 'supplier_uk')
  assert.notEqual(r.name, 'Моторные масла')
})

// ── DEFECT 3: heuristic output is NEVER publicly renderable ─────────────────

test('a heuristic-only category is EXCLUDED, not rendered with machine copy', () => {
  const r = resolveUkCategoryName({ name_ua: 'cat-9', supplier_name: 'Металлические профили' })
  assert.equal(r.name, null, 'no public name → category is excluded')
  assert.equal(r.source, 'none')
  assert.equal(r.needsReview, true)
  assert.ok(r.suggestedName, 'a diagnostic suggestion is still produced')
  assert.notEqual(r.suggestedName, r.name, 'the suggestion is not the rendered name')
})

test('the suggestion never reaches localized_name / H1 / metadata / breadcrumb', () => {
  const catalog = readFileSync(new URL('../lib/supabase/catalog.ts', import.meta.url), 'utf8')
  const start = catalog.indexOf('export async function localizeCatalogCategories')
  const ukBranch = catalog.slice(start, catalog.indexOf("if (locale !== 'ru') return categories", start))
  assert.doesNotMatch(ukBranch, /suggestedName/, 'the UA render path must never read the suggestion')
  assert.match(ukBranch, /resolveUkCategoryName/)
  // The category page 404s instead of rendering an unresolved category.
  const page = readFileSync(new URL('../app/catalog/[category]/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /hasResolvedCategoryName/)
  assert.match(page, /notFound\(\)/)
})

test('/catalog/all stays reachable regardless of category resolution', () => {
  const page = readFileSync(new URL('../app/catalog/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /catalog\/all/, 'the browse-all entry point is still linked')
  // The synthetic "all" card is never filtered out.
  const catalog = readFileSync(new URL('../lib/supabase/catalog.ts', import.meta.url), 'utf8')
  assert.match(catalog, /id === '__all__'\) return true/, 'the all-products card is always renderable')
})

// ── Generic fallback rejection ───────────────────────────────────────────────

test('the generic phrases are recognised and never used as a name', () => {
  for (const g of GENERIC_CATEGORY_NAMES) assert.equal(isGenericCategoryName(g), true)
  assert.equal(isGenericCategoryName('Абразивні матеріали'), false)
})

test('a stored generic name_ua does NOT win over a real source name', () => {
  const r = resolveUkCategoryName({ name_ua: 'Товари для дому та господарства', supplier_name: 'Автоаксессуары' })
  assert.equal(r.name, 'Автоаксесуари')
})

test('the Russian generic is never accepted as a source name', () => {
  const r = resolveUkCategoryName({ supplier_name: 'Товары для дома и хозяйства' })
  assert.equal(r.name, null)
})

test('several different categories get DISTINCT names — never one shared fallback', () => {
  const rows = [
    'Абразивные материалы', 'Автоаксессуары', 'Свечи зажигания', 'Тормозные колодки',
    'Бытовая техника', 'Цепи и звезды', 'Подшипники', 'Инструменты', 'Зеркала', 'Фильтры',
  ]
  const names = rows.map((ru) => resolveUkCategoryName({ name_ua: 'cat-1', supplier_name: ru }).name)
  assert.equal(names.filter(Boolean).length, rows.length)
  assert.equal(new Set(names).size, rows.length, `all distinct, got: ${names.join(' | ')}`)
  for (const n of names) assert.equal(isGenericCategoryName(n), false)
})

// ── Code-like / slug rejection ───────────────────────────────────────────────

test('code-like values are rejected and the slug is never displayed', () => {
  for (const code of ['cat-185', '38853', 'id_42', '<>', '  ', 'c99']) {
    assert.equal(isCodeLikeName(code), true)
  }
  assert.equal(resolveUkCategoryName({ name_ua: '38853', slug: 'abrazyvni-materialy' }).name, null)
})

// ── Source priority ──────────────────────────────────────────────────────────

test('a stored verified Ukrainian name always wins', () => {
  const r = resolveUkCategoryName({ name_ua: 'Садовий інвентар', supplier_name: 'Садовый инвентарь' })
  assert.equal(r.name, 'Садовий інвентар')
  assert.equal(r.source, 'stored_uk')
})

test('a reviewed uk translation row beats conversion', () => {
  const r = resolveUkCategoryName({ name_ua: 'cat-9', uk_translation: 'Ланцюги та зірочки', supplier_name: 'Цепи и звезды' })
  assert.equal(r.name, 'Ланцюги та зірочки')
  assert.equal(r.source, 'reviewed_uk')
})

// ── UA and RU stay different and in-language ─────────────────────────────────

test('UA and RU names stay different and each stays in its own language', () => {
  const src = { name_ua: 'cat-1', supplier_name: 'Абразивные материалы' }
  const uk = resolveUkCategoryName(src).name
  const ru = resolveRuCategoryName(src)
  assert.equal(uk, 'Абразивні матеріали')
  assert.equal(ru, 'Абразивные материалы')
  assert.notEqual(uk, ru)
  assert.equal(isUkrainianText(uk), true)
  assert.equal(hasUkrainianOnlyLetters(ru), false)
})

// ── Backfill: locks, idempotence, and what may be persisted ─────────────────

const lockBase = { id: '1', slug: 's', name_ua: 'cat-1', supplier_name: 'Автоаксессуары' }

test('manual source and locks remain protected', () => {
  assert.equal(planCategoryNameBackfill({ ...lockBase, seo_manual_lock: true }).skip, 'manual_lock')
  assert.equal(planCategoryNameBackfill({ ...lockBase, seo_status: 'manual' }).skip, 'protected_status')
  assert.equal(planCategoryNameBackfill({ ...lockBase, seo_status: 'sheet' }).skip, 'protected_status')
  assert.equal(planCategoryNameBackfill({ ...lockBase, source: 'manual' }).skip, 'manual_source')
  for (const guard of [{ seo_manual_lock: true }, { seo_status: 'manual' }, { source: 'manual' }]) {
    assert.equal(planCategoryNameBackfill({ ...lockBase, ...guard }).payload, null)
  }
})

test('NULL seo_status and NULL seo_manual_lock are still eligible for update', () => {
  const plan = planCategoryNameBackfill({ ...lockBase, seo_status: null, seo_manual_lock: null, source: null })
  assert.equal(plan.skip, null, 'a NULL-flagged row must not be treated as protected')
  assert.deepEqual(plan.payload, { name_ua: 'Автоаксесуари' })
})

test('the guarded UPDATE is NULL-safe and counts only real writes', () => {
  const src = readFileSync(new URL('../app/api/admin/catalog/backfill-category-names/route.ts', import.meta.url), 'utf8')
  // NULL-safe guards (a plain .neq() would exclude NULL rows in SQL).
  assert.match(src, /seo_manual_lock\.is\.null,seo_manual_lock\.eq\.false/)
  assert.match(src, /seo_status\.is\.null,and\(seo_status\.neq\.sheet,seo_status\.neq\.manual\)/)
  assert.match(src, /source\.is\.null,source\.neq\.manual/)
  assert.doesNotMatch(src, /\.neq\('seo_manual_lock'/, 'the NULL-excluding filter must be gone')
  // The updated ids come back, and a zero-row match is a conflict, not a change.
  assert.match(src, /\.select\('id'\)/)
  assert.match(src, /updated\.length === 0.*writeConflicts\+\+/s)
})

test('backfill writes a curated name, then is a no-op on re-run (idempotent)', () => {
  const first = planCategoryNameBackfill(lockBase)
  assert.equal(first.skip, null)
  assert.deepEqual(first.payload, { name_ua: 'Автоаксесуари' })
  const second = planCategoryNameBackfill({ ...lockBase, name_ua: first.payload.name_ua })
  assert.equal(second.payload, null)
  assert.equal(second.skip, 'already_valid')
})

test('backfill never overwrites a valid unique Ukrainian name', () => {
  const plan = planCategoryNameBackfill({ id: '1', slug: 's', name_ua: 'Мій власний заголовок', supplier_name: 'Автоаксессуары' })
  assert.equal(plan.skip, 'already_valid')
  assert.equal(plan.payload, null)
})

test('backfill NEVER persists a heuristic suggestion', () => {
  const plan = planCategoryNameBackfill({ id: '1', slug: 's', name_ua: 'cat-1', supplier_name: 'Металлические профили' })
  assert.equal(plan.skip, 'needs_review')
  assert.equal(plan.payload, null, 'display-only suggestion must not be written')
  assert.equal(plan.proposedName, null, 'and it is not a proposed NAME')
  assert.ok(plan.suggestedName, 'it is reported only as a suggestion')
})

test('backfill never writes generic fallback text and reports unusable rows', () => {
  assert.equal(planCategoryNameBackfill({ id: '1', slug: 's', name_ua: 'cat-1', supplier_name: 'Товары для дома и хозяйства' }).payload, null)
  const plan = planCategoryNameBackfill({ id: '1', slug: 'broken', name_ua: '38853' })
  assert.equal(plan.skip, 'unusable')
  assert.equal(plan.payload, null)
})

// ── Counters stay accurate above the sample caps ────────────────────────────

test('counters are computed for EVERY row, independent of the capped samples', () => {
  // 120 rows > every sample cap (20/25/50) in the routes.
  const rows = Array.from({ length: 120 }, (_, i) => ({
    id: String(i), slug: `s-${i}`, name_ua: `cat-${i}`, supplier_name: 'Шлифовальные диски специальные',
  }))
  const needReview = rows.filter((r) => planCategoryNameBackfill(r).skip === 'needs_review').length
  assert.equal(needReview, 120, 'every row is counted, not just the sampled ones')

  const backfill = readFileSync(new URL('../app/api/admin/catalog/backfill-category-names/route.ts', import.meta.url), 'utf8')
  assert.match(backfill, /categories_requiring_review: skipped\.needs_review/, 'counter comes from the full tally')
  assert.match(backfill, /unresolved_categories: skipped\.unusable/)
  assert.doesNotMatch(backfill, /categories_requiring_review: \w+\.length/, 'never derived from a capped array')

  const diag = readFileSync(new URL('../app/api/admin/diag/categories/route.ts', import.meta.url), 'utf8')
  assert.match(diag, /generic_stored_rows: genericStoredCount/, 'uncapped generic tally')
  assert.doesNotMatch(diag, /generic_stored_rows: genericRows\.length/)
})

test('protected diagnostics and backfill use the ADMIN client for source queries', () => {
  for (const f of ['app/api/admin/diag/categories/route.ts', 'app/api/admin/catalog/backfill-category-names/route.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.match(src, /getAdminClient\(\)/, `${f} must use the admin client`)
    assert.match(src, /fetchUkCategoryNameSources\(rows, client\)/, `${f} must pass it into the source loader`)
  }
})

// ── Schema safety ────────────────────────────────────────────────────────────

test('no catalog_categories SELECT requests the unproven `name` column', () => {
  const files = [
    'lib/supabase/catalog.ts',
    'app/api/admin/diag/categories/route.ts',
    'app/api/admin/catalog/backfill-category-names/route.ts',
  ]
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    const selects = [...src.matchAll(/from\('catalog_categories'\)\s*\n?\s*\.select\(([^)]*)\)/g)]
    for (const m of selects) {
      const cols = m[1]
      assert.equal(/(^|[,'"\s])name(?!_ua)([,'"\s]|$)/.test(cols), false, `${f}: must not select catalog_categories.name → ${cols}`)
    }
  }
})

test('localizeCatalogCategories no longer contains the generic literal fallback', () => {
  const src = readFileSync(new URL('../lib/supabase/catalog.ts', import.meta.url), 'utf8')
  const start = src.indexOf('export async function localizeCatalogCategories')
  const ukBranch = src.slice(start, src.indexOf("if (locale !== 'ru') return categories", start))
  assert.ok(start > 0, 'the existing localization function is preserved and extended')
  assert.doesNotMatch(ukBranch, /'Товари для дому та господарства'/)
})

test('public listings filter out categories with no resolved name', () => {
  for (const f of ['app/catalog/page.tsx', 'app/sitemap.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.match(src, /hasResolvedCategoryName/, `${f} must exclude unresolved categories`)
  }
})
