import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateRussianMetaTitle, validateMetaTitle } from '../lib/catalog/seo-validate.ts'
import { RU_PRODUCT_TARGETS, RU_TITLE_EXAMPLES } from '../lib/catalog/seo-ai-ru.ts'

// Effective RU meta-title throughput (requirement D7/D8). A "properly generated"
// title = a Russian product type + purpose, with optional Latin brand / model /
// dimension / SKU. At least 80 of 100 representative items must pass BOTH the
// dedicated RU title validator and the base meta_title validator.

const titleOk = (t) => validateRussianMetaTitle(t).ok && validateMetaTitle(t).ok

// ── The shipped rules + examples are present and self-consistent ──────────────

test('RU_PRODUCT_TARGETS ships explicit title rules and worked examples', () => {
  const rules = RU_PRODUCT_TARGETS.rules.join(' ')
  assert.match(rules, /35–65/)
  assert.match(rules, /минимум 2 значимых русских слова/i)
  assert.match(rules, /минимум 3 русских слова/i)
  assert.ok(RU_PRODUCT_TARGETS.title_examples, 'examples are included in the candidate targets')
})

test('every shipped GOOD example passes and every BAD example fails', () => {
  for (const good of RU_TITLE_EXAMPLES.good) {
    assert.ok(titleOk(good), `good example must pass: ${good} — ${validateRussianMetaTitle(good).reasons.join('; ')}`)
  }
  for (const bad of RU_TITLE_EXAMPLES.bad) {
    assert.equal(titleOk(bad.title), false, `bad example must fail: ${bad.title}`)
  }
})

// ── 100 representative technical items — ≥80 pass ─────────────────────────────

const TYPES = [
  'Тормозные колодки', 'Подшипник ступицы', 'Ремень привода', 'Цепь пильная',
  'Фильтр масляный', 'Свеча зажигания', 'Комплект прокладок', 'Насос топливный',
  'Рычаг тормоза', 'Звезда ведущая',
]
const BRANDS = ['INTERTOOL', 'Bosch', 'Gates', 'AMG', 'NTN', 'SKF', 'Denso', 'NGK', 'Mann', 'Koyo']
const CODES = ['6202-ZZ', '90×49×10', '3/8', 'DT-0530', '10×850', '168F', 'GX160', '5PK', '', '']
const APPS = [
  'для мотоцикла', 'для бензопилы', 'для мототехники', 'для скутера',
  'для оборудования', 'для мопеда', 'для генератора', 'для мотокосы',
  'для квадроцикла', 'для техники',
]

test('at least 80 of 100 properly generated RU titles pass validation', () => {
  const titles = []
  for (let i = 0; i < 100; i++) {
    const type = TYPES[i % TYPES.length]
    const brand = BRANDS[(i * 3) % BRANDS.length]
    const code = CODES[(i * 7) % CODES.length]
    const app = APPS[(i * 5) % APPS.length]
    // "Тип Бренд Код назначение" — a real Russian type + purpose with a Latin
    // brand/model that never dominates (the exact shape the prompt requires).
    titles.push([type, brand, code, app].filter(Boolean).join(' '))
  }
  const passed = titles.filter(titleOk)
  assert.ok(
    passed.length >= 80,
    `expected ≥80/100 to pass, got ${passed.length}. First failures: ${titles.filter((t) => !titleOk(t)).slice(0, 5).join(' | ')}`,
  )
})

test('titles that merely echo a Latin/code source name are rejected (the production failure)', () => {
  // These are the shape of the ~98 invalid production titles: brand + code only.
  const echoed = ['INTERTOOL DT-0530', 'Bosch 0 986 424 815', 'Gates 5PK1234', 'AMG N-296705', 'NTN 6202-ZZ']
  for (const t of echoed) assert.equal(titleOk(t), false, `must reject a code/brand echo: ${t}`)
})
