// ─── Scooter model landing configuration ─────────────────────────────────────
// Single source of truth for the model landing pages (/moto/skutery/[model] and
// its /ru mirror). One config + one template → no duplicated pages. Product data
// is always pulled live from the catalog (see getScooterModelProducts); there are
// NO hardcoded product id lists here.
//
// Matching is STRICT: a product qualifies for a model only if a title contains a
// full brand+model pattern or a model-specific frame code — never merely the
// brand/model word. `%` inside a token represents separator variants at the DB
// level, so the filter stays compact while pagination counts remain exact.

import type { Locale } from '@/lib/i18n'
import type { FaqItem } from '@/lib/schema'

// The supplier scooter category these products live in (task reference).
export const SCOOTER_CATEGORY_SLUG = 'na-skuter-1782704758752'

export type ModelSlug = 'honda-dio' | 'yamaha-jog' | 'suzuki-lets'
export const MODEL_SLUGS: ModelSlug[] = ['honda-dio', 'yamaha-jog', 'suzuki-lets']

export interface ScooterMod {
  slug: string        // url-safe id used in ?mod=
  label: string       // chip label shown to the user
  tokens: string[]    // compact ilike patterns that identify this modification
}

export interface ScooterModel {
  slug: ModelSlug
  brand: string
  listId: string
  listName: string
  // Compact ilike patterns that DEFINE the model. A product matches if ANY full
  // brand+model pattern or exact model-specific frame code hits a title field.
  tokens: string[]
  mods: ScooterMod[]
  h1: Record<Exclude<Locale, 'en'>, string>
  intro: Record<Exclude<Locale, 'en'>, string>
  metaTitle: Record<Exclude<Locale, 'en'>, string>
  metaDescription: Record<Exclude<Locale, 'en'>, string>
  faq: Record<Exclude<Locale, 'en'>, FaqItem[]>
}

// A modification is already AND-restricted by the base model filter, so a compact
// wildcard safely covers compact, hyphen and space forms: af18 / af-18 / af 18.
function codeSeparatorPattern(code: string): string {
  const m = code.match(/^([a-z]+)(\d+)$/i)
  if (!m) return code
  const [, letters, digits] = m
  return `${letters}%${digits}`
}

const HONDA_DIO_CODES = ['af18', 'af25', 'af27', 'af28', 'af34', 'af35']
const YAMAHA_JOG_CODES = ['3kj', 'sa36', 'sa39']

// `%` covers spaces/hyphens without enumerating them. Short model words are never
// standalone patterns, preventing false matches such as "радио" and "bullets".
// Base frame codes stay exact for paid-traffic precision; separator variants are
// still found when the title also contains a full brand+model phrase.
const HONDA_DIO_PHRASES = ['honda%dio', 'хонда%дио', 'хонда%діо']
const YAMAHA_JOG_PHRASES = ['yamaha%jog', 'ямаха%джог']
const SUZUKI_LETS_PHRASES = ['suzuki%lets', "suzuki%let's", 'сузуки%летс']

export const SCOOTER_MODELS: Record<ModelSlug, ScooterModel> = {
  'honda-dio': {
    slug: 'honda-dio',
    brand: 'Honda',
    listId: 'moto_honda_dio',
    listName: 'Honda Dio parts',
    tokens: [...HONDA_DIO_PHRASES, ...HONDA_DIO_CODES],
    mods: HONDA_DIO_CODES.map((c) => ({ slug: c, label: c.toUpperCase(), tokens: [codeSeparatorPattern(c)] })),
    h1: { uk: 'Запчастини для Honda Dio', ru: 'Запчасти для Honda Dio' },
    intro: {
      uk: 'Запчастини та витратні матеріали для скутерів Honda Dio. Асортимент оновлюється з нашого каталогу — уточнюйте сумісність за рамою (AF18–AF35) перед замовленням.',
      ru: 'Запчасти и расходники для скутеров Honda Dio. Ассортимент обновляется из нашего каталога — уточняйте совместимость по раме (AF18–AF35) перед заказом.',
    },
    metaTitle: {
      uk: 'Запчастини для Honda Dio (AF18–AF35)',
      ru: 'Запчасти для Honda Dio (AF18–AF35)',
    },
    metaDescription: {
      uk: 'Запчастини для скутера Honda Dio (AF18, AF25, AF27, AF28, AF34, AF35): підбір за моделлю та рамою. Доставка Новою Поштою по Україні, оплата при отриманні або передоплата.',
      ru: 'Запчасти для скутера Honda Dio (AF18, AF25, AF27, AF28, AF34, AF35): подбор по модели и раме. Доставка Новой Почтой по Украине, оплата при получении или предоплата.',
    },
    faq: {
      uk: [
        { question: 'Як підібрати запчастину для Honda Dio?', answer: 'Орієнтуйтеся на номер рами (AF18, AF25, AF27, AF28, AF34, AF35) та рік випуску. У картці товару вказано сумісність; якщо сумніваєтесь — залиште заявку або зателефонуйте, і ми допоможемо з підбором.' },
        { question: 'Чи підійде деталь від AF34 до AF35?', answer: 'Частина деталей взаємозамінна між поколіннями Dio, частина — ні. Уточнюйте сумісність конкретної позиції у нас перед замовленням.' },
        { question: 'Як відбувається доставка та оплата?', answer: 'Відправляємо Новою Поштою по всій Україні. Оплата — накладений платіж (при отриманні) або передоплата за домовленістю.' },
        { question: 'Чи всі товари є в наявності?', answer: 'Наявність уточнюється при підтвердженні замовлення. Ми показуємо актуальні позиції з каталогу та повідомляємо, якщо товар потрібно замовити.' },
      ],
      ru: [
        { question: 'Как подобрать запчасть для Honda Dio?', answer: 'Ориентируйтесь на номер рамы (AF18, AF25, AF27, AF28, AF34, AF35) и год выпуска. В карточке товара указана совместимость; если сомневаетесь — оставьте заявку или позвоните, и мы поможем с подбором.' },
        { question: 'Подойдёт ли деталь от AF34 к AF35?', answer: 'Часть деталей взаимозаменяема между поколениями Dio, часть — нет. Уточняйте совместимость конкретной позиции перед заказом.' },
        { question: 'Как происходит доставка и оплата?', answer: 'Отправляем Новой Почтой по всей Украине. Оплата — наложенный платёж (при получении) или предоплата по договорённости.' },
        { question: 'Все ли товары в наличии?', answer: 'Наличие уточняется при подтверждении заказа. Мы показываем актуальные позиции из каталога и сообщаем, если товар нужно заказать.' },
      ],
    },
  },
  'yamaha-jog': {
    slug: 'yamaha-jog',
    brand: 'Yamaha',
    listId: 'moto_yamaha_jog',
    listName: 'Yamaha Jog parts',
    tokens: [...YAMAHA_JOG_PHRASES, ...YAMAHA_JOG_CODES],
    mods: YAMAHA_JOG_CODES.map((c) => ({ slug: c, label: c.toUpperCase(), tokens: [codeSeparatorPattern(c)] })),
    h1: { uk: 'Запчастини для Yamaha Jog', ru: 'Запчасти для Yamaha Jog' },
    intro: {
      uk: 'Запчастини та витратні матеріали для скутерів Yamaha Jog. Асортимент оновлюється з нашого каталогу — уточнюйте модифікацію (3KJ, SA36, SA39) перед замовленням.',
      ru: 'Запчасти и расходники для скутеров Yamaha Jog. Ассортимент обновляется из нашего каталога — уточняйте модификацию (3KJ, SA36, SA39) перед заказом.',
    },
    metaTitle: {
      uk: 'Запчастини для Yamaha Jog (3KJ, SA36, SA39)',
      ru: 'Запчасти для Yamaha Jog (3KJ, SA36, SA39)',
    },
    metaDescription: {
      uk: 'Запчастини для скутера Yamaha Jog (3KJ, SA36, SA39): підбір за модифікацією. Доставка Новою Поштою по Україні, оплата при отриманні або передоплата.',
      ru: 'Запчасти для скутера Yamaha Jog (3KJ, SA36, SA39): подбор по модификации. Доставка Новой Почтой по Украине, оплата при получении или предоплата.',
    },
    faq: {
      uk: [
        { question: 'Як підібрати запчастину для Yamaha Jog?', answer: 'Орієнтуйтеся на модифікацію (3KJ, SA36, SA39) та тип двигуна. У картці товару вказано сумісність; за потреби залиште заявку — допоможемо з підбором.' },
        { question: 'Чим відрізняються 3KJ та SA36/SA39?', answer: 'Це різні покоління Jog з відмінностями в рамі та двигуні. Частина деталей взаємозамінна, частина — ні; уточнюйте по конкретній позиції.' },
        { question: 'Як відбувається доставка та оплата?', answer: 'Відправляємо Новою Поштою по всій Україні. Оплата — накладений платіж (при отриманні) або передоплата за домовленістю.' },
        { question: 'Чи всі товари є в наявності?', answer: 'Наявність уточнюється при підтвердженні замовлення. Ми показуємо актуальні позиції з каталогу.' },
      ],
      ru: [
        { question: 'Как подобрать запчасть для Yamaha Jog?', answer: 'Ориентируйтесь на модификацию (3KJ, SA36, SA39) и тип двигателя. В карточке товара указана совместимость; при необходимости оставьте заявку — поможем с подбором.' },
        { question: 'Чем отличаются 3KJ и SA36/SA39?', answer: 'Это разные поколения Jog с отличиями в раме и двигателе. Часть деталей взаимозаменяема, часть — нет; уточняйте по конкретной позиции.' },
        { question: 'Как происходит доставка и оплата?', answer: 'Отправляем Новой Почтой по всей Украине. Оплата — наложенный платёж (при получении) или предоплата по договорённости.' },
        { question: 'Все ли товары в наличии?', answer: 'Наличие уточняется при подтверждении заказа. Мы показываем актуальные позиции из каталога.' },
      ],
    },
  },
  'suzuki-lets': {
    slug: 'suzuki-lets',
    brand: 'Suzuki',
    listId: 'moto_suzuki_lets',
    listName: 'Suzuki Lets parts',
    // Base = brand+model phrase only (no standalone "lets"). Mod tokens are applied
    // ON TOP of the base match (AND), so "lets 2" only ever narrows an already
    // Suzuki-Lets product — it can never false-match "bullets 2" on its own.
    tokens: [...SUZUKI_LETS_PHRASES],
    mods: [
      { slug: 'lets-2', label: 'Lets 2', tokens: ['lets%2', 'летс%2'] },
      { slug: 'lets-4', label: 'Lets 4', tokens: ['lets%4', 'летс%4'] },
      { slug: 'lets-5', label: 'Lets 5', tokens: ['lets%5', 'летс%5'] },
    ],
    h1: { uk: 'Запчастини для Suzuki Lets', ru: 'Запчасти для Suzuki Lets' },
    intro: {
      uk: 'Запчастини та витратні матеріали для скутерів Suzuki Lets. Асортимент оновлюється з нашого каталогу — уточнюйте модифікацію (Lets 2, Lets 4, Lets 5) перед замовленням.',
      ru: 'Запчасти и расходники для скутеров Suzuki Lets. Ассортимент обновляется из нашего каталога — уточняйте модификацию (Lets 2, Lets 4, Lets 5) перед заказом.',
    },
    metaTitle: {
      uk: 'Запчастини для Suzuki Lets (Lets 2, 4, 5)',
      ru: 'Запчасти для Suzuki Lets (Lets 2, 4, 5)',
    },
    metaDescription: {
      uk: 'Запчастини для скутера Suzuki Lets (Lets 2, Lets 4, Lets 5): підбір за модифікацією. Доставка Новою Поштою по Україні, оплата при отриманні або передоплата.',
      ru: 'Запчасти для скутера Suzuki Lets (Lets 2, Lets 4, Lets 5): подбор по модификации. Доставка Новой Почтой по Украине, оплата при получении или предоплата.',
    },
    faq: {
      uk: [
        { question: 'Як підібрати запчастину для Suzuki Lets?', answer: 'Орієнтуйтеся на модифікацію (Lets 2, Lets 4, Lets 5) та об’єм двигуна. У картці товару вказано сумісність; за потреби залиште заявку — допоможемо з підбором.' },
        { question: 'Чи взаємозамінні деталі між Lets 2, 4 і 5?', answer: 'Частина деталей спільна для лінійки Lets, частина відрізняється. Уточнюйте сумісність конкретної позиції перед замовленням.' },
        { question: 'Як відбувається доставка та оплата?', answer: 'Відправляємо Новою Поштою по всій Україні. Оплата — накладений платіж (при отриманні) або передоплата за домовленістю.' },
        { question: 'Чи всі товари є в наявності?', answer: 'Наявність уточнюється при підтвердженні замовлення. Ми показуємо актуальні позиції з каталогу.' },
      ],
      ru: [
        { question: 'Как подобрать запчасть для Suzuki Lets?', answer: 'Ориентируйтесь на модификацию (Lets 2, Lets 4, Lets 5) и объём двигателя. В карточке товара указана совместимость; при необходимости оставьте заявку — поможем с подбором.' },
        { question: 'Взаимозаменяемы ли детали между Lets 2, 4 и 5?', answer: 'Часть деталей общая для линейки Lets, часть отличается. Уточняйте совместимость конкретной позиции перед заказом.' },
        { question: 'Как происходит доставка и оплата?', answer: 'Отправляем Новой Почтой по всей Украине. Оплата — наложенный платёж (при получении) или предоплата по договорённости.' },
        { question: 'Все ли товары в наличии?', answer: 'Наличие уточняется при подтверждении заказа. Мы показываем актуальные позиции из каталога.' },
      ],
    },
  },
}

export function getScooterModel(slug: string): ScooterModel | null {
  return (SCOOTER_MODELS as Record<string, ScooterModel>)[slug] ?? null
}
