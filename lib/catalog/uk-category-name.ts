// ─── Ukrainian catalog-category name resolution (category-only) ──────────────
// Fixes: /catalog showed many DIFFERENT categories under one shared title
// («Товари для дому та господарства») because the UA branch of
// localizeCatalogCategories fell back to that literal whenever h1/name_ua were
// empty OR were rejected as Russian.
//
// Resolution order. Every locale-labelled source (h1, name_ua, uk translation
// row, supplier name_ua) is walked in preference order and each value must
// PROVE it is Ukrainian:
//   1. an EXACT curated Russian key wins immediately — a legacy Russian value
//      such as «Вентиляция» stored in name_ua resolves to «Вентиляція» and is
//      never reported as stored_uk;
//   2. otherwise the value is accepted only on positive evidence: a Ukrainian
//      -specific letter (і/ї/є/ґ) with no Russian marker, or an exact match
//      against a verified Ukrainian value (curated target / reviewed
//      whitelist). See isVerifiedUkrainianName — it FAILS CLOSED;
//   3. remaining Russian sources map through the curated table;
//   4. heuristic transliteration is a DIAGNOSTIC SUGGESTION ONLY — never
//      rendered, never persisted, always flagged `needsReview`.
// When nothing resolves, the name is null → the category is excluded from the
// public landing page and reported in diagnostics. The generic phrase is never
// used as a category name again.
//
// Column safety (requirement 5): this module reads ONLY columns proven to be in
// production use — catalog_categories.name_ua/h1, supplier_categories.name_ua/
// name, catalog_category_translations.h1/meta_title. It never touches
// catalog_categories.name.

import { isUkrainianText, containsRussianOnlyLetters, containsUkrainianOnlyLetters } from '@/lib/catalog/russian-text'

// The two generic phrases that must never be a category name.
export const GENERIC_CATEGORY_NAMES = [
  'Товари для дому та господарства',
  'Товары для дома и хозяйства',
] as const

export function isGenericCategoryName(value: string | null | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  if (!v) return false
  return GENERIC_CATEGORY_NAMES.some((g) => g.toLowerCase() === v)
}

// Re-exported from the SHARED detector (lib/catalog/russian-text.ts) so this
// module can never drift into a second, weaker validator.
export const hasRussianOnlyLetters = containsRussianOnlyLetters
export const hasUkrainianOnlyLetters = containsUkrainianOnlyLetters

// A code-like value that must never be displayed ("cat-185", "38853", "<>").
export function isCodeLikeName(value: string | null | undefined): boolean {
  const n = (value ?? '').trim()
  if (!n) return true
  if (/^\d+$/.test(n)) return true
  if (/^(cat|category|categoria|id|c|k)[-_ ]?\d+$/i.test(n)) return true
  if (!/\p{L}{2,}/u.test(n)) return true
  return false
}

// ── 2. EXACT curated mappings (verified, grammatical Ukrainian) ──────────────
// Keyed by the lowercased Russian source name. Only add entries that a human has
// verified — this is the authoritative layer, ahead of any heuristic.
export const CURATED_UK_CATEGORY_NAMES: Record<string, string> = {
  'абразивные материалы': 'Абразивні матеріали',
  'автоаксессуары': 'Автоаксесуари',
  'аккумуляторы': 'Акумулятори',
  'бытовая техника': 'Побутова техніка',
  'важные мелочи': 'Важливі дрібниці',
  'вентиляция': 'Вентиляція',
  'все категории': 'Усі категорії',
  'двигатели': 'Двигуни',
  'детали двигателя': 'Деталі двигуна',
  'зажигание': 'Запалювання',
  'запчасти для мототехники': 'Запчастини для мототехніки',
  'запчасти для скутеров': 'Запчастини для скутерів',
  'зеркала': 'Дзеркала',
  'инструменты': 'Інструменти',
  'инструменты и оборудование': 'Інструменти та обладнання',
  'кабели и провода': 'Кабелі та дроти',
  'колеса и шины': 'Колеса та шини',
  'крепеж': 'Кріплення',
  'лампы и освещение': 'Лампи та освітлення',
  'масла и смазки': 'Оливи та мастила',
  'масляные фильтры': 'Оливні фільтри',
  'метизы': 'Метизи',
  'мебель': 'Меблі',
  'оборудование': 'Обладнання',
  'одежда и экипировка': 'Одяг та екіпірування',
  'подшипники': 'Підшипники',
  'подшипники и сальники': 'Підшипники та сальники',
  'посуда': 'Посуд',
  'приборы и датчики': 'Прилади та датчики',
  'принадлежности': 'Приладдя',
  'прочее': 'Інше',
  'разное': 'Різне',
  'ручной инструмент': 'Ручний інструмент',
  'сад и огород': 'Сад і город',
  'садовый инвентарь': 'Садовий інвентар',
  'сантехника': 'Сантехніка',
  'свечи зажигания': 'Свічки запалювання',
  'строительные материалы': 'Будівельні матеріали',
  'товары для дома': 'Товари для дому',
  'тормозные колодки': 'Гальмівні колодки',
  'тормозная система': 'Гальмівна система',
  'трансмиссия': 'Трансмісія',
  'фильтры': 'Фільтри',
  'цепи и звезды': 'Ланцюги та зірки',
  'цепи и звёзды': 'Ланцюги та зірки',
  'шины и камеры': 'Шини та камери',
  'электрика': 'Електрика',
  'электрика и электроника': 'Електрика та електроніка',
  'электроинструмент': 'Електроінструмент',
}

export function curatedUkCategoryName(russian: string | null | undefined): string | null {
  const key = normalizeName(russian).toLowerCase()
  if (!key) return null
  return CURATED_UK_CATEGORY_NAMES[key] ?? null
}

// ── 3. Explicit human-reviewed Ukrainian whitelist ───────────────────────────
// Genuine Ukrainian category names that carry NO Ukrainian-specific letter
// (і/ї/є/ґ) and are therefore indistinguishable from Russian by orthography
// alone. A value may only be added here after a human has confirmed it is
// Ukrainian. Curated Ukrainian VALUES are trusted automatically (below), so
// they do not need to be repeated here.
export const REVIEWED_UK_CATEGORY_NAMES: readonly string[] = [
  'Насоси',
  'Ланцюги',
  'Мастила',
  'Дроти',
  'Труби',
]

function normalizeName(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

// Every value a human has verified to be Ukrainian, normalized for comparison.
const VERIFIED_UK_NAMES = new Set<string>(
  [...Object.values(CURATED_UK_CATEGORY_NAMES), ...REVIEWED_UK_CATEGORY_NAMES]
    .map((v) => normalizeName(v).toLowerCase()),
)

// FAIL CLOSED. The absence of Russian markers does NOT prove a value is
// Ukrainian: «Вентиляция», «Мебель», «Посуда» and «Трансмиссия» contain no
// Russian-only letter and no Russian-only ending, yet they are Russian. A
// locale-labelled column (name_ua, locale='uk', supplier name_ua) is not proof
// either — those columns still hold legacy Russian supplier data.
//
// A value becomes publicly renderable Ukrainian ONLY on positive evidence:
//   a. it contains a Ukrainian-specific letter і/ї/є/ґ and shows no Russian
//      marker; or
//   b. it exactly matches a verified Ukrainian value (a curated mapping target
//      or the reviewed whitelist above).
// Anything else goes to the review queue and stays off the UA storefront.
export function isVerifiedUkrainianName(value: string | null | undefined): boolean {
  const v = normalizeName(value)
  if (!v) return false
  if (VERIFIED_UK_NAMES.has(v.toLowerCase())) return true
  if (!isUkrainianText(v)) return false
  return containsUkrainianOnlyLetters(v)
}

// ── 4. Heuristic transliteration — EMERGENCY DISPLAY FALLBACK ONLY ───────────
// Never persisted (the backfill refuses it); always flagged needsReview so an
// operator can promote a correct form into CURATED_UK_CATEGORY_NAMES.
const NINE = 'дтзсцчшжр'
const VOWELS = 'аеёиоуыэюяіїє'

function heuristicWord(word: string): string {
  let out = word.replace(/([бвгдджзклмнпрстфхцчшщ])\1/giu, '$1') // аксессуары → аксесуары
  for (const [re, repl] of [
    [/ы(е|й)$/iu, 'і'], [/и(е|й)$/iu, 'і'], [/ая$/iu, 'а'], [/ое$/iu, 'е'],
    [/ой$/iu, 'ий'], [/ый$/iu, 'ий'], [/ии$/iu, 'ії'], [/ия$/iu, 'ія'], [/ы$/iu, 'и'],
  ] as Array<[RegExp, string]>) {
    if (re.test(out)) { out = out.replace(re, repl); break }
  }
  // Rule of nine: keep "и" only after д/т/з/с/ц/ч/ш/ж/р before a consonant or at
  // the end; otherwise it becomes "і" («материал» → «матеріал»).
  const chars = [...out]
  for (let i = 0; i < chars.length; i++) {
    if (chars[i].toLowerCase() !== 'и') continue
    const prev = (chars[i - 1] ?? '').toLowerCase()
    const next = (chars[i + 1] ?? '').toLowerCase()
    if (i === 0) { chars[i] = chars[i] === 'И' ? 'І' : 'і'; continue }
    const afterNine = NINE.includes(prev)
    const beforeConsonant = next !== '' && !VOWELS.includes(next) && next !== 'й' && /\p{L}/u.test(next)
    if (afterNine && (beforeConsonant || next === '')) continue
    chars[i] = chars[i] === 'И' ? 'І' : 'і'
  }
  return chars.join('')
    .replace(/ы/g, 'и').replace(/Ы/g, 'И')
    .replace(/э/g, 'е').replace(/Э/g, 'Е')
    .replace(/ъ/g, "'").replace(/Ъ/g, "'")
    .replace(/ё/g, 'о').replace(/Ё/g, 'О')
}

export function heuristicUkCategoryName(russian: string | null | undefined): string | null {
  const name = (russian ?? '').replace(/\s+/g, ' ').trim()
  if (!name || isCodeLikeName(name)) return null
  const out = name
    .split(/(\s+|[/,()«»"–—-]+)/u)
    .map((tok) => (/\p{L}/u.test(tok) ? (tok.toLowerCase() === 'и' ? 'та' : heuristicWord(tok)) : tok))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return out || null
}

// ── Resolver ─────────────────────────────────────────────────────────────────
export type UkNameSource =
  | 'stored_uk'      // verified Ukrainian h1 / name_ua already in catalog_categories
  | 'reviewed_uk'    // reviewed translation row (catalog_category_translations, uk)
  | 'supplier_uk'    // genuine Ukrainian supplier_categories.name_ua
  | 'curated'        // exact curated mapping
  | 'none'

export interface UkCategoryNameSources {
  // catalog_categories (proven columns only)
  h1?: string | null
  name_ua?: string | null
  // reviewed Ukrainian translation row
  uk_translation?: string | null
  // Russian source names, in preference order
  ru_translation?: string | null   // catalog_category_translations(ru).h1 / meta_title
  supplier_name_ua?: string | null // supplier_categories.name_ua
  supplier_name?: string | null    // supplier_categories.name
  slug?: string | null             // DIAGNOSTIC ONLY — never displayed
}

export interface ResolvedUkName {
  // The PUBLICLY RENDERABLE name. null → the category must be excluded from the
  // UA storefront. A heuristic transformation is NEVER placed here.
  name: string | null
  source: UkNameSource
  // true when only a heuristic suggestion exists — a human must supply a real
  // Ukrainian name before this category can be shown.
  needsReview: boolean
  // The Russian source the suggestion was derived from (diagnostics only).
  russianSource: string | null
  // DIAGNOSTIC ONLY. Never rendered: not localized_name, H1, metadata, card text
  // or breadcrumb. Surfaced in the review queue so an operator can promote a
  // corrected form into CURATED_UK_CATEGORY_NAMES.
  suggestedName: string | null
}

// A stored value is a usable VERIFIED Ukrainian name when it is real, not
// code-like, not the generic phrase, and passes the SHARED robust Ukrainian
// validator (which also rejects shared-Cyrillic Russian such as
// «Металлические профили» or «Сетка абразивная»).
function verifiedUk(value: string | null | undefined): string | null {
  const v = normalizeName(value)
  if (!v || isCodeLikeName(v) || isGenericCategoryName(v)) return null
  return isVerifiedUkrainianName(v) ? v : null
}

// A usable RUSSIAN source name (input for curated mapping / diagnostic suggestion).
function usableRu(value: string | null | undefined): string | null {
  const v = normalizeName(value)
  if (!v || isCodeLikeName(v) || isGenericCategoryName(v)) return null
  return v
}

// The locale-labelled columns, in preference order. Each is only LABELLED
// Ukrainian — the value itself still has to prove it.
const UK_LABELLED_SOURCES: ReadonlyArray<[keyof UkCategoryNameSources, UkNameSource]> = [
  ['h1', 'stored_uk'],
  ['name_ua', 'stored_uk'],
  ['uk_translation', 'reviewed_uk'],
  ['supplier_name_ua', 'supplier_uk'],
]

export function resolveUkCategoryName(src: UkCategoryNameSources): ResolvedUkName {
  const none = { needsReview: false, russianSource: null, suggestedName: null }

  for (const [field, label] of UK_LABELLED_SOURCES) {
    const value = normalizeName(src[field])
    if (!value || isCodeLikeName(value) || isGenericCategoryName(value)) continue

    // An EXACT curated Russian key is checked FIRST. Otherwise a legacy Russian
    // value such as «Вентиляция» sitting in name_ua would be accepted as
    // stored_uk and the correct «Вентиляція» would never be reached.
    const curated = curatedUkCategoryName(value)
    if (curated) {
      return { name: curated, source: 'curated', needsReview: false, russianSource: value, suggestedName: null }
    }

    const verified = verifiedUk(value)
    if (verified) return { name: verified, source: label, ...none }
  }

  // Russian sources, in preference order.
  const russian =
    usableRu(src.ru_translation) ??
    usableRu(src.supplier_name) ??
    usableRu(src.supplier_name_ua) ??
    usableRu(src.name_ua) ??
    usableRu(src.h1) ??
    // A UA-labelled translation row that failed the Ukrainian check is legacy
    // Russian; it still deserves a diagnostic suggestion for the review queue.
    usableRu(src.uk_translation)

  if (russian) {
    // 4. EXACT curated mapping — the only conversion allowed to be displayed.
    const curated = curatedUkCategoryName(russian)
    if (curated) {
      return { name: curated, source: 'curated', needsReview: false, russianSource: russian, suggestedName: null }
    }
    // 5. Heuristic — DIAGNOSTIC SUGGESTION ONLY. `name` stays null so the
    //    category is excluded from the UA storefront rather than shown machine
    //    -translated copy such as «Металіческі профілі».
    return {
      name: null,
      source: 'none',
      needsReview: true,
      russianSource: russian,
      suggestedName: heuristicUkCategoryName(russian),
    }
  }

  return { name: null, source: 'none', needsReview: true, russianSource: null, suggestedName: null }
}

// The Russian display name, for diagnostics/parity checks. Never Ukrainian text.
export function resolveRuCategoryName(src: UkCategoryNameSources): string | null {
  for (const candidate of [src.ru_translation, src.supplier_name, src.name_ua, src.h1]) {
    const v = usableRu(candidate)
    if (v && !containsUkrainianOnlyLetters(v)) return v
  }
  return null
}

// ── Idempotent backfill planner (pure) ───────────────────────────────────────
// Persists ONLY a verified Ukrainian name — a curated mapping, a reviewed
// translation row, or a genuine Ukrainian supplier name. Heuristic suggestions
// are diagnostic-only and are never written, so re-running never degrades data.
export interface BackfillCategoryRow extends UkCategoryNameSources {
  id: string
  slug: string
  seo_status?: string | null
  seo_manual_lock?: boolean | null
  source?: string | null
}

export type BackfillSkip =
  | 'manual_lock'
  | 'protected_status'
  | 'manual_source'
  | 'already_valid'
  | 'needs_review'   // only a heuristic suggestion exists → never persisted
  | 'unusable'

export interface BackfillPlan {
  id: string
  slug: string
  sourceName: string | null
  proposedName: string | null
  suggestedName: string | null
  sourceType: UkNameSource
  payload: { name_ua: string } | null
  skip: BackfillSkip | null
}

export const PROTECTED_CATEGORY_SEO_STATUSES = ['sheet', 'manual']

export function planCategoryNameBackfill(row: BackfillCategoryRow): BackfillPlan {
  const resolved = resolveUkCategoryName(row)
  const common = {
    id: row.id,
    slug: row.slug,
    sourceName: resolved.russianSource,
    proposedName: resolved.name,
    suggestedName: resolved.suggestedName,
    sourceType: resolved.source,
  }

  if (row.seo_manual_lock === true) return { ...common, payload: null, skip: 'manual_lock' }
  if (row.seo_status && PROTECTED_CATEGORY_SEO_STATUSES.includes(row.seo_status)) {
    return { ...common, payload: null, skip: 'protected_status' }
  }
  if (row.source === 'manual') return { ...common, payload: null, skip: 'manual_source' }

  if (!resolved.name) {
    // A heuristic suggestion is reported for review but never written.
    return { ...common, payload: null, skip: resolved.suggestedName ? 'needs_review' : 'unusable' }
  }
  // A real Ukrainian name is already stored → never overwrite it.
  if (resolved.source === 'stored_uk') return { ...common, payload: null, skip: 'already_valid' }
  if (isGenericCategoryName(resolved.name)) return { ...common, payload: null, skip: 'unusable' }
  // Idempotent: writing the same value again is a no-op.
  if ((row.name_ua ?? '').trim() === resolved.name) return { ...common, payload: null, skip: 'already_valid' }

  return { ...common, payload: { name_ua: resolved.name }, skip: null }
}
