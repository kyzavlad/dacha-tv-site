import { normaliseRecipientNames, type RecipientNames } from './recipient-name'

// Editable pronunciation-based draft, never an identity lookup or supplier
// validator. Reverse transliteration is ambiguous (Koval is not proof of Коваль).
// The buyer must check the result against their delivery documents.
const pairs: Record<string, string> = {
  shch: 'щ', sch: 'щ', iia: 'ія', zh: 'ж', kh: 'х', ts: 'ц', ch: 'ч',
  sh: 'ш', ye: 'є', yi: 'ї', yu: 'ю', ya: 'я', ii: 'ій',
}
const letters: Record<string, string> = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'г',
  i: 'і', j: 'й', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
  q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс', y: 'и', z: 'з',
}
function draftField(value: string): string {
  if (!/^[A-Za-z]+(?:['’ʼ -][A-Za-z]+)*$/.test(value.trim())) return value
  return value.trim().replace(/[A-Za-z]+/g, word => {
    const lower = word.toLowerCase()
    let result = ''
    for (let i = 0; i < lower.length;) {
      const pair = Object.keys(pairs).find(key => lower.startsWith(key, i))
      result += pair ? pairs[pair] : letters[lower[i]]
      i += pair?.length ?? 1
    }
    return /^[A-Z]/.test(word) ? result[0].toUpperCase() + result.slice(1) : result
  })
}
export function recipientNamePreview(input: RecipientNames) {
  const normalized = normaliseRecipientNames(input)
  if (normalized.ok) return { ...normalized, changed: normalized.firstName !== input.firstName || normalized.lastName !== input.lastName, approximate: false }
  const draft = normaliseRecipientNames({ firstName: draftField(input.firstName), lastName: draftField(input.lastName), patronymic: input.patronymic ? draftField(input.patronymic) : undefined })
  return { ...draft, changed: draft.ok && (draft.firstName !== input.firstName || draft.lastName !== input.lastName), approximate: draft.ok }
}
