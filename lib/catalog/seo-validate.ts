// ─── SEO quality validation (Business Campus principle) ───────────────────────
// Shared, dependency-free validators used by the Google-Sheets SEO importers
// (and reusable by any other writer) to guarantee that nothing low-quality ever
// reaches a published meta field.
//
// Business Campus rules enforced here:
//   • the buyer understands the page immediately — so: no raw technical slugs
//     (cat-38853), no HTML markup, no empty strings;
//   • no BS / no fake claims — so: no medical / "100% guarantee" / "best in the
//     world" style copy;
//   • practical and clean — so: sane length windows and no keyword-stuffing spam.
//
// Length policy: soft windows are advisory (a value outside them is still
// accepted), hard caps are blocking (a value past them is rejected so the human
// fixes the sheet rather than us silently truncating into awkward copy).

export const META_TITLE_SOFT_MIN = 35
export const META_TITLE_SOFT_MAX = 65
export const META_TITLE_HARD_MAX = 70

export const META_DESC_SOFT_MIN = 120
export const META_DESC_SOFT_MAX = 170
export const META_DESC_HARD_MAX = 180

export const KEYWORDS_HARD_MAX = 255

// Fake-guarantee / medical / superlative claims. Conservative on purpose — only
// patterns that are clearly unsupportable marketing BS, not ordinary product
// language.
// NOTE: JS `\w` does NOT match Cyrillic letters, so a stem that must reach a
// FOLLOWING word (e.g. "найкращ… ціна") uses the Cyrillic-aware class `W` below
// instead of `\w*` — otherwise the inflected suffix ("а") is never consumed and
// the phrase slips through. Stems with no required following word (e.g. a bare
// "чудодійн…") can keep `\w*` since `\w*` matching zero chars is enough.
const W = '[\\wа-яіїєґё]*' // Latin OR Cyrillic word continuation
const re = (body: string) => new RegExp(body.replace(/W\*/g, W), 'i')

const BANNED_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b100\s*%\s*гарант/i,                          label: '«100% гарантія»' },
  { re: re('гарантW*\\s+здоров'),                       label: "гарантія здоров'я" },
  { re: /(виліков\w*|зцілю\w*|лікує|оздоровлю\w* повніст)/i, label: 'медичні твердження' },
  { re: /(чудодійн|магічн)\w*/i,                        label: '«чудодійний / магічний»' },
  { re: re('найкращW*\\s+(в|у)\\s+(світі|україні)'),    label: '«найкращий у світі/Україні»' },
  { re: re('найкращW*\\s+цінW*'),                       label: '«найкраща ціна» (заборонена фраза)' },
  { re: re('найнижчW*\\s+цінW*'),                       label: '«найнижча ціна» (заборонена фраза)' },
  { re: /№\s*1\s+(в|у)\s+(світі|україні)/i,             label: '«№1 у світі/Україні»' },
  { re: /абсолютно\s+безпечн\w*/i,                      label: '«абсолютно безпечно»' },
  { re: re('схуднW*\\s+(за|на)\\s+\\d'),                label: 'обіцянки схуднення' },
  // Russian fake-claim patterns from supplier sheets
  { re: re('лучшW*\\s+ценW*'),                          label: '«лучшая цена» (заборонена фраза)' },
  { re: re('по\\s+лучшW*\\s+ценW*'),                    label: '«по лучшей цене» (заборонена фраза)' },
  { re: /самы[йм]\s+лучш\w*/i,                          label: '«самый лучший» (заборонена фраза)' },
  { re: /гарантия\s+качества/i,                          label: '«гарантия качества» (заборонена фраза)' },
]

// Collapse whitespace + trim. Does NOT strip HTML (callers decide).
// Defensive: a non-string input (array/object/number from an AI/n8n payload) is
// treated as empty rather than throwing "…replace is not a function". Every text
// validator funnels its raw value through here, so this single guard makes the
// whole validation layer safe against malformed JSON values.
export function collapse(s: unknown): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
}

// Strip HTML tags + decode-ish entities to spaces, then collapse. Used for
// long-form description fields where the sheet may legitimately carry markup
// that we want to drop rather than reject. Non-string → '' (never throws).
export function stripHtml(s: unknown): string {
  if (typeof s !== 'string') return ''
  return collapse(s.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' '))
}

export function hasHtml(s: string): boolean {
  return /<[^>]+>/.test(s) || /&[a-z]+;/i.test(s)
}

// Raw technical category slug like cat-38853, cat_185, or a bare leaked id.
export function hasCatSlug(s: string): boolean {
  return /\bcat[-_]?\d+\b/i.test(s)
}

// Keyword-stuffing: the same 4+ char token repeated 5+ times.
export function hasSpammyRepetition(s: string): boolean {
  if (typeof s !== 'string') return false
  const words = s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []
  const counts = new Map<string, number>()
  for (const w of words) {
    const n = (counts.get(w) ?? 0) + 1
    counts.set(w, n)
    if (n >= 5) return true
  }
  return false
}

export function bannedClaim(s: string): string | null {
  for (const { re, label } of BANNED_PATTERNS) if (re.test(s)) return label
  return null
}

export interface FieldValidation {
  ok: boolean
  reasons: string[] // human-readable Ukrainian reasons, empty when ok
}

// Ukrainian-language gate for AI-generated copy. Ukrainian uses і/ї/є/ґ and NEVER
// the Russian-only letters ы/э/ъ/ё — so their presence is a reliable "this is
// Russian, not Ukrainian" signal. Also requires Cyrillic to dominate over Latin
// so an English/transliterated string is rejected. Conservative: a clean
// Ukrainian value always passes; only clearly non-Ukrainian copy is blocked.
export function validateUkrainianText(raw: string | null | undefined): FieldValidation {
  const v = collapse(raw)
  const reasons: string[] = []
  if (!v) return { ok: false, reasons: ['порожній текст'] }
  const cyr = (v.match(/[а-яіїєґ]/gi) ?? []).length
  const lat = (v.match(/[a-z]/gi) ?? []).length
  const letters = cyr + lat
  if (letters === 0) reasons.push('немає літер')
  else if (cyr / letters < 0.5) reasons.push('текст переважно не кирилицею (очікується українська)')
  if (/[ыэъё]/i.test(v)) reasons.push('містить російські літери (ы/э/ъ/ё) — очікується українська')
  return { ok: reasons.length === 0, reasons }
}

// Checks common to every text field.
function commonChecks(value: string, reasons: string[]): void {
  if (hasHtml(value)) reasons.push('містить HTML')
  if (hasCatSlug(value)) reasons.push('містить технічний slug (cat-NNN)')
  if (hasSpammyRepetition(value)) reasons.push('повтор слів (keyword stuffing)')
  const claim = bannedClaim(value)
  if (claim) reasons.push(`недопустиме твердження: ${claim}`)
}

export function validateMetaTitle(raw: string | null | undefined): FieldValidation {
  const v = collapse(raw)
  const reasons: string[] = []
  if (!v) return { ok: false, reasons: ['порожній meta_title'] }
  if (v.length > META_TITLE_HARD_MAX) reasons.push(`meta_title задовгий (${v.length} > ${META_TITLE_HARD_MAX})`)
  commonChecks(v, reasons)
  return { ok: reasons.length === 0, reasons }
}

export function validateMetaDescription(raw: string | null | undefined): FieldValidation {
  const v = collapse(raw)
  const reasons: string[] = []
  if (!v) return { ok: false, reasons: ['порожній meta_description'] }
  if (v.length > META_DESC_HARD_MAX) reasons.push(`meta_description задовгий (${v.length} > ${META_DESC_HARD_MAX})`)
  commonChecks(v, reasons)
  return { ok: reasons.length === 0, reasons }
}

export function validateKeywords(raw: string | null | undefined): FieldValidation {
  const v = collapse(raw)
  const reasons: string[] = []
  if (!v) return { ok: false, reasons: ['порожні keywords'] }
  if (v.length > KEYWORDS_HARD_MAX) reasons.push(`keywords задовгі (${v.length} > ${KEYWORDS_HARD_MAX})`)
  if (hasHtml(v)) reasons.push('містить HTML')
  if (hasCatSlug(v)) reasons.push('містить технічний slug (cat-NNN)')
  return { ok: reasons.length === 0, reasons }
}

// Long-form description: HTML is stripped (not rejected). Returns the cleaned
// value so callers write the sanitised text, not the raw markup.
export function validateDescription(raw: string | null | undefined): FieldValidation & { value: string } {
  const v = stripHtml(raw)
  const reasons: string[] = []
  if (!v) return { ok: false, reasons: ['порожній опис'], value: '' }
  if (v.length < 20) reasons.push('опис надто короткий (<20)')
  if (hasCatSlug(v)) reasons.push('містить технічний slug (cat-NNN)')
  const claim = bannedClaim(v)
  if (claim) reasons.push(`недопустиме твердження: ${claim}`)
  return { ok: reasons.length === 0, reasons, value: v }
}
