// Manual catalog content — single source of truth for the hand-curated products
// and categories that live alongside the supplier API catalog in /catalog.
//
// All copy is Ukrainian. Natural-product wording is intentionally safe: it never
// claims to treat, cure or prevent disease. Phrases used: «натуральний продукт»,
// «традиційно використовується», «може бути частиною щоденного раціону»,
// «не є лікарським засобом».
//
// Slugs are stable — the seeder upserts by slug, so re-running never duplicates.

export type ManualLeadType = 'natural_products' | 'metal'

export interface ManualCategorySeed {
  slug: string
  name_ua: string
  description: string
  meta_title: string
  meta_description: string
  lead_type: ManualLeadType
  display_order: number
  // Pinned position on /catalog: metal (1) first, before all supplier categories.
  sort_order: number
  // Whether the category shows as a /catalog card. Only the metal category is
  // published in /catalog; natural/food categories are unpublished here and
  // their products are presented under /products instead.
  is_published: boolean
}

export interface ManualProductSeed {
  slug: string
  category_slug: string
  name_ua: string
  short_description: string
  description: string
  meta_title: string
  meta_description: string
  price_uah: number | null
  price_prefix: string | null   // e.g. "від"
  unit_label: string | null     // e.g. "грн/кг", "грн/250 мл", "грн/м²"
  inquiry_only: boolean
  lead_type: ManualLeadType
  options: Record<string, string | string[]> | null
  display_order: number
}

const NOT_MEDICINE =
  'Натуральний продукт. Не є лікарським засобом. Перед змінами у щоденному раціоні за потреби порадьтеся з фахівцем.'

// Direct order phone for metal/building-materials leads. Shown on metal product
// pages and embedded in delivery copy so it is present in DB content too.
export const METAL_PHONE = '+380996480485'

const METAL_DELIVERY =
  `Замовлення та консультація: ${METAL_PHONE}. Доставка по Харківській та Полтавській областях — за домовленістю. Інші регіони — за індивідуальною домовленістю. Самовивіз і наявність — за підтвердженням.`

const METAL_COLORS = [
  'коричневий',
  'зелений',
  'сірий',
  'графіт',
  'дерево',
  'золотий дуб',
  'темний дуб',
  'інші кольори — під замовлення',
]

// ─── Categories ────────────────────────────────────────────────────────────

export const MANUAL_CATEGORIES: ManualCategorySeed[] = [
  {
    slug: 'naturalni-produkty',
    name_ua: 'Натуральні продукти',
    description:
      'Жимолость, ферментований Іван-чай, сортовий часник, медовий шоколад та саджанці від господарства. Натуральні продукти з доставкою Новою Поштою.',
    meta_title: 'Натуральні продукти — жимолость, Іван-чай, саджанці, часник',
    meta_description:
      'Натуральні продукти від господарства: органічна жимолость, ферментований Іван-чай, сортовий озимий часник, саджанці та медовий шоколад. Доставка по Україні.',
    lead_type: 'natural_products',
    display_order: 1,
    sort_order: 2,
    is_published: false,
  },
  {
    slug: 'zhyvi-olii-holodnogo-vidzhymu',
    name_ua: 'Живі олії холодного віджиму',
    description:
      'Свіжі нерафіновані олії холодного віджиму у скляній тарі, виготовлення під замовлення. Гарбузова, конопляна, рижієва, кунжутна, лляна, кедрова та інші.',
    meta_title: 'Живі олії холодного віджиму — свіжі нерафіновані олії',
    meta_description:
      'Свіжі олії холодного віджиму у скляній тарі: гарбузова, конопляна, рижієва, кунжутна, лляна, кедрова, соняшникова, олія волоського горіха. Виготовлення під замовлення.',
    lead_type: 'natural_products',
    display_order: 2,
    sort_order: 3,
    is_published: false,
  },
  {
    slug: 'podarunkovi-nabory',
    name_ua: 'Подарункові набори',
    description:
      'Подарункові набори з наших продуктів: липовий мед, шоколад на меду та масло холодного віджиму. ' +
      'Склад і пакування узгоджуємо під ваше замовлення.',
    meta_title: 'Подарункові набори — мед, шоколад на меду, масло',
    meta_description:
      'Подарункові набори від господарства Дача TV: мед + шоколад, мед + масло, мед + шоколад + масло. Склад і пакування під замовлення.',
    lead_type: 'natural_products',
    display_order: 3,
    sort_order: 4,
    is_published: false,
  },
  {
    slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Металопрофіль, покрівля та комплектуючі',
    description:
      'Продаж профнастилу, металочерепиці, металевого штахетника, добірних елементів та саморізів. Виготовлення під розмір, доставка по Харківській та Полтавській області за домовленістю.',
    meta_title: 'Металопрофіль, металочерепиця, штахетник та комплектуючі',
    meta_description:
      'Продаж профнастилу, металочерепиці, металевого штахетника, добірних елементів та саморізів. Виготовлення під розмір, доставка по Харківській та Полтавській області за домовленістю.',
    lead_type: 'metal',
    display_order: 3,
    sort_order: 1,
    is_published: true,
  },
]

// ─── Natural products ────────────────────────────────────────────────────────

const NATURAL_PRODUCTS: ManualProductSeed[] = [
  {
    slug: 'zhymolost-organichna-svizha',
    category_slug: 'naturalni-produkty',
    name_ua: 'Жимолость органічна свіжа',
    short_description: 'Свіжа органічна жимолость без обробки хімією — ягода з власного господарства.',
    description:
      'Свіжа жимолость, вирощена екологічно: з мульчуванням, поливом і обрізкою, без обробки хімічними засобами. ' +
      'Ніжна ягода з приємною кислинкою, яка може бути частиною щоденного раціону. ' +
      'Збір — орієнтовно з 20 червня, відправляємо свіжою одразу після збору.\n\n' +
      'Пакування: контейнери 0,5 л, приблизно 300–350 г у кожному. Доставка — Нова Пошта. Оплата — на рахунок ФОП.\n\n' +
      NOT_MEDICINE,
    meta_title: 'Жимолость свіжа органічна — купити ягоду з господарства',
    meta_description:
      'Свіжа органічна жимолость без хімічної обробки, 500 грн/кг. Контейнери 0,5 л (~300–350 г). Збір з 20 червня, доставка Новою Поштою.',
    price_uah: 500,
    price_prefix: null,
    unit_label: 'грн/кг',
    inquiry_only: false,
    lead_type: 'natural_products',
    options: {
      'Пакування': 'Контейнери 0,5 л, приблизно 300–350 г',
      'Наявність': 'Орієнтовно з 20 червня',
      'Вирощування': 'Екологічне: мульчування, полив, обрізка, без хімічної обробки',
      'Доставка': 'Нова Пошта',
      'Оплата': 'На рахунок ФОП',
    },
    display_order: 1,
  },
  {
    slug: 'sadzhantsi-zhymolosti',
    category_slug: 'naturalni-produkty',
    name_ua: 'Саджанці жимолості',
    short_description: 'Саджанці жимолості різного віку та сортів — викопані та в контейнерах.',
    description:
      'Саджанці жимолості з власного господарства. Доступні викопані рослини та саджанці у контейнерах. ' +
      'Ціна залежить від віку та сорту — від 100 до 250 грн. Наявність — восени, орієнтовно на початку–середині жовтня.\n\n' +
      'Напишіть нам, щоб уточнити доступні сорти, вік саджанців і кількість.',
    meta_title: 'Саджанці жимолості — купити з господарства',
    meta_description:
      'Саджанці жимолості різного віку та сортів: викопані та в контейнерах, від 100 грн. Наявність восени (початок–середина жовтня).',
    price_uah: 100,
    price_prefix: 'від',
    unit_label: 'грн',
    inquiry_only: true,
    lead_type: 'natural_products',
    options: {
      'Ціна': '100–250 грн залежно від віку та сорту',
      'Наявність': 'Осінь, початок–середина жовтня',
      'Формат': 'Викопані рослини та саджанці у контейнерах',
    },
    display_order: 2,
  },
  {
    slug: 'fermentovanyi-ivan-chai-krupnolystovyi',
    category_slug: 'naturalni-produkty',
    name_ua: 'Ферментований Іван-чай крупнолистовий',
    short_description: 'Якісний ферментований крупнолистовий Іван-чай — натуральний трав’яний напій.',
    description:
      'Якісний ферментований крупнолистовий Іван-чай (кипрій), зібраний і ферментований вручну. ' +
      'Натуральний трав’яний напій із м’яким смаком, який традиційно використовується для щоденного чаювання — ' +
      'із розумними перервами, як і будь-який трав’яний чай.\n\n' +
      'Фасування: 100 г. Зберігайте у щільно закритій тарі, у сухому місці без сторонніх запахів.\n\n' +
      NOT_MEDICINE,
    meta_title: 'Ферментований Іван-чай крупнолистовий — купити',
    meta_description:
      'Якісний ферментований крупнолистовий Іван-чай (кипрій), 180 грн/100 г. Натуральний трав’яний напій ручної ферментації. Доставка по Україні.',
    price_uah: 180,
    price_prefix: null,
    unit_label: 'грн/100 г',
    inquiry_only: false,
    lead_type: 'natural_products',
    options: {
      'Форма': 'Крупнолистовий, ферментований вручну',
      'Фасування': '100 г',
      'Як вживати': 'Натуральний трав’яний напій для щоденного чаювання з перервами',
    },
    display_order: 3,
  },
  {
    slug: 'sadzhantsi-ivan-chaiu-kypriiu',
    category_slug: 'naturalni-produkty',
    name_ua: 'Саджанці Іван-чаю / кипрію',
    short_description: 'Саджанці Іван-чаю (кипрію) для вирощування на власній ділянці.',
    description:
      'Саджанці Іван-чаю (кипрію) — невибаглива багаторічна рослина, з якої отримують ферментований трав’яний чай. ' +
      'Орієнтовна ціна — від 40 грн за саджанець. Напишіть нам, щоб уточнити наявність та кількість під ваше замовлення.',
    meta_title: 'Саджанці Іван-чаю (кипрію) — купити для посадки',
    meta_description:
      'Саджанці Іван-чаю (кипрію) від 40 грн. Невибаглива багаторічна рослина для отримання ферментованого трав’яного чаю. Уточнюйте наявність.',
    price_uah: 40,
    price_prefix: 'від',
    unit_label: 'грн',
    inquiry_only: true,
    lead_type: 'natural_products',
    options: {
      'Рослина': 'Кипрій (Іван-чай), багаторічна',
      'Призначення': 'Вирощування для ферментованого трав’яного чаю',
    },
    display_order: 4,
  },
  {
    slug: 'sortovyi-ozymyi-chasnyk',
    category_slug: 'naturalni-produkty',
    name_ua: 'Сортовий озимий часник',
    short_description: 'Сортовий озимий часник української та зарубіжної селекції.',
    description:
      'Сортовий озимий часник української та зарубіжної селекції — для споживання та для посадки. ' +
      'Напишіть нам, щоб уточнити доступні сорти, ціну та кількість.',
    meta_title: 'Сортовий озимий часник — купити часник на посадку',
    meta_description:
      'Сортовий озимий часник української та зарубіжної селекції. Для споживання та посадки. Уточнюйте сорти, ціну та наявність.',
    price_uah: null,
    price_prefix: null,
    unit_label: null,
    inquiry_only: true,
    lead_type: 'natural_products',
    options: {
      'Селекція': 'Українська та зарубіжна',
      'Призначення': 'Споживання та посадка',
    },
    display_order: 5,
  },
  {
    slug: 'medovyi-shokolad',
    category_slug: 'naturalni-produkty',
    name_ua: 'Шоколад на меду',
    short_description: 'Натуральний шоколад на меду, без цукру — готуємо на замовлення.',
    description:
      'Натуральний шоколад на основі какао та меду з власної пасіки, без цукру. ' +
      'Готуємо на замовлення — з різними наповнювачами: сухофрукти, ягоди, горіхи (склад узгоджуємо).\n\n' +
      'Ціна — 250 грн за плитку. Може бути приємною частиною щоденного раціону та гарним подарунком.\n\n' +
      NOT_MEDICINE,
    meta_title: 'Шоколад на меду — натуральний шоколад без цукру, 250 грн',
    meta_description:
      'Натуральний шоколад на меду з власної пасіки, без цукру — 250 грн за плитку. Готуємо на замовлення з різними наповнювачами. Доставка по Україні.',
    price_uah: 250,
    price_prefix: null,
    unit_label: 'грн',
    inquiry_only: false,
    lead_type: 'natural_products',
    options: {
      'Основа': 'Какао та мед з власної пасіки, без цукру',
      'Наповнювачі': 'Сухофрукти, ягоди, горіхи — за домовленістю',
      'Виготовлення': 'Під замовлення',
    },
    display_order: 6,
  },
]

// ─── Cold-pressed oils ───────────────────────────────────────────────────────

const OIL_INTRO =
  'Свіжа олія холодного віджиму у скляній тарі, виготовляється під замовлення. ' +
  'Мінімальне замовлення — 250 мл (окрім кедрової олії). ' +
  'Зберігайте у прохолодному місці без прямого сонця.'

function oil(
  slug: string,
  name: string,
  price: number,
  order: number,
  extraOptions: Record<string, string> = {},
  minOrder = '250 мл',
): ManualProductSeed {
  return {
    slug,
    category_slug: 'zhyvi-olii-holodnogo-vidzhymu',
    name_ua: name,
    short_description: `${name} холодного віджиму, свіжа, у скляній тарі. Виготовлення під замовлення.`,
    description:
      `${name} холодного віджиму. ${OIL_INTRO}\n\n${NOT_MEDICINE}`,
    meta_title: `${name} холодного віджиму — купити свіжу олію`,
    meta_description: `${name} холодного віджиму, ${price} грн/250 мл. Свіжа нерафінована олія у скляній тарі, виготовлення під замовлення.`,
    price_uah: price,
    price_prefix: null,
    unit_label: 'грн/250 мл',
    inquiry_only: false,
    lead_type: 'natural_products',
    options: {
      'Обʼєм': '250 мл',
      'Пакування': 'Скляна тара',
      'Виготовлення': 'Під замовлення',
      'Мінімальне замовлення': minOrder,
      ...extraOptions,
    },
    display_order: order,
  }
}

// Flagship made-to-order positioning entry for the cold-pressed oil offering.
// Distinct from the priced 250-ml bottles below: this is the "на замовлення"
// card that carries the USP (wooden press, no metal contact, any seed) and an
// «від 500 грн / 1 л» orientation price. Inquiry-only → the detail page shows the
// natural-products lead form ("Замовити / Уточнити наявність").
const OIL_ON_ORDER: ManualProductSeed = {
  slug: 'maslo-holodnogo-vidzhymu-na-zamovlennia',
  category_slug: 'zhyvi-olii-holodnogo-vidzhymu',
  name_ua: 'Масло холодного віджиму на замовлення',
  short_description:
    'Віджимаємо на деревʼяному пресі, без контакту з металом. Різні види насіння, під замовлення.',
  description:
    'Масло (олія) холодного віджиму, яке ми віджимаємо під замовлення.\n\n' +
    '• Віджимаємо на деревʼяному пресі\n' +
    '• Без контакту з металом\n' +
    '• Можна з різних видів насіння\n' +
    '• Робимо під замовлення\n' +
    '• Ціна залежить від насіння та обʼєму\n' +
    '• Орієнтир: від 500 грн / 1 л\n\n' +
    'Напишіть або зателефонуйте — уточнимо вид насіння, обʼєм і наявність.\n\n' +
    NOT_MEDICINE,
  meta_title: 'Масло холодного віджиму на замовлення — деревʼяний прес',
  meta_description:
    'Масло холодного віджиму на замовлення: віджимаємо на деревʼяному пресі, без контакту з металом, з різних видів насіння. Орієнтир — від 500 грн / 1 л.',
  price_uah: 500,
  price_prefix: 'від',
  unit_label: 'грн/л',
  inquiry_only: true,
  lead_type: 'natural_products',
  options: {
    'Технологія': 'Холодний віджим на деревʼяному пресі',
    'Без контакту з металом': 'Так',
    'Насіння': 'Різні види — за вашим вибором',
    'Виготовлення': 'Під замовлення',
    'Ціна': 'Залежить від насіння та обʼєму, орієнтир — від 500 грн / 1 л',
  },
  display_order: 0,
}

const OIL_PRODUCTS: ManualProductSeed[] = [
  OIL_ON_ORDER,
  oil('harbuzova-oliia', 'Гарбузова олія', 400, 1),
  oil('konopliana-oliia', 'Конопляна олія', 400, 2),
  oil('ryzhiieva-oliia', 'Рижієва олія', 450, 3),
  oil('kunzhutna-oliia', 'Кунжутна олія', 400, 4),
  oil('oliia-voloskoho-horikha', 'Олія волоського горіха', 300, 5),
  oil('soniashnykova-oliia', 'Соняшникова олія', 180, 6),
  oil('lliana-oliia', 'Лляна олія', 220, 7),
  oil('kedrova-oliia', 'Кедрова олія', 1400, 8, { 'Особливість': 'Преміальна олія' }, '100 мл'),
]

// ─── Metal / construction materials ──────────────────────────────────────────

function profnastil(slug: string, name: string, order: number): ManualProductSeed {
  return {
    slug,
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: name,
    short_description: `${name} з турецького або вʼєтнамського металу. Різні кольори, від 286 грн/м².`,
    description:
      `${name}. Доступний у двох варіантах металу — оберіть під свій бюджет та задачу.\n\n` +
      '• Турецький метал: товщина 0,47 мм, цинк 230 г/м² — 310 грн/м²\n' +
      '• Вʼєтнамський метал: товщина 0,45 мм, цинк 180 г/м² — 286 грн/м²\n\n' +
      `Кольори: ${METAL_COLORS.join(', ')}.\n\n${METAL_DELIVERY}\n\n` +
      'Напишіть нам розміри та бажаний колір — порахуємо вартість під ваше замовлення.',
    meta_title: `${name} — купити профнастил, ціна за м²`,
    meta_description: `${name}: турецький (0,47 мм, цинк 230 г/м²) — 310 грн/м², вʼєтнамський (0,45 мм, цинк 180 г/м²) — 286 грн/м². Різні кольори, виготовлення під розмір.`,
    price_uah: 286,
    price_prefix: 'від',
    unit_label: 'грн/м²',
    inquiry_only: true,
    lead_type: 'metal',
    options: {
      'Турецький метал': '0,47 мм, цинк 230 г/м² — 310 грн/м²',
      'Вʼєтнамський метал': '0,45 мм, цинк 180 г/м² — 286 грн/м²',
      'Кольори': METAL_COLORS,
      'Доставка': METAL_DELIVERY,
    },
    display_order: order,
  }
}

const METAL_PRODUCTS: ManualProductSeed[] = [
  profnastil('profnastyl-hvylia-10', 'Профнастил хвиля 10', 1),
  profnastil('profnastyl-hvylia-20', 'Профнастил хвиля 20', 2),
  profnastil('profnastyl-hvylia-35', 'Профнастил хвиля 35', 3),
  {
    slug: 'profnastyl-hvylia-8-biudzhetnyi',
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Профнастил хвиля 8 бюджетний',
    short_description: 'Бюджетний профнастил хвиля 8, товщина 0,20 мм, ширина 1 м — 173 грн/м².',
    description:
      'Бюджетний профнастил хвиля 8 — економний варіант для тимчасових і допоміжних конструкцій, парканів та зашивки.\n\n' +
      '• Товщина: 0,20 мм\n• Ширина: 1 м\n• Матеріал: бюджетний рулон\n\n' +
      `${METAL_DELIVERY}`,
    meta_title: 'Профнастил хвиля 8 бюджетний — 173 грн/м²',
    meta_description:
      'Бюджетний профнастил хвиля 8, товщина 0,20 мм, ширина 1 м — 173 грн/м². Економний варіант для парканів та зашивки. Доставка за домовленістю.',
    price_uah: 173,
    price_prefix: null,
    unit_label: 'грн/м²',
    inquiry_only: false,
    lead_type: 'metal',
    options: {
      'Товщина': '0,20 мм',
      'Ширина': '1 м',
      'Матеріал': 'Бюджетний рулон',
      'Доставка': METAL_DELIVERY,
    },
    display_order: 4,
  },
  {
    slug: 'metalocherepytsia-pid-rozmir',
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Металочерепиця під розмір',
    short_description: 'Металочерепиця, виготовлена під розмір замовника — від 348 грн/м².',
    description:
      'Металочерепиця, виготовлена під розмір вашого даху. Кольори та покриття — за запитом.\n\n' +
      'Орієнтовна ціна — від 348 грн/м². Напишіть нам розміри даху та бажаний колір — порахуємо вартість.\n\n' +
      `${METAL_DELIVERY}`,
    meta_title: 'Металочерепиця під розмір — від 348 грн/м²',
    meta_description:
      'Металочерепиця під розмір замовника, від 348 грн/м². Кольори та покриття за запитом. Виготовлення під розмір, доставка за домовленістю.',
    price_uah: 348,
    price_prefix: 'від',
    unit_label: 'грн/м²',
    inquiry_only: true,
    lead_type: 'metal',
    options: {
      'Виготовлення': 'Під розмір замовника',
      'Кольори та покриття': 'За запитом',
      'Доставка': METAL_DELIVERY,
    },
    display_order: 5,
  },
  {
    slug: 'standartnyi-lyst-2-0h1-18',
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Стандартний лист 2,0 × 1,18 м',
    short_description: 'Стандартний лист металочерепиці 2,0 × 1,18 м (робоча ширина 1,15 м) — 418 грн/лист.',
    description:
      'Стандартний лист 2,0 × 1,18 м, робоча ширина — 1,15 м. Стандартні кольори: коричневий, зелений, сірий.\n\n' +
      'Ціна — 418 грн/лист.\n\n' +
      'Також у наявності можуть бути готові 2-метрові листи зі знижкою — від 260–270 грн/м² залежно від наявності. Уточнюйте.\n\n' +
      `${METAL_DELIVERY}`,
    meta_title: 'Стандартний лист 2,0 × 1,18 м — 418 грн/лист',
    meta_description:
      'Стандартний лист металочерепиці 2,0 × 1,18 м, робоча ширина 1,15 м — 418 грн/лист. Кольори: коричневий, зелений, сірий. Готові листи зі знижкою.',
    price_uah: 418,
    price_prefix: null,
    unit_label: 'грн/лист',
    inquiry_only: false,
    lead_type: 'metal',
    options: {
      'Розмір': '2,0 × 1,18 м',
      'Робоча ширина': '1,15 м',
      'Стандартні кольори': ['коричневий', 'зелений', 'сірий'],
      'Готові 2-метрові листи': 'Зі знижкою — від 260–270 грн/м² залежно від наявності',
      'Доставка': METAL_DELIVERY,
    },
    display_order: 6,
  },
  {
    slug: 'metalevyi-shtaketnyk',
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Металевий штахетник',
    short_description: 'Металевий штахетник різних форм і розмірів, широка палітра кольорів.',
    description:
      'Металевий штахетник для парканів та огорож — різні форми та розміри під ваш проєкт.\n\n' +
      `Кольори: ${METAL_COLORS.join(', ')}.\n\n` +
      'Напишіть нам довжину огорожі та бажаний колір — підберемо рішення та порахуємо вартість.\n\n' +
      `${METAL_DELIVERY}`,
    meta_title: 'Металевий штахетник — паркан з металевого штахетника',
    meta_description:
      'Металевий штахетник різних форм і розмірів для парканів. Широка палітра кольорів. Виготовлення під розмір, доставка за домовленістю.',
    price_uah: null,
    price_prefix: null,
    unit_label: null,
    inquiry_only: true,
    lead_type: 'metal',
    options: {
      'Форми та розміри': 'Різні, під проєкт',
      'Кольори': METAL_COLORS,
      'Доставка': METAL_DELIVERY,
    },
    display_order: 7,
  },
  {
    slug: 'dobirni-elementy-pokrivlia-fasad',
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Добірні елементи для покрівлі та фасаду',
    short_description: 'Коники, кути, П-подібні профілі, планки примикання та інші елементи під розмір і колір.',
    description:
      'Добірні (комплектуючі) елементи для покрівлі та фасаду, виготовлені під ваш колір і розмір:\n\n' +
      '• коники\n• кути\n• П-подібні профілі\n• планки примикання до стіни\n• інші елементи під замовлення\n\n' +
      'Напишіть нам перелік потрібних елементів і розміри — виготовимо під ваш об’єкт.\n\n' +
      `${METAL_DELIVERY}`,
    meta_title: 'Добірні елементи для покрівлі та фасаду — під розмір',
    meta_description:
      'Добірні елементи для покрівлі та фасаду: коники, кути, П-подібні профілі, планки примикання. Виготовлення під колір і розмір, доставка за домовленістю.',
    price_uah: null,
    price_prefix: null,
    unit_label: null,
    inquiry_only: true,
    lead_type: 'metal',
    options: {
      'Елементи': ['коники', 'кути', 'П-подібні профілі', 'планки примикання', 'інші — під замовлення'],
      'Виготовлення': 'Під колір і розмір',
      'Доставка': METAL_DELIVERY,
    },
    display_order: 8,
  },
  {
    slug: 'pokrivelni-samorizy-korotki',
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Покрівельні саморізи короткі',
    short_description: 'Покрівельні саморізи короткі — 310 грн/упаковка. Доступний підбір кольору.',
    description:
      'Покрівельні саморізи короткі для монтажу профнастилу та металочерепиці. Доступний підбір кольору під ваш матеріал.\n\n' +
      'Ціна — 310 грн/упаковка.\n\n' +
      `${METAL_DELIVERY}`,
    meta_title: 'Покрівельні саморізи короткі — 310 грн/упаковка',
    meta_description:
      'Покрівельні саморізи короткі для профнастилу та металочерепиці — 310 грн/упаковка. Підбір кольору. Доставка за домовленістю.',
    price_uah: 310,
    price_prefix: null,
    unit_label: 'грн/упаковка',
    inquiry_only: false,
    lead_type: 'metal',
    options: {
      'Підбір кольору': 'Доступний',
      'Доставка': METAL_DELIVERY,
    },
    display_order: 9,
  },
  {
    slug: 'pokrivelni-samorizy-dovhi',
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Покрівельні саморізи довгі',
    short_description: 'Покрівельні саморізи довгі — 354 грн/упаковка. Доступний підбір кольору.',
    description:
      'Покрівельні саморізи довгі для монтажу профнастилу та металочерепиці на обрешітку. Доступний підбір кольору під ваш матеріал.\n\n' +
      'Ціна — 354 грн/упаковка.\n\n' +
      `${METAL_DELIVERY}`,
    meta_title: 'Покрівельні саморізи довгі — 354 грн/упаковка',
    meta_description:
      'Покрівельні саморізи довгі для профнастилу та металочерепиці — 354 грн/упаковка. Підбір кольору. Доставка за домовленістю.',
    price_uah: 354,
    price_prefix: null,
    unit_label: 'грн/упаковка',
    inquiry_only: false,
    lead_type: 'metal',
    options: {
      'Підбір кольору': 'Доступний',
      'Доставка': METAL_DELIVERY,
    },
    display_order: 10,
  },
  {
    slug: 'skladski-zalyshky-metalu',
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Складські залишки металу',
    short_description: 'Готові листи, залишки та рулонний метал — часто дешевше за стандартну ціну.',
    description:
      'Складські залишки металу: готові листи, залишки металу, рулонний метал. Малі та великі партії. ' +
      'Часто доступні дешевше за стандартну ціну.\n\n' +
      'Асортимент і ціни змінюються залежно від наявності — напишіть нам, що саме потрібно, і ми підкажемо актуальні позиції.\n\n' +
      `${METAL_DELIVERY}`,
    meta_title: 'Складські залишки металу — листи та рулони дешевше',
    meta_description:
      'Складські залишки металу: готові листи, залишки, рулонний метал, малі та великі партії. Часто дешевше за стандартну ціну. Уточнюйте наявність.',
    price_uah: null,
    price_prefix: null,
    unit_label: null,
    inquiry_only: true,
    lead_type: 'metal',
    options: {
      'Асортимент': 'Готові листи, залишки металу, рулонний метал',
      'Партії': 'Малі та великі',
      'Доставка': METAL_DELIVERY,
    },
    display_order: 11,
  },
]

// ─── Gift sets ───────────────────────────────────────────────────────────────
// Combinations of honey / honey-chocolate / cold-pressed oil. Prices vary by the
// chosen honey sort, oil seed and packaging, so these are inquiry-only (price
// null → the card shows "Уточнити ціну" and the detail page shows the natural-
// products lead form). Copy makes the "уточнити набір" intent explicit.
function giftSet(
  slug: string,
  name: string,
  contents: string,
  order: number,
): ManualProductSeed {
  return {
    slug,
    category_slug: 'podarunkovi-nabory',
    name_ua: name,
    short_description: `Подарунковий набір: ${contents}. Склад і пакування — під замовлення.`,
    description:
      `Подарунковий набір «${contents}» від нашого господарства.\n\n` +
      'Збираємо набір під замовлення: узгоджуємо сорт меду, наповнення шоколаду / вид олії та подарункове пакування. ' +
      'Напишіть або зателефонуйте — зберемо набір під ваш бюджет і уточнимо вартість та наявність.\n\n' +
      NOT_MEDICINE,
    meta_title: `${name} — подарунковий набір від Дача TV`,
    meta_description:
      `Подарунковий набір «${contents}» від господарства Дача TV. Склад і пакування під замовлення. Уточнюйте склад набору, вартість та наявність.`,
    price_uah: null,
    price_prefix: null,
    unit_label: null,
    inquiry_only: true,
    lead_type: 'natural_products',
    options: {
      'Склад': contents,
      'Пакування': 'Подарункове, за домовленістю',
      'Виготовлення': 'Збираємо під замовлення',
    },
    display_order: order,
  }
}

const GIFT_SETS: ManualProductSeed[] = [
  giftSet('podarunkovyi-nabir-med-shokolad', 'Подарунковий набір «Мед + шоколад»', 'липовий мед + шоколад на меду', 1),
  giftSet('podarunkovyi-nabir-med-maslo', 'Подарунковий набір «Мед + масло»', 'липовий мед + масло холодного віджиму', 2),
  giftSet('podarunkovyi-nabir-med-shokolad-maslo', 'Подарунковий набір «Мед + шоколад + масло»', 'липовий мед + шоколад на меду + масло холодного віджиму', 3),
]

export const MANUAL_PRODUCTS: ManualProductSeed[] = [
  ...NATURAL_PRODUCTS,
  ...OIL_PRODUCTS,
  ...GIFT_SETS,
  ...METAL_PRODUCTS,
]
