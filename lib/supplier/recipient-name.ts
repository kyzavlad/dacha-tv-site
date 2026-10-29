// Shared by checkout, the Server Action and the supplier boundary. Normalise
// typography, not language: never transliterate a Latin name or guess a name.
export interface RecipientNames {
  firstName: string
  lastName: string
  patronymic?: string | null
}

const lookalikes: Record<string, string> = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М',
  O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У', a: 'а', c: 'с', e: 'е',
  i: 'і', o: 'о', p: 'р', x: 'х', y: 'у',
}
const cyrillicLetter = /(?=\p{L})\p{Script=Cyrillic}/u
const name = /^(?:(?=\p{L})\p{Script=Cyrillic})+(?:['-](?:(?=\p{L})\p{Script=Cyrillic})+)*$/u

function clean(value: string): string {
  return value.normalize('NFC').replace(/[\u00a0\u202f]/g, ' ').trim()
    .replace(/ +/g, ' ').replace(/[’ʼ]/g, "'").replace(/[\u2010\u2011]/g, '-')
    .split(' ').map(word => cyrillicLetter.test(word)
      ? word.replace(/[A-Za-z]/g, char => lookalikes[char] ?? char)
      : word).join(' ')
}

export function normaliseRecipientNames(input: RecipientNames) {
  let firstName = clean(input.firstName)
  const lastName = clean(input.lastName)
  const patronymic = clean(input.patronymic ?? '')
  const errors: Partial<Record<keyof RecipientNames, string[]>> = {}

  // A browser autofill can put "first last" in firstName
  // while also filling lastName. Remove ONLY that exact separately supplied
  // surname, and ONLY if a single valid first-name token remains.
  const parts = firstName.split(' ')
  if (parts.length === 2 && name.test(lastName)) {
    if (parts[1].toLocaleLowerCase('uk') === lastName.toLocaleLowerCase('uk') && name.test(parts[0])) firstName = parts[0]
  }
  for (const [field, value] of Object.entries({ firstName, lastName, patronymic })) {
    if (field === 'patronymic' && !value) continue
    if (value.length < 2 || value.length > 80 || !name.test(value)) {
      errors[field as keyof RecipientNames] = [field === 'firstName'
        ? 'Введіть лише ім’я кирилицею, без прізвища та по батькові.'
        : field === 'lastName' ? 'Введіть лише прізвище кирилицею.' : 'Введіть лише по батькові кирилицею.']
    }
  }
  return { ok: Object.keys(errors).length === 0, firstName, lastName, patronymic, errors }
}
