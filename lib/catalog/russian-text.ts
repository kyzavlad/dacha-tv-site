// ─── Shared Russian-vs-Ukrainian text detection (ONE validator) ──────────────
// Extracted from lib/supabase/catalog.ts so the storefront localization and the
// category-name resolver use the SAME guard — a second, weaker validator would
// let Russian copy reach the Ukrainian storefront.
//
// Two layers:
//   1. Russian-only letters (ы/э/ъ/ё) — unambiguous.
//   2. Shared-Cyrillic Russian: names like «Металлические профили» or
//      «Сетка абразивная» use only letters Ukrainian also has. They are caught by
//      Russian storefront vocabulary plus Russian-only inflection endings.
//      Ukrainian never forms adjectives with -ая/-яя/-ое/-ее/-ую/-юю/-ые/-ие/
//      -ой/-ый (it uses -а/-е/-і/-ий/-ої), so those endings are reliable
//      markers. -ий is deliberately EXCLUDED: it is valid Ukrainian
//      («Ручний», «Садовий»).

export function containsRussianOnlyLetters(value: string | null | undefined): boolean {
  return /[ыэъё]/i.test(value ?? '')
}

export function containsUkrainianOnlyLetters(value: string | null | undefined): boolean {
  return /[іїєґ]/i.test(value ?? '')
}

// Russian supplier/storefront vocabulary that carries no Russian-only letters.
export const RUSSIAN_STOREFRONT_WORDS = new Set([
  'сетка',
  'лента',
  'шкурка',
  'наждачная',
  'точильный',
  'двухсторонний',
  'шлифовальная',
  'закажите',
  'купить',
  'цена',
  'наличие',
  'стоимость',
  'украине',
  'описание',
  'подробнее',
  // Additional Russian-ONLY noun forms seen in supplier category names. Words
  // spelled identically in Ukrainian (колодки, масла, частини…) must NOT be
  // listed here — the Russian phrases that contain them are already caught by
  // their adjective endings («Моторные масла», «Запасные части»).
  'свечи',
  'зажигания',
])

// Inflection endings that exist in Russian but not in Ukrainian.
const RUSSIAN_ONLY_ENDINGS = /(?:ая|яя|ое|ее|ую|юю|ые|ие|ой|ый)$/

export function containsLikelyRussianWords(value: string | null | undefined): boolean {
  const tokens = (value ?? '').toLowerCase().match(/[а-яёіїєґ]+/g) ?? []
  return tokens.some((token) =>
    RUSSIAN_STOREFRONT_WORDS.has(token) ||
    (token.length >= 4 && RUSSIAN_ONLY_ENDINGS.test(token)),
  )
}

// The single question every caller actually asks: "is this real Ukrainian text?"
// Empty/blank is not Ukrainian text.
export function isUkrainianText(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  if (!v) return false
  return !containsRussianOnlyLetters(v) && !containsLikelyRussianWords(v)
}
