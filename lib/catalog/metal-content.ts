// ─── metal-content.ts — canonical trilingual copy for the 11 metal products ──
// Pure data module (no I/O). Provides UA/RU/EN name, descriptions, long-form SEO
// body, meta tags, keywords, image alt text and the structured characteristics
// for every metal-profile product, keyed by its stable slug.
//
// Content is hand-written per product (not template-cloned) and reflects each
// item's real purpose. RU/EN are faithful native translations of the UA source.
// Characteristics are filled ONLY where the seed data justifies them; everything
// genuinely unknown (exact RAL codes, manufacturer brands, most useful widths)
// stays null and is surfaced by METAL_UNKNOWN_SPECS for manual entry.
//
// Consumed by scripts/fill-metal-content.ts to backfill empty DB fields only.

export type Locale = 'uk' | 'ru' | 'en'

export interface LocalizedContent {
  name: string
  short_description: string
  description: string
  /** Long-form SEO body (2–4 sentences), distinct from `description`. */
  seo_description: string
  meta_title: string
  meta_description: string
  /** Comma-separated keyword list. */
  seo_keywords: string
}

export interface LocalizedAlt {
  uk: string
  ru: string
  en: string
}

/**
 * Structured metal characteristics. Keys mirror METAL_ATTR_FIELDS in metal.ts.
 * A value is either a concrete spec (Ukrainian text, as attributes render
 * generically) or null when the seed data does not justify it. Never invent.
 */
export interface MetalCharacteristics {
  profile: string | null
  thickness: string | null
  coating: string | null
  color: string | null
  width_total: string | null
  width_useful: string | null
  length: string | null
  manufacturer: string | null
}

export interface MetalContentEntry {
  slug: string
  ua: LocalizedContent
  ru: LocalizedContent
  en: LocalizedContent
  main_image_alt: LocalizedAlt
  /** Gallery alt template; `{n}` is replaced with the 1-based image index. */
  gallery_alt_pattern: LocalizedAlt
  characteristics: MetalCharacteristics
}

// Order matters for the "characteristic fields" iteration used by
// METAL_UNKNOWN_SPECS and by the fill script.
export const METAL_CHARACTERISTIC_FIELDS: (keyof MetalCharacteristics)[] = [
  'profile',
  'thickness',
  'coating',
  'color',
  'width_total',
  'width_useful',
  'length',
  'manufacturer',
]

// Shared spec fragments (mirror manual-catalog-data seed values).
const COLORS_UA = 'коричневий, зелений, сірий, графіт, дерево, золотий дуб, темний дуб, інші кольори — під замовлення'
const COLORS_STD_UA = 'коричневий, зелений, сірий'
const PROFNASTIL_THICKNESS = '0,47 мм (турецький) / 0,45 мм (вʼєтнамський)'
const PROFNASTIL_COATING = 'Цинк 230 г/м² (турецький) / 180 г/м² (вʼєтнамський)'
const PHONE = '+380996480485'

// Null characteristics for products where no field is justified by the seed.
const NO_CHARACTERISTICS: MetalCharacteristics = {
  profile: null,
  thickness: null,
  coating: null,
  color: null,
  width_total: null,
  width_useful: null,
  length: null,
  manufacturer: null,
}

export const METAL_CONTENT: MetalContentEntry[] = [
  // ─── 1. Профнастил хвиля 10 — fine/low profile, fences & cladding ──────────
  {
    slug: 'profnastyl-hvylia-10',
    ua: {
      name: 'Профнастил хвиля 10',
      short_description:
        'Профнастил хвиля 10 з дрібним профілем — від 286 грн/м². Турецький або вʼєтнамський метал, різні кольори, розмір під замовлення.',
      description:
        'Профнастил хвиля 10 — профільований лист із невисокою хвилею 10 мм, зручний для парканів, зашивки стін і легких господарських конструкцій. ' +
        'Пропонуємо два варіанти металу: турецький (товщина 0,47 мм, цинк 230 г/м²) — 310 грн/м² та економніший вʼєтнамський (0,45 мм, цинк 180 г/м²) — 286 грн/м².\n\n' +
        `Кольори: ${COLORS_UA}. Виготовляємо під ваш розмір.\n\nЗамовлення та консультація: ${PHONE}.`,
      seo_description:
        'Профнастил хвиля 10 має дрібний профіль і рівну поверхню, тому найкраще підходить для парканів, огорож та декоративної зашивки фасаду. ' +
        'Оберіть турецький лист 0,47 мм із цинком 230 г/м² для більшого запасу міцності або вʼєтнамський 0,45 мм для економного бюджету. ' +
        'Порахуємо вартість під ваші розміри й колір і доставимо по Харківській та Полтавській областях.',
      meta_title: 'Профнастил хвиля 10 — ціна від 286 грн/м²',
      meta_description:
        'Профнастил хвиля 10 для парканів і зашивки: турецький 0,47 мм (310 грн/м²) або вʼєтнамський 0,45 мм (286 грн/м²). Різні кольори, розмір під замовлення.',
      seo_keywords: 'профнастил хвиля 10, профнастил для паркану, профільований лист, купити профнастил, профнастил ціна за м²',
    },
    ru: {
      name: 'Профнастил волна 10',
      short_description:
        'Профнастил волна 10 с мелким профилем — от 286 грн/м². Турецкий или вьетнамский металл, разные цвета, размер под заказ.',
      description:
        'Профнастил волна 10 — профилированный лист с невысокой волной 10 мм, удобный для заборов, зашивки стен и лёгких хозяйственных конструкций. ' +
        'Предлагаем два варианта металла: турецкий (толщина 0,47 мм, цинк 230 г/м²) — 310 грн/м² и более экономичный вьетнамский (0,45 мм, цинк 180 г/м²) — 286 грн/м².\n\n' +
        `Цвета: коричневый, зелёный, серый, графит, дерево, золотой дуб, тёмный дуб, другие цвета — под заказ. Изготавливаем под ваш размер.\n\nЗаказ и консультация: ${PHONE}.`,
      seo_description:
        'Профнастил волна 10 имеет мелкий профиль и ровную поверхность, поэтому лучше всего подходит для заборов, ограждений и декоративной зашивки фасада. ' +
        'Выберите турецкий лист 0,47 мм с цинком 230 г/м² для большего запаса прочности или вьетнамский 0,45 мм для экономного бюджета. ' +
        'Рассчитаем стоимость под ваши размеры и цвет и доставим по Харьковской и Полтавской областям.',
      meta_title: 'Профнастил волна 10 — цена от 286 грн/м²',
      meta_description:
        'Профнастил волна 10 для заборов и зашивки: турецкий 0,47 мм (310 грн/м²) или вьетнамский 0,45 мм (286 грн/м²). Разные цвета, размер под заказ.',
      seo_keywords: 'профнастил волна 10, профнастил для забора, профилированный лист, купить профнастил, профнастил цена за м²',
    },
    en: {
      name: 'Corrugated sheet wave 10',
      short_description:
        'Wave 10 corrugated steel sheet with a fine profile — from UAH 286/m². Turkish or Vietnamese metal, various colours, made to size.',
      description:
        'Wave 10 corrugated sheet is a profiled panel with a low 10 mm rib, well suited to fences, wall cladding and light utility structures. ' +
        'Two metal options are available: Turkish (0.47 mm, zinc 230 g/m²) at UAH 310/m² and the more economical Vietnamese (0.45 mm, zinc 180 g/m²) at UAH 286/m².\n\n' +
        `Colours: brown, green, grey, graphite, wood, golden oak, dark oak, other colours on request. Made to your size.\n\nOrders and advice: ${PHONE}.`,
      seo_description:
        'Wave 10 corrugated sheet has a fine profile and an even surface, which makes it ideal for fences, enclosures and decorative facade cladding. ' +
        'Choose the Turkish 0.47 mm sheet with 230 g/m² zinc for extra strength, or the Vietnamese 0.45 mm sheet for a tighter budget. ' +
        'We will price it to your dimensions and colour and deliver across the Kharkiv and Poltava regions.',
      meta_title: 'Corrugated sheet wave 10 — from UAH 286/m²',
      meta_description:
        'Wave 10 corrugated sheet for fences and cladding: Turkish 0.47 mm (UAH 310/m²) or Vietnamese 0.45 mm (UAH 286/m²). Various colours, made to size.',
      seo_keywords: 'wave 10 corrugated sheet, corrugated sheet for fence, profiled steel sheet, buy corrugated sheet, corrugated sheet price',
    },
    main_image_alt: {
      uk: 'Профнастил хвиля 10 — профільований лист для паркану та зашивки, різні кольори',
      ru: 'Профнастил волна 10 — профилированный лист для забора и зашивки, разные цвета',
      en: 'Wave 10 corrugated sheet — profiled panel for fences and cladding in various colours',
    },
    gallery_alt_pattern: {
      uk: 'Профнастил хвиля 10 — фото {n}',
      ru: 'Профнастил волна 10 — фото {n}',
      en: 'Wave 10 corrugated sheet — photo {n}',
    },
    characteristics: {
      profile: 'Хвиля 10',
      thickness: PROFNASTIL_THICKNESS,
      coating: PROFNASTIL_COATING,
      color: COLORS_UA,
      width_total: null,
      width_useful: null,
      length: null,
      manufacturer: null,
    },
  },

  // ─── 2. Профнастил хвиля 20 — mid profile, universal roofing & fencing ─────
  {
    slug: 'profnastyl-hvylia-20',
    ua: {
      name: 'Профнастил хвиля 20',
      short_description:
        'Профнастил хвиля 20 — універсальний профіль для покрівлі та парканів, від 286 грн/м². Турецький або вʼєтнамський метал.',
      description:
        'Профнастил хвиля 20 — найпопулярніший універсальний профіль із хвилею 20 мм: тримає навантаження краще за дрібні профілі й однаково добре працює на даху та в паркані. ' +
        'Два варіанти металу: турецький (0,47 мм, цинк 230 г/м²) — 310 грн/м² та вʼєтнамський (0,45 мм, цинк 180 г/м²) — 286 грн/м².\n\n' +
        `Кольори: ${COLORS_UA}. Ріжемо в розмір під ваш проєкт.\n\nЗамовлення та консультація: ${PHONE}.`,
      seo_description:
        'Профнастил хвиля 20 — золота середина між дрібним парканним і високим покрівельним профілем: жорсткість вища, а вага і ціна залишаються помірними. ' +
        'Його беруть на дахи навісів, гаражів і господарських будівель, а також на суцільні паркани, де важлива рівна лінія хвилі. ' +
        'Підкажемо потрібну товщину під ваш крок обрешітки та порахуємо лист у розмір.',
      meta_title: 'Профнастил хвиля 20 — ціна від 286 грн/м²',
      meta_description:
        'Профнастил хвиля 20 — універсальний профіль для даху та паркану: турецький 0,47 мм (310 грн/м²) або вʼєтнамський 0,45 мм (286 грн/м²). Різні кольори, розмір під замовлення.',
      seo_keywords: 'профнастил хвиля 20, профнастил для даху, універсальний профнастил, купити профнастил, профнастил ціна',
    },
    ru: {
      name: 'Профнастил волна 20',
      short_description:
        'Профнастил волна 20 — универсальный профиль для кровли и заборов, от 286 грн/м². Турецкий или вьетнамский металл.',
      description:
        'Профнастил волна 20 — самый популярный универсальный профиль с волной 20 мм: держит нагрузку лучше мелких профилей и одинаково хорошо работает на крыше и в заборе. ' +
        'Два варианта металла: турецкий (0,47 мм, цинк 230 г/м²) — 310 грн/м² и вьетнамский (0,45 мм, цинк 180 г/м²) — 286 грн/м².\n\n' +
        `Цвета: коричневый, зелёный, серый, графит, дерево, золотой дуб, тёмный дуб, другие цвета — под заказ. Режем в размер под ваш проект.\n\nЗаказ и консультация: ${PHONE}.`,
      seo_description:
        'Профнастил волна 20 — золотая середина между мелким заборным и высоким кровельным профилем: жёсткость выше, а вес и цена остаются умеренными. ' +
        'Его берут на крыши навесов, гаражей и хозяйственных построек, а также на сплошные заборы, где важна ровная линия волны. ' +
        'Подскажем нужную толщину под ваш шаг обрешётки и рассчитаем лист в размер.',
      meta_title: 'Профнастил волна 20 — цена от 286 грн/м²',
      meta_description:
        'Профнастил волна 20 — универсальный профиль для крыши и забора: турецкий 0,47 мм (310 грн/м²) или вьетнамский 0,45 мм (286 грн/м²). Разные цвета, размер под заказ.',
      seo_keywords: 'профнастил волна 20, профнастил для крыши, универсальный профнастил, купить профнастил, профнастил цена',
    },
    en: {
      name: 'Corrugated sheet wave 20',
      short_description:
        'Wave 20 corrugated sheet — a universal profile for roofing and fences, from UAH 286/m². Turkish or Vietnamese metal.',
      description:
        'Wave 20 corrugated sheet is the most popular all-round profile with a 20 mm rib: it carries load better than fine profiles and works equally well on a roof or a fence. ' +
        'Two metal options: Turkish (0.47 mm, zinc 230 g/m²) at UAH 310/m² and Vietnamese (0.45 mm, zinc 180 g/m²) at UAH 286/m².\n\n' +
        `Colours: brown, green, grey, graphite, wood, golden oak, dark oak, other colours on request. Cut to size for your project.\n\nOrders and advice: ${PHONE}.`,
      seo_description:
        'Wave 20 corrugated sheet is the middle ground between a fine fence profile and a tall roofing one: higher rigidity while weight and price stay moderate. ' +
        'It is chosen for carport, garage and outbuilding roofs, and for solid fences where an even rib line matters. ' +
        'We will advise the right thickness for your batten spacing and cut the sheet to size.',
      meta_title: 'Corrugated sheet wave 20 — from UAH 286/m²',
      meta_description:
        'Wave 20 corrugated sheet, a universal profile for roof and fence: Turkish 0.47 mm (UAH 310/m²) or Vietnamese 0.45 mm (UAH 286/m²). Various colours, made to size.',
      seo_keywords: 'wave 20 corrugated sheet, corrugated sheet for roof, universal corrugated sheet, buy corrugated sheet, corrugated sheet price',
    },
    main_image_alt: {
      uk: 'Профнастил хвиля 20 — універсальний профільований лист для даху та паркану',
      ru: 'Профнастил волна 20 — универсальный профилированный лист для крыши и забора',
      en: 'Wave 20 corrugated sheet — universal profiled panel for roof and fence',
    },
    gallery_alt_pattern: {
      uk: 'Профнастил хвиля 20 — фото {n}',
      ru: 'Профнастил волна 20 — фото {n}',
      en: 'Wave 20 corrugated sheet — photo {n}',
    },
    characteristics: {
      profile: 'Хвиля 20',
      thickness: PROFNASTIL_THICKNESS,
      coating: PROFNASTIL_COATING,
      color: COLORS_UA,
      width_total: null,
      width_useful: null,
      length: null,
      manufacturer: null,
    },
  },

  // ─── 3. Профнастил хвиля 35 — high rib, load-bearing roofing ───────────────
  {
    slug: 'profnastyl-hvylia-35',
    ua: {
      name: 'Профнастил хвиля 35',
      short_description:
        'Профнастил хвиля 35 — високий несучий профіль для покрівлі, від 286 грн/м². Турецький або вʼєтнамський метал, різні кольори.',
      description:
        'Профнастил хвиля 35 — високий профіль із хвилею 35 мм і підвищеною жорсткістю, розрахований на покрівлю та перекриття з більшим кроком обрешітки. ' +
        'Метал на вибір: турецький (0,47 мм, цинк 230 г/м²) — 310 грн/м² та вʼєтнамський (0,45 мм, цинк 180 г/м²) — 286 грн/м².\n\n' +
        `Кольори: ${COLORS_UA}. Виготовляємо листи потрібної довжини під ваш скат.\n\nЗамовлення та консультація: ${PHONE}.`,
      seo_description:
        'Профнастил хвиля 35 має найвищу хвилю в нашій лінійці, тому тримає снігове й монтажне навантаження та дозволяє збільшити крок обрешітки без прогину. ' +
        'Це робочий вибір для покрівель житлових і промислових будівель, ангарів і великих навісів. ' +
        'Порахуємо кількість листів за площею вашого даху й підберемо колір під фасад.',
      meta_title: 'Профнастил хвиля 35 — ціна від 286 грн/м²',
      meta_description:
        'Профнастил хвиля 35 — високий несучий профіль для покрівлі: турецький 0,47 мм (310 грн/м²) або вʼєтнамський 0,45 мм (286 грн/м²). Різні кольори, довжина під замовлення.',
      seo_keywords: 'профнастил хвиля 35, несучий профнастил, профнастил для покрівлі, купити профнастил, профнастил ціна',
    },
    ru: {
      name: 'Профнастил волна 35',
      short_description:
        'Профнастил волна 35 — высокий несущий профиль для кровли, от 286 грн/м². Турецкий или вьетнамский металл, разные цвета.',
      description:
        'Профнастил волна 35 — высокий профиль с волной 35 мм и повышенной жёсткостью, рассчитанный на кровлю и перекрытия с большим шагом обрешётки. ' +
        'Металл на выбор: турецкий (0,47 мм, цинк 230 г/м²) — 310 грн/м² и вьетнамский (0,45 мм, цинк 180 г/м²) — 286 грн/м².\n\n' +
        `Цвета: коричневый, зелёный, серый, графит, дерево, золотой дуб, тёмный дуб, другие цвета — под заказ. Изготавливаем листы нужной длины под ваш скат.\n\nЗаказ и консультация: ${PHONE}.`,
      seo_description:
        'Профнастил волна 35 имеет самую высокую волну в нашей линейке, поэтому держит снеговую и монтажную нагрузку и позволяет увеличить шаг обрешётки без прогиба. ' +
        'Это рабочий выбор для кровель жилых и промышленных зданий, ангаров и больших навесов. ' +
        'Рассчитаем количество листов по площади вашей крыши и подберём цвет под фасад.',
      meta_title: 'Профнастил волна 35 — цена от 286 грн/м²',
      meta_description:
        'Профнастил волна 35 — высокий несущий профиль для кровли: турецкий 0,47 мм (310 грн/м²) или вьетнамский 0,45 мм (286 грн/м²). Разные цвета, длина под заказ.',
      seo_keywords: 'профнастил волна 35, несущий профнастил, профнастил для кровли, купить профнастил, профнастил цена',
    },
    en: {
      name: 'Corrugated sheet wave 35',
      short_description:
        'Wave 35 corrugated sheet — a tall load-bearing roofing profile, from UAH 286/m². Turkish or Vietnamese metal, various colours.',
      description:
        'Wave 35 corrugated sheet is a tall profile with a 35 mm rib and increased rigidity, designed for roofing and decking with wider batten spacing. ' +
        'Metal options: Turkish (0.47 mm, zinc 230 g/m²) at UAH 310/m² and Vietnamese (0.45 mm, zinc 180 g/m²) at UAH 286/m².\n\n' +
        `Colours: brown, green, grey, graphite, wood, golden oak, dark oak, other colours on request. Sheets are made to the length of your roof slope.\n\nOrders and advice: ${PHONE}.`,
      seo_description:
        'Wave 35 corrugated sheet has the tallest rib in our range, so it carries snow and installation loads and lets you widen batten spacing without sagging. ' +
        'It is the practical choice for roofs of residential and industrial buildings, hangars and large carports. ' +
        'We will calculate the number of sheets from your roof area and match the colour to your facade.',
      meta_title: 'Corrugated sheet wave 35 — from UAH 286/m²',
      meta_description:
        'Wave 35 corrugated sheet, a tall load-bearing roofing profile: Turkish 0.47 mm (UAH 310/m²) or Vietnamese 0.45 mm (UAH 286/m²). Various colours, made to length.',
      seo_keywords: 'wave 35 corrugated sheet, load-bearing corrugated sheet, roofing corrugated sheet, buy corrugated sheet, corrugated sheet price',
    },
    main_image_alt: {
      uk: 'Профнастил хвиля 35 — високий несучий профіль для покрівлі',
      ru: 'Профнастил волна 35 — высокий несущий профиль для кровли',
      en: 'Wave 35 corrugated sheet — tall load-bearing roofing profile',
    },
    gallery_alt_pattern: {
      uk: 'Профнастил хвиля 35 — фото {n}',
      ru: 'Профнастил волна 35 — фото {n}',
      en: 'Wave 35 corrugated sheet — photo {n}',
    },
    characteristics: {
      profile: 'Хвиля 35',
      thickness: PROFNASTIL_THICKNESS,
      coating: PROFNASTIL_COATING,
      color: COLORS_UA,
      width_total: null,
      width_useful: null,
      length: null,
      manufacturer: null,
    },
  },

  // ─── 4. Профнастил хвиля 8 бюджетний — cheapest, temporary/aux structures ──
  {
    slug: 'profnastyl-hvylia-8-biudzhetnyi',
    ua: {
      name: 'Профнастил хвиля 8 бюджетний',
      short_description:
        'Бюджетний профнастил хвиля 8, товщина 0,20 мм, ширина 1 м — 173 грн/м². Економний варіант для тимчасових конструкцій.',
      description:
        'Бюджетний профнастил хвиля 8 — найдоступніший профільований лист у нашій лінійці для тимчасових і допоміжних конструкцій, парканів та зашивки. ' +
        'Тонкий метал 0,20 мм і ширина 1 м роблять його економним рішенням там, де не потрібен запас міцності капітальної покрівлі.\n\n' +
        `Ціна — 173 грн/м².\n\nЗамовлення та консультація: ${PHONE}.`,
      seo_description:
        'Бюджетний профнастил хвиля 8 — це найдешевший спосіб швидко закрити периметр або зашити стіну: тонкий лист 0,20 мм легко різати й монтувати самотужки. ' +
        'Його беруть на тимчасові огорожі будмайданчиків, сараї, вольєри та інші допоміжні конструкції, де важлива ціна, а не термін служби капітального даху. ' +
        'Уточнюйте наявність — позиція складська й швидко розходиться.',
      meta_title: 'Профнастил хвиля 8 бюджетний — 173 грн/м²',
      meta_description:
        'Бюджетний профнастил хвиля 8, товщина 0,20 мм, ширина 1 м — 173 грн/м². Економний варіант для парканів, сараїв і зашивки. Доставка за домовленістю.',
      seo_keywords: 'профнастил хвиля 8, бюджетний профнастил, дешевий профнастил, профнастил для паркану, профнастил 0,20 мм',
    },
    ru: {
      name: 'Профнастил волна 8 бюджетный',
      short_description:
        'Бюджетный профнастил волна 8, толщина 0,20 мм, ширина 1 м — 173 грн/м². Экономный вариант для временных конструкций.',
      description:
        'Бюджетный профнастил волна 8 — самый доступный профилированный лист в нашей линейке для временных и вспомогательных конструкций, заборов и зашивки. ' +
        'Тонкий металл 0,20 мм и ширина 1 м делают его экономичным решением там, где не нужен запас прочности капитальной кровли.\n\n' +
        `Цена — 173 грн/м².\n\nЗаказ и консультация: ${PHONE}.`,
      seo_description:
        'Бюджетный профнастил волна 8 — самый дешёвый способ быстро закрыть периметр или зашить стену: тонкий лист 0,20 мм легко резать и монтировать самостоятельно. ' +
        'Его берут на временные ограждения стройплощадок, сараи, вольеры и другие вспомогательные конструкции, где важна цена, а не срок службы капитальной крыши. ' +
        'Уточняйте наличие — позиция складская и быстро расходится.',
      meta_title: 'Профнастил волна 8 бюджетный — 173 грн/м²',
      meta_description:
        'Бюджетный профнастил волна 8, толщина 0,20 мм, ширина 1 м — 173 грн/м². Экономный вариант для заборов, сараев и зашивки. Доставка по договорённости.',
      seo_keywords: 'профнастил волна 8, бюджетный профнастил, дешёвый профнастил, профнастил для забора, профнастил 0,20 мм',
    },
    en: {
      name: 'Budget corrugated sheet wave 8',
      short_description:
        'Budget wave 8 corrugated sheet, 0.20 mm thick, 1 m wide — UAH 173/m². An economical option for temporary structures.',
      description:
        'Budget wave 8 corrugated sheet is the most affordable profiled panel in our range for temporary and auxiliary structures, fences and cladding. ' +
        'Its thin 0.20 mm metal and 1 m width make it an economical choice where the strength margin of a permanent roof is not required.\n\n' +
        `Price — UAH 173/m².\n\nOrders and advice: ${PHONE}.`,
      seo_description:
        'Budget wave 8 corrugated sheet is the cheapest way to quickly close a perimeter or clad a wall: the thin 0.20 mm sheet is easy to cut and install yourself. ' +
        'It is used for temporary site fences, sheds, enclosures and other auxiliary structures where price matters more than the lifespan of a permanent roof. ' +
        'Check availability — it is a stock item that sells quickly.',
      meta_title: 'Budget corrugated sheet wave 8 — UAH 173/m²',
      meta_description:
        'Budget wave 8 corrugated sheet, 0.20 mm thick, 1 m wide — UAH 173/m². An economical option for fences, sheds and cladding. Delivery by arrangement.',
      seo_keywords: 'wave 8 corrugated sheet, budget corrugated sheet, cheap corrugated sheet, corrugated sheet for fence, 0.20 mm corrugated sheet',
    },
    main_image_alt: {
      uk: 'Бюджетний профнастил хвиля 8, товщина 0,20 мм, ширина 1 м',
      ru: 'Бюджетный профнастил волна 8, толщина 0,20 мм, ширина 1 м',
      en: 'Budget wave 8 corrugated sheet, 0.20 mm thick, 1 m wide',
    },
    gallery_alt_pattern: {
      uk: 'Профнастил хвиля 8 бюджетний — фото {n}',
      ru: 'Профнастил волна 8 бюджетный — фото {n}',
      en: 'Budget wave 8 corrugated sheet — photo {n}',
    },
    characteristics: {
      profile: 'Хвиля 8',
      thickness: '0,20 мм',
      coating: null,
      color: null,
      width_total: '1 м',
      width_useful: null,
      length: null,
      manufacturer: null,
    },
  },

  // ─── 5. Металочерепиця під розмір — made-to-measure roof tiles ─────────────
  {
    slug: 'metalocherepytsia-pid-rozmir',
    ua: {
      name: 'Металочерепиця під розмір',
      short_description:
        'Металочерепиця, виготовлена під розмір вашого даху — від 348 грн/м². Кольори та покриття за запитом.',
      description:
        'Металочерепиця, виготовлена під розмір вашого даху — класична хвиляста покрівля з акуратним малюнком черепиці, що імітує натуральне покриття. ' +
        'Кольори та тип покриття підбираємо за запитом під ваш фасад.\n\n' +
        `Орієнтовна ціна — від 348 грн/м². Напишіть розміри скатів і бажаний колір — порахуємо вартість.\n\nЗамовлення та консультація: ${PHONE}.`,
      seo_description:
        'Металочерепиця під розмір виготовляється точно під довжину ваших скатів, тому на даху менше стиків, обрізків і відходів. ' +
        'Ми узгоджуємо колір і покриття окремо для кожного замовлення, щоб покрівля пасувала до фасаду й огорожі. ' +
        'Надішліть розміри даху — і ми порахуємо кількість листів та підсумкову вартість.',
      meta_title: 'Металочерепиця під розмір — від 348 грн/м²',
      meta_description:
        'Металочерепиця під розмір вашого даху — від 348 грн/м². Кольори та покриття за запитом, виготовлення під довжину скатів. Доставка за домовленістю.',
      seo_keywords: 'металочерепиця під розмір, металочерепиця ціна, купити металочерепицю, покрівля металочерепиця, металочерепиця під замовлення',
    },
    ru: {
      name: 'Металлочерепица под размер',
      short_description:
        'Металлочерепица, изготовленная под размер вашей крыши — от 348 грн/м². Цвета и покрытие по запросу.',
      description:
        'Металлочерепица, изготовленная под размер вашей крыши — классическая волнистая кровля с аккуратным рисунком черепицы, имитирующим натуральное покрытие. ' +
        'Цвета и тип покрытия подбираем по запросу под ваш фасад.\n\n' +
        `Ориентировочная цена — от 348 грн/м². Напишите размеры скатов и желаемый цвет — рассчитаем стоимость.\n\nЗаказ и консультация: ${PHONE}.`,
      seo_description:
        'Металлочерепица под размер изготавливается точно под длину ваших скатов, поэтому на крыше меньше стыков, обрезков и отходов. ' +
        'Мы согласовываем цвет и покрытие отдельно для каждого заказа, чтобы кровля сочеталась с фасадом и ограждением. ' +
        'Пришлите размеры крыши — и мы рассчитаем количество листов и итоговую стоимость.',
      meta_title: 'Металлочерепица под размер — от 348 грн/м²',
      meta_description:
        'Металлочерепица под размер вашей крыши — от 348 грн/м². Цвета и покрытие по запросу, изготовление под длину скатов. Доставка по договорённости.',
      seo_keywords: 'металлочерепица под размер, металлочерепица цена, купить металлочерепицу, кровля металлочерепица, металлочерепица под заказ',
    },
    en: {
      name: 'Made-to-measure metal roof tile',
      short_description:
        'Metal roof tile made to the size of your roof — from UAH 348/m². Colours and coating on request.',
      description:
        'Metal roof tile made to the size of your roof — a classic wavy covering with a neat tile pattern that imitates natural roofing. ' +
        'Colours and coating type are selected on request to match your facade.\n\n' +
        `Indicative price — from UAH 348/m². Send your slope dimensions and preferred colour and we will price it.\n\nOrders and advice: ${PHONE}.`,
      seo_description:
        'Made-to-measure metal roof tile is produced exactly to the length of your roof slopes, so there are fewer joints, offcuts and waste on the roof. ' +
        'We agree the colour and coating separately for each order so the roof matches the facade and fencing. ' +
        'Send your roof dimensions and we will calculate the number of sheets and the final cost.',
      meta_title: 'Made-to-measure metal roof tile — from UAH 348/m²',
      meta_description:
        'Metal roof tile made to the size of your roof — from UAH 348/m². Colours and coating on request, produced to slope length. Delivery by arrangement.',
      seo_keywords: 'made-to-measure metal roof tile, metal roof tile price, buy metal roof tile, metal tile roofing, custom metal roof tile',
    },
    main_image_alt: {
      uk: 'Металочерепиця під розмір даху — покрівля з малюнком черепиці',
      ru: 'Металлочерепица под размер крыши — кровля с рисунком черепицы',
      en: 'Made-to-measure metal roof tile — roofing with a tile pattern',
    },
    gallery_alt_pattern: {
      uk: 'Металочерепиця під розмір — фото {n}',
      ru: 'Металлочерепица под размер — фото {n}',
      en: 'Made-to-measure metal roof tile — photo {n}',
    },
    characteristics: { ...NO_CHARACTERISTICS },
  },

  // ─── 6. Стандартний лист 2,0 × 1,18 м — stock standard tile sheet ──────────
  {
    slug: 'standartnyi-lyst-2-0h1-18',
    ua: {
      name: 'Стандартний лист 2,0 × 1,18 м',
      short_description:
        'Стандартний лист металочерепиці 2,0 × 1,18 м, робоча ширина 1,15 м — 418 грн/лист. Кольори: коричневий, зелений, сірий.',
      description:
        'Стандартний лист металочерепиці розміром 2,0 × 1,18 м із робочою шириною 1,15 м — готова складська позиція, яку не треба чекати з виробництва. ' +
        'Стандартні кольори — коричневий, зелений і сірий.\n\n' +
        'Ціна — 418 грн/лист. Іноді у наявності є готові 2-метрові листи зі знижкою — від 260–270 грн/м² залежно від залишків, уточнюйте.\n\n' +
        `Замовлення та консультація: ${PHONE}.`,
      seo_description:
        'Стандартний лист 2,0 × 1,18 м — це готова металочерепиця зі складу для невеликих дахів, добудов, навісів і ремонтних доробок, коли лист потрібен «на вчора». ' +
        'Повний розмір 1,18 м у монтажі дає робоче перекриття 1,15 м, а фіксовані кольори коричневий, зелений і сірий спрощують підбір під наявний дах. ' +
        'Запитуйте про акційні 2-метрові листи зі знижкою — їх кількість обмежена залишками.',
      meta_title: 'Стандартний лист 2,0 × 1,18 м — 418 грн/лист',
      meta_description:
        'Стандартний лист металочерепиці 2,0 × 1,18 м, робоча ширина 1,15 м — 418 грн/лист. Кольори: коричневий, зелений, сірий. Готові листи зі знижкою.',
      seo_keywords: 'стандартний лист металочерепиці, металочерепиця 2х1,18, лист металочерепиці ціна, готова металочерепиця, металочерепиця зі складу',
    },
    ru: {
      name: 'Стандартный лист 2,0 × 1,18 м',
      short_description:
        'Стандартный лист металлочерепицы 2,0 × 1,18 м, рабочая ширина 1,15 м — 418 грн/лист. Цвета: коричневый, зелёный, серый.',
      description:
        'Стандартный лист металлочерепицы размером 2,0 × 1,18 м с рабочей шириной 1,15 м — готовая складская позиция, которую не нужно ждать с производства. ' +
        'Стандартные цвета — коричневый, зелёный и серый.\n\n' +
        'Цена — 418 грн/лист. Иногда в наличии есть готовые 2-метровые листы со скидкой — от 260–270 грн/м² в зависимости от остатков, уточняйте.\n\n' +
        `Заказ и консультация: ${PHONE}.`,
      seo_description:
        'Стандартный лист 2,0 × 1,18 м — это готовая металлочерепица со склада для небольших крыш, пристроек, навесов и ремонтных доработок, когда лист нужен «на вчера». ' +
        'Полный размер 1,18 м в монтаже даёт рабочее перекрытие 1,15 м, а фиксированные цвета коричневый, зелёный и серый упрощают подбор под существующую крышу. ' +
        'Спрашивайте про акционные 2-метровые листы со скидкой — их количество ограничено остатками.',
      meta_title: 'Стандартный лист 2,0 × 1,18 м — 418 грн/лист',
      meta_description:
        'Стандартный лист металлочерепицы 2,0 × 1,18 м, рабочая ширина 1,15 м — 418 грн/лист. Цвета: коричневый, зелёный, серый. Готовые листы со скидкой.',
      seo_keywords: 'стандартный лист металлочерепицы, металлочерепица 2х1,18, лист металлочерепицы цена, готовая металлочерепица, металлочерепица со склада',
    },
    en: {
      name: 'Standard sheet 2.0 × 1.18 m',
      short_description:
        'Standard metal-tile sheet 2.0 × 1.18 m, working width 1.15 m — UAH 418/sheet. Colours: brown, green, grey.',
      description:
        'Standard metal-tile sheet measuring 2.0 × 1.18 m with a 1.15 m working width — a ready stock item you do not have to wait for from production. ' +
        'Standard colours are brown, green and grey.\n\n' +
        'Price — UAH 418/sheet. Ready 2-metre sheets are sometimes in stock at a discount — from UAH 260–270/m² depending on remaining stock, please check.\n\n' +
        `Orders and advice: ${PHONE}.`,
      seo_description:
        'The standard 2.0 × 1.18 m sheet is ready metal tile from stock for small roofs, extensions, canopies and repairs when you need a sheet right away. ' +
        'The full 1.18 m width gives a 1.15 m working overlap once installed, and the fixed brown, green and grey colours make matching an existing roof easy. ' +
        'Ask about discounted 2-metre sheets — quantities are limited to remaining stock.',
      meta_title: 'Standard sheet 2.0 × 1.18 m — UAH 418/sheet',
      meta_description:
        'Standard metal-tile sheet 2.0 × 1.18 m, working width 1.15 m — UAH 418/sheet. Colours: brown, green, grey. Discounted ready sheets available.',
      seo_keywords: 'standard metal tile sheet, metal tile 2x1.18, metal tile sheet price, ready metal tile, metal tile from stock',
    },
    main_image_alt: {
      uk: 'Стандартний лист металочерепиці 2,0 × 1,18 м, робоча ширина 1,15 м',
      ru: 'Стандартный лист металлочерепицы 2,0 × 1,18 м, рабочая ширина 1,15 м',
      en: 'Standard metal-tile sheet 2.0 × 1.18 m, working width 1.15 m',
    },
    gallery_alt_pattern: {
      uk: 'Стандартний лист 2,0 × 1,18 м — фото {n}',
      ru: 'Стандартный лист 2,0 × 1,18 м — фото {n}',
      en: 'Standard sheet 2.0 × 1.18 m — photo {n}',
    },
    characteristics: {
      profile: null,
      thickness: null,
      coating: null,
      color: COLORS_STD_UA,
      width_total: '1,18 м',
      width_useful: '1,15 м',
      length: '2,0 м',
      manufacturer: null,
    },
  },

  // ─── 7. Металевий штахетник — metal fence pickets ─────────────────────────
  {
    slug: 'metalevyi-shtaketnyk',
    ua: {
      name: 'Металевий штахетник',
      short_description:
        'Металевий штахетник різних форм і розмірів для парканів та огорож. Широка палітра кольорів, виготовлення під розмір.',
      description:
        'Металевий штахетник (євроштахет) для парканів та огорож — планки різних форм і розмірів, які кріпляться з проміжками або суцільно. ' +
        'Такий паркан має вигляд класичного штахетника, але не гниє й не потребує фарбування.\n\n' +
        `Кольори: ${COLORS_UA}. Напишіть довжину огорожі й бажаний колір — підберемо рішення та порахуємо вартість.\n\nЗамовлення та консультація: ${PHONE}.`,
      seo_description:
        'Металевий штахетник поєднує охайний вигляд дерев’яного паркану з довговічністю оцинкованого металу: планки не гниють, не розсихаються й тримають колір роками. ' +
        'Ви можете монтувати їх з просвітом для провітрювання ділянки або суцільно для повної приватності, з одного чи двох боків. ' +
        'Підкажемо крок планок і кількість під вашу довжину огорожі та висоту паркану.',
      meta_title: 'Металевий штахетник — паркан під розмір',
      meta_description:
        'Металевий штахетник (євроштахет) різних форм і розмірів для парканів. Широка палітра кольорів, виготовлення під розмір. Доставка за домовленістю.',
      seo_keywords: 'металевий штахетник, євроштахет, паркан із штахетника, металевий паркан, штахетник ціна',
    },
    ru: {
      name: 'Металлический штакетник',
      short_description:
        'Металлический штакетник разных форм и размеров для заборов и ограждений. Широкая палитра цветов, изготовление под размер.',
      description:
        'Металлический штакетник (евроштакет) для заборов и ограждений — планки разных форм и размеров, которые крепятся с промежутками или сплошь. ' +
        'Такой забор выглядит как классический штакетник, но не гниёт и не требует покраски.\n\n' +
        `Цвета: коричневый, зелёный, серый, графит, дерево, золотой дуб, тёмный дуб, другие цвета — под заказ. Напишите длину ограждения и желаемый цвет — подберём решение и рассчитаем стоимость.\n\nЗаказ и консультация: ${PHONE}.`,
      seo_description:
        'Металлический штакетник сочетает аккуратный вид деревянного забора с долговечностью оцинкованного металла: планки не гниют, не рассыхаются и держат цвет годами. ' +
        'Их можно монтировать с просветом для проветривания участка или сплошь для полной приватности, с одной или двух сторон. ' +
        'Подскажем шаг планок и количество под вашу длину ограждения и высоту забора.',
      meta_title: 'Металлический штакетник — забор под размер',
      meta_description:
        'Металлический штакетник (евроштакет) разных форм и размеров для заборов. Широкая палитра цветов, изготовление под размер. Доставка по договорённости.',
      seo_keywords: 'металлический штакетник, евроштакет, забор из штакетника, металлический забор, штакетник цена',
    },
    en: {
      name: 'Metal fence picket',
      short_description:
        'Metal fence pickets in various shapes and sizes for fences and enclosures. Wide colour palette, made to size.',
      description:
        'Metal fence pickets (euro-picket) for fences and enclosures — slats of various shapes and sizes fixed with gaps or solidly. ' +
        'The result looks like a classic picket fence but does not rot and needs no painting.\n\n' +
        `Colours: brown, green, grey, graphite, wood, golden oak, dark oak, other colours on request. Tell us the fence length and preferred colour and we will propose a solution and price it.\n\nOrders and advice: ${PHONE}.`,
      seo_description:
        'Metal fence pickets combine the tidy look of a wooden fence with the durability of galvanised steel: the slats do not rot, do not dry out and hold their colour for years. ' +
        'They can be mounted with a gap to ventilate the plot or solidly for full privacy, on one or both sides. ' +
        'We will advise the picket spacing and quantity for your fence length and height.',
      meta_title: 'Metal fence picket — fence made to size',
      meta_description:
        'Metal fence pickets (euro-picket) in various shapes and sizes for fences. Wide colour palette, made to size. Delivery by arrangement.',
      seo_keywords: 'metal fence picket, euro picket, picket fence, metal fence, fence picket price',
    },
    main_image_alt: {
      uk: 'Металевий штахетник — паркан із металевих планок різних кольорів',
      ru: 'Металлический штакетник — забор из металлических планок разных цветов',
      en: 'Metal fence picket — fence of metal slats in various colours',
    },
    gallery_alt_pattern: {
      uk: 'Металевий штахетник — фото {n}',
      ru: 'Металлический штакетник — фото {n}',
      en: 'Metal fence picket — photo {n}',
    },
    characteristics: {
      profile: null,
      thickness: null,
      coating: null,
      color: COLORS_UA,
      width_total: null,
      width_useful: null,
      length: null,
      manufacturer: null,
    },
  },

  // ─── 8. Добірні елементи для покрівлі та фасаду — trims & flashings ────────
  {
    slug: 'dobirni-elementy-pokrivlia-fasad',
    ua: {
      name: 'Добірні елементи для покрівлі та фасаду',
      short_description:
        'Коники, кути, П-подібні профілі, планки примикання та інші добірні елементи під ваш колір і розмір.',
      description:
        'Добірні (комплектуючі) елементи для покрівлі та фасаду, які завершують монтаж і закривають стики: коники, кути, П-подібні профілі, планки примикання до стіни та інші елементи під замовлення. ' +
        'Гнемо під ваш колір і розмір, щоб вони точно збігалися з основним покриттям.\n\n' +
        `Напишіть перелік потрібних елементів і розміри — виготовимо під ваш об’єкт.\n\nЗамовлення та консультація: ${PHONE}.`,
      seo_description:
        'Добірні елементи — це та частина покрівлі, від якої залежить герметичність даху: правильно підібрані коники, кути й планки примикання не пропускають воду в стики та вузли. ' +
        'Ми гнемо їх із металу того самого кольору, що й ваша покрівля чи фасад, тож переходи виглядають акуратно. ' +
        'Надішліть креслення або розміри вузлів — розрахуємо довжини планок і кількість.',
      meta_title: 'Добірні елементи для покрівлі та фасаду — під розмір',
      meta_description:
        'Добірні елементи для покрівлі та фасаду: коники, кути, П-подібні профілі, планки примикання. Гнемо під ваш колір і розмір. Доставка за домовленістю.',
      seo_keywords: 'добірні елементи покрівлі, планки примикання, коник для даху, комплектуючі для покрівлі, фасадні планки',
    },
    ru: {
      name: 'Доборные элементы для кровли и фасада',
      short_description:
        'Коньки, углы, П-образные профили, планки примыкания и другие доборные элементы под ваш цвет и размер.',
      description:
        'Доборные (комплектующие) элементы для кровли и фасада, которые завершают монтаж и закрывают стыки: коньки, углы, П-образные профили, планки примыкания к стене и другие элементы под заказ. ' +
        'Гнём под ваш цвет и размер, чтобы они точно совпадали с основным покрытием.\n\n' +
        `Напишите перечень нужных элементов и размеры — изготовим под ваш объект.\n\nЗаказ и консультация: ${PHONE}.`,
      seo_description:
        'Доборные элементы — это та часть кровли, от которой зависит герметичность крыши: правильно подобранные коньки, углы и планки примыкания не пропускают воду в стыки и узлы. ' +
        'Мы гнём их из металла того же цвета, что и ваша кровля или фасад, поэтому переходы выглядят аккуратно. ' +
        'Пришлите чертёж или размеры узлов — рассчитаем длины планок и количество.',
      meta_title: 'Доборные элементы для кровли и фасада — под размер',
      meta_description:
        'Доборные элементы для кровли и фасада: коньки, углы, П-образные профили, планки примыкания. Гнём под ваш цвет и размер. Доставка по договорённости.',
      seo_keywords: 'доборные элементы кровли, планки примыкания, конёк для крыши, комплектующие для кровли, фасадные планки',
    },
    en: {
      name: 'Roof and facade trims',
      short_description:
        'Ridges, corners, U-profiles, wall flashings and other trims made to your colour and size.',
      description:
        'Roof and facade trims (accessories) that finish the installation and cover joints: ridges, corners, U-profiles, wall abutment flashings and other elements to order. ' +
        'We fold them to your colour and size so they match the main covering exactly.\n\n' +
        `Send the list of elements you need and their dimensions and we will make them for your project.\n\nOrders and advice: ${PHONE}.`,
      seo_description:
        'Trims are the part of a roof that determines how watertight it is: correctly matched ridges, corners and abutment flashings keep water out of joints and junctions. ' +
        'We fold them from metal in the same colour as your roof or facade, so the transitions look neat. ' +
        'Send a drawing or the junction dimensions and we will calculate the flashing lengths and quantities.',
      meta_title: 'Roof and facade trims — made to size',
      meta_description:
        'Roof and facade trims: ridges, corners, U-profiles, wall flashings. Folded to your colour and size. Delivery by arrangement.',
      seo_keywords: 'roof trims, wall flashing, roof ridge, roofing accessories, facade flashing',
    },
    main_image_alt: {
      uk: 'Добірні елементи для покрівлі та фасаду — коники, кути та планки примикання',
      ru: 'Доборные элементы для кровли и фасада — коньки, углы и планки примыкания',
      en: 'Roof and facade trims — ridges, corners and wall flashings',
    },
    gallery_alt_pattern: {
      uk: 'Добірні елементи для покрівлі та фасаду — фото {n}',
      ru: 'Доборные элементы для кровли и фасада — фото {n}',
      en: 'Roof and facade trims — photo {n}',
    },
    characteristics: { ...NO_CHARACTERISTICS },
  },

  // ─── 9. Покрівельні саморізи короткі — short roofing screws ────────────────
  {
    slug: 'pokrivelni-samorizy-korotki',
    ua: {
      name: 'Покрівельні саморізи короткі',
      short_description:
        'Покрівельні саморізи короткі для монтажу профнастилу та металочерепиці — 310 грн/упаковка. Підбір кольору.',
      description:
        'Покрівельні саморізи короткі з ущільнювальною EPDM-шайбою для кріплення профнастилу та металочерепиці до обрешітки. ' +
        'Підбираємо колір капелюшка під ваше покриття, щоб кріплення було непомітним.\n\n' +
        `Ціна — 310 грн/упаковка.\n\nЗамовлення та консультація: ${PHONE}.`,
      seo_description:
        'Короткі покрівельні саморізи — це основний кріпильний елемент, коли лист лягає прямо на дерев’яну обрешітку без товстого утеплювача під ним. ' +
        'Гумова шайба герметизує отвір і не дає воді потрапляти під покриття, а фарбований капелюшок підбирається в тон листа. ' +
        'Порахуємо кількість упаковок за площею вашого даху й кроком кріплення.',
      meta_title: 'Покрівельні саморізи короткі — 310 грн/упаковка',
      meta_description:
        'Покрівельні саморізи короткі для профнастилу та металочерепиці — 310 грн/упаковка. Ущільнювальна шайба, підбір кольору. Доставка за домовленістю.',
      seo_keywords: 'покрівельні саморізи, саморізи для профнастилу, саморізи для металочерепиці, короткі саморізи, покрівельний кріпіж',
    },
    ru: {
      name: 'Кровельные саморезы короткие',
      short_description:
        'Кровельные саморезы короткие для монтажа профнастила и металлочерепицы — 310 грн/упаковка. Подбор цвета.',
      description:
        'Кровельные саморезы короткие с уплотнительной EPDM-шайбой для крепления профнастила и металлочерепицы к обрешётке. ' +
        'Подбираем цвет шляпки под ваше покрытие, чтобы крепёж был незаметным.\n\n' +
        `Цена — 310 грн/упаковка.\n\nЗаказ и консультация: ${PHONE}.`,
      seo_description:
        'Короткие кровельные саморезы — это основной крепёжный элемент, когда лист ложится прямо на деревянную обрешётку без толстого утеплителя под ним. ' +
        'Резиновая шайба герметизирует отверстие и не даёт воде попадать под покрытие, а окрашенная шляпка подбирается в тон листа. ' +
        'Рассчитаем количество упаковок по площади вашей крыши и шагу крепления.',
      meta_title: 'Кровельные саморезы короткие — 310 грн/упаковка',
      meta_description:
        'Кровельные саморезы короткие для профнастила и металлочерепицы — 310 грн/упаковка. Уплотнительная шайба, подбор цвета. Доставка по договорённости.',
      seo_keywords: 'кровельные саморезы, саморезы для профнастила, саморезы для металлочерепицы, короткие саморезы, кровельный крепёж',
    },
    en: {
      name: 'Short roofing screws',
      short_description:
        'Short roofing screws for fixing corrugated sheet and metal tile — UAH 310/pack. Colour matching available.',
      description:
        'Short roofing screws with an EPDM sealing washer for fixing corrugated sheet and metal tile to the battens. ' +
        'We match the head colour to your covering so the fasteners stay discreet.\n\n' +
        `Price — UAH 310/pack.\n\nOrders and advice: ${PHONE}.`,
      seo_description:
        'Short roofing screws are the main fastener when the sheet sits directly on wooden battens without thick insulation beneath it. ' +
        'The rubber washer seals the hole and keeps water from getting under the covering, while the painted head is matched to the sheet colour. ' +
        'We will work out the number of packs from your roof area and fixing spacing.',
      meta_title: 'Short roofing screws — UAH 310/pack',
      meta_description:
        'Short roofing screws for corrugated sheet and metal tile — UAH 310/pack. Sealing washer, colour matching. Delivery by arrangement.',
      seo_keywords: 'roofing screws, corrugated sheet screws, metal tile screws, short roofing screws, roofing fasteners',
    },
    main_image_alt: {
      uk: 'Покрівельні саморізи короткі з ущільнювальною шайбою для профнастилу',
      ru: 'Кровельные саморезы короткие с уплотнительной шайбой для профнастила',
      en: 'Short roofing screws with sealing washer for corrugated sheet',
    },
    gallery_alt_pattern: {
      uk: 'Покрівельні саморізи короткі — фото {n}',
      ru: 'Кровельные саморезы короткие — фото {n}',
      en: 'Short roofing screws — photo {n}',
    },
    characteristics: { ...NO_CHARACTERISTICS },
  },

  // ─── 10. Покрівельні саморізи довгі — long roofing screws ──────────────────
  {
    slug: 'pokrivelni-samorizy-dovhi',
    ua: {
      name: 'Покрівельні саморізи довгі',
      short_description:
        'Покрівельні саморізи довгі для кріплення через хвилю та по обрешітці — 354 грн/упаковка. Підбір кольору.',
      description:
        'Покрівельні саморізи довгі з ущільнювальною EPDM-шайбою — для кріплення профнастилу та металочерепиці там, де потрібен більший виліт: через високу хвилю, коник або по товщій обрешітці. ' +
        'Колір капелюшка підбираємо під ваше покриття.\n\n' +
        `Ціна — 354 грн/упаковка.\n\nЗамовлення та консультація: ${PHONE}.`,
      seo_description:
        'Довгі покрівельні саморізи потрібні там, де короткого кріплення не вистачає: для фіксації через гребінь хвилі, монтажу коників і кріплення по товстій або подвійній обрешітці. ' +
        'Довша різьба надійно затягує лист і разом із гумовою шайбою герметизує отвір навіть у верхній точці профілю. ' +
        'Підкажемо, де на даху потрібні саме довгі саморізи, і порахуємо кількість.',
      meta_title: 'Покрівельні саморізи довгі — 354 грн/упаковка',
      meta_description:
        'Покрівельні саморізи довгі для кріплення через хвилю та коники — 354 грн/упаковка. Ущільнювальна шайба, підбір кольору. Доставка за домовленістю.',
      seo_keywords: 'покрівельні саморізи довгі, саморізи для коника, саморізи для профнастилу, саморізи через хвилю, покрівельний кріпіж',
    },
    ru: {
      name: 'Кровельные саморезы длинные',
      short_description:
        'Кровельные саморезы длинные для крепления через волну и по обрешётке — 354 грн/упаковка. Подбор цвета.',
      description:
        'Кровельные саморезы длинные с уплотнительной EPDM-шайбой — для крепления профнастила и металлочерепицы там, где нужен больший вылет: через высокую волну, конёк или по более толстой обрешётке. ' +
        'Цвет шляпки подбираем под ваше покрытие.\n\n' +
        `Цена — 354 грн/упаковка.\n\nЗаказ и консультация: ${PHONE}.`,
      seo_description:
        'Длинные кровельные саморезы нужны там, где короткого крепления не хватает: для фиксации через гребень волны, монтажа коньков и крепления по толстой или двойной обрешётке. ' +
        'Более длинная резьба надёжно затягивает лист и вместе с резиновой шайбой герметизирует отверстие даже в верхней точке профиля. ' +
        'Подскажем, где на крыше нужны именно длинные саморезы, и рассчитаем количество.',
      meta_title: 'Кровельные саморезы длинные — 354 грн/упаковка',
      meta_description:
        'Кровельные саморезы длинные для крепления через волну и коньки — 354 грн/упаковка. Уплотнительная шайба, подбор цвета. Доставка по договорённости.',
      seo_keywords: 'кровельные саморезы длинные, саморезы для конька, саморезы для профнастила, саморезы через волну, кровельный крепёж',
    },
    en: {
      name: 'Long roofing screws',
      short_description:
        'Long roofing screws for fixing through the rib and over battens — UAH 354/pack. Colour matching available.',
      description:
        'Long roofing screws with an EPDM sealing washer — for fixing corrugated sheet and metal tile where more reach is needed: through a tall rib, at the ridge or over thicker battens. ' +
        'The head colour is matched to your covering.\n\n' +
        `Price — UAH 354/pack.\n\nOrders and advice: ${PHONE}.`,
      seo_description:
        'Long roofing screws are needed where short fasteners fall short: fixing through the crest of the rib, mounting ridges and fixing over thick or doubled battens. ' +
        'The longer thread draws the sheet down firmly and, together with the rubber washer, seals the hole even at the top of the profile. ' +
        'We will point out where on the roof long screws are required and work out the quantity.',
      meta_title: 'Long roofing screws — UAH 354/pack',
      meta_description:
        'Long roofing screws for fixing through the rib and at ridges — UAH 354/pack. Sealing washer, colour matching. Delivery by arrangement.',
      seo_keywords: 'long roofing screws, ridge screws, corrugated sheet screws, screws through the rib, roofing fasteners',
    },
    main_image_alt: {
      uk: 'Покрівельні саморізи довгі з ущільнювальною шайбою для кріплення через хвилю',
      ru: 'Кровельные саморезы длинные с уплотнительной шайбой для крепления через волну',
      en: 'Long roofing screws with sealing washer for fixing through the rib',
    },
    gallery_alt_pattern: {
      uk: 'Покрівельні саморізи довгі — фото {n}',
      ru: 'Кровельные саморезы длинные — фото {n}',
      en: 'Long roofing screws — photo {n}',
    },
    characteristics: { ...NO_CHARACTERISTICS },
  },

  // ─── 11. Складські залишки металу — clearance stock ───────────────────────
  {
    slug: 'skladski-zalyshky-metalu',
    ua: {
      name: 'Складські залишки металу',
      short_description:
        'Готові листи, залишки та рулонний метал — малі й великі партії, часто дешевше за стандартну ціну.',
      description:
        'Складські залишки металу — готові листи, обрізки та рулонний метал, що лишилися від великих замовлень. ' +
        'Малі й великі партії, часто дешевше за стандартну ціну.\n\n' +
        'Асортимент і ціни змінюються залежно від наявності — напишіть, що саме потрібно, і ми підкажемо актуальні позиції.\n\n' +
        `Замовлення та консультація: ${PHONE}.`,
      seo_description:
        'Складські залишки металу — це можливість купити той самий якісний матеріал дешевше: готові листи, обрізки й рулони, що лишилися від великих партій. ' +
        'Такі позиції добре підходять для добудов, ремонтів, навісів і невеликих проєктів, де не потрібен повний розкрій під розмір. ' +
        'Оскільки залишки постійно оновлюються, напишіть свій запит — і ми підберемо, що є в наявності саме зараз.',
      meta_title: 'Складські залишки металу — листи та рулони дешевше',
      meta_description:
        'Складські залишки металу: готові листи, обрізки, рулонний метал, малі та великі партії. Часто дешевше за стандартну ціну. Уточнюйте наявність.',
      seo_keywords: 'складські залишки металу, залишки профнастилу, метал зі знижкою, готові листи металу, рулонний метал',
    },
    ru: {
      name: 'Складские остатки металла',
      short_description:
        'Готовые листы, остатки и рулонный металл — малые и большие партии, часто дешевле стандартной цены.',
      description:
        'Складские остатки металла — готовые листы, обрезки и рулонный металл, оставшиеся от крупных заказов. ' +
        'Малые и большие партии, часто дешевле стандартной цены.\n\n' +
        'Ассортимент и цены меняются в зависимости от наличия — напишите, что именно нужно, и мы подскажем актуальные позиции.\n\n' +
        `Заказ и консультация: ${PHONE}.`,
      seo_description:
        'Складские остатки металла — это возможность купить тот же качественный материал дешевле: готовые листы, обрезки и рулоны, оставшиеся от крупных партий. ' +
        'Такие позиции хорошо подходят для пристроек, ремонтов, навесов и небольших проектов, где не нужен полный раскрой под размер. ' +
        'Поскольку остатки постоянно обновляются, напишите свой запрос — и мы подберём то, что есть в наличии прямо сейчас.',
      meta_title: 'Складские остатки металла — листы и рулоны дешевле',
      meta_description:
        'Складские остатки металла: готовые листы, обрезки, рулонный металл, малые и большие партии. Часто дешевле стандартной цены. Уточняйте наличие.',
      seo_keywords: 'складские остатки металла, остатки профнастила, металл со скидкой, готовые листы металла, рулонный металл',
    },
    en: {
      name: 'Metal clearance stock',
      short_description:
        'Ready sheets, offcuts and coil metal — small and large batches, often cheaper than the standard price.',
      description:
        'Metal clearance stock — ready sheets, offcuts and coil metal left over from large orders. ' +
        'Small and large batches, often cheaper than the standard price.\n\n' +
        'The range and prices change with availability — tell us what you need and we will point out the current items.\n\n' +
        `Orders and advice: ${PHONE}.`,
      seo_description:
        'Metal clearance stock is a chance to buy the same quality material for less: ready sheets, offcuts and coils left over from large batches. ' +
        'These items suit extensions, repairs, canopies and small projects that do not need a full cut to size. ' +
        'Because the leftovers are constantly refreshed, send your request and we will match what is in stock right now.',
      meta_title: 'Metal clearance stock — sheets and coils for less',
      meta_description:
        'Metal clearance stock: ready sheets, offcuts, coil metal, small and large batches. Often cheaper than the standard price. Check availability.',
      seo_keywords: 'metal clearance stock, corrugated sheet offcuts, discounted metal, ready metal sheets, coil metal',
    },
    main_image_alt: {
      uk: 'Складські залишки металу — готові листи, обрізки та рулонний метал',
      ru: 'Складские остатки металла — готовые листы, обрезки и рулонный металл',
      en: 'Metal clearance stock — ready sheets, offcuts and coil metal',
    },
    gallery_alt_pattern: {
      uk: 'Складські залишки металу — фото {n}',
      ru: 'Складские остатки металла — фото {n}',
      en: 'Metal clearance stock — photo {n}',
    },
    characteristics: { ...NO_CHARACTERISTICS },
  },
]

// The canonical slug set (order = catalog display order). Exported so tests and
// the fill script can bound themselves to exactly these products.
export const METAL_CONTENT_SLUGS: string[] = METAL_CONTENT.map((e) => e.slug)

export interface MetalUnknownSpec {
  slug: string
  /** Characteristic fields that are null/empty and REQUIRE manual entry. */
  missing: (keyof MetalCharacteristics)[]
}

// Derived from METAL_CONTENT so it can never drift out of sync: for each product
// lists the characteristic fields left null (unknown from the seed data).
export const METAL_UNKNOWN_SPECS: MetalUnknownSpec[] = METAL_CONTENT.map((e) => ({
  slug: e.slug,
  missing: METAL_CHARACTERISTIC_FIELDS.filter((f) => {
    const v = e.characteristics[f]
    return v == null || v.trim() === ''
  }),
}))

/** Convenience lookup by slug. */
export function metalContentBySlug(slug: string): MetalContentEntry | undefined {
  return METAL_CONTENT.find((e) => e.slug === slug)
}
