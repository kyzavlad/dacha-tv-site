import type { Locale } from '@/lib/i18n'

export interface VarietyDetail {
  season: string
  taste: string
  crystallisation: string
  storage: string
  uses: string
}

// Keyed by the Ukrainian variety name stored on the product row (product.variety
// always comes from the DB in Ukrainian); each entry carries its own uk/ru/en copy
// so the detail table renders in the visitor's locale.
export const VARIETY_DETAILS: Record<string, Record<Locale, VarietyDetail>> = {
  Акація: {
    uk: {
      season: 'Кінець травня – початок червня',
      taste: 'Ніжний, квітковий, злегка вершковий. Один з найсвітліших сортів.',
      crystallisation: 'Кристалізується дуже повільно: іноді залишається рідким до року і більше.',
      storage: 'Зберігати в прохолодному темному місці. Не ставити в холодильник: зайва вологість.',
      uses: 'Щоденне вживання, чай, дитяче харчування, подарунки. Ідеальний для тих, хто не любить дуже насиченого смаку.',
    },
    ru: {
      season: 'Конец мая – начало июня',
      taste: 'Нежный, цветочный, слегка сливочный. Один из самых светлых сортов.',
      crystallisation: 'Кристаллизуется очень медленно: иногда остаётся жидким до года и дольше.',
      storage: 'Хранить в прохладном тёмном месте. Не ставить в холодильник: лишняя влажность.',
      uses: 'Ежедневное употребление, чай, детское питание, подарки. Идеален для тех, кто не любит слишком насыщенный вкус.',
    },
    en: {
      season: 'Late May – early June',
      taste: 'Delicate, floral, slightly creamy. One of the lightest-coloured varieties.',
      crystallisation: 'Crystallises very slowly — sometimes stays liquid for a year or more.',
      storage: 'Store in a cool, dark place. Do not refrigerate — excess moisture.',
      uses: 'Everyday use, tea, baby food, gifts. Ideal for those who prefer a milder flavour.',
    },
  },
  Липа: {
    uk: {
      season: 'Липень',
      taste: 'Насичений, квітковий аромат з легкою гірчинкою. Традиційно вважається найбільш корисним.',
      crystallisation: 'Кристалізується за 2–3 місяці після відкачки. Кристали середнього розміру.',
      storage: 'Зберігати в прохолодному темному місці при температурі до +20°C.',
      uses: 'Підтримка імунітету, чай при застуді, щоденне вживання. Класичний вибір.',
    },
    ru: {
      season: 'Июль',
      taste: 'Насыщенный, цветочный аромат с лёгкой горчинкой. Традиционно считается самым полезным.',
      crystallisation: 'Кристаллизуется через 2–3 месяца после откачки. Кристаллы среднего размера.',
      storage: 'Хранить в прохладном тёмном месте при температуре до +20°C.',
      uses: 'Поддержка иммунитета, чай при простуде, ежедневное употребление. Классический выбор.',
    },
    en: {
      season: 'July',
      taste: 'Rich floral aroma with a light bitterness. Traditionally considered the most beneficial.',
      crystallisation: 'Crystallises 2–3 months after extraction. Medium-sized crystals.',
      storage: 'Store in a cool, dark place at up to +20°C.',
      uses: 'Immune support, tea for colds, everyday use. A classic choice.',
    },
  },
  Сонях: {
    uk: {
      season: 'Серпень – початок вересня',
      taste: 'Насичений, жирний, з характерним смаком соняшника. Дуже ситний.',
      crystallisation: 'Кристалізується дуже швидко: вже через 2–4 тижні після відкачки. Кристали дрібні та тверді.',
      storage: 'Зберігати при кімнатній температурі. Після кристалізації можна злегка підігріти на водяній бані.',
      uses: 'Намазати на хліб, додати в кашу. Ідеально підходить для тривалого зберігання.',
    },
    ru: {
      season: 'Август – начало сентября',
      taste: 'Насыщенный, плотный, с характерным подсолнечным вкусом. Очень сытный.',
      crystallisation: 'Кристаллизуется очень быстро: уже через 2–4 недели после откачки. Кристаллы мелкие и твёрдые.',
      storage: 'Хранить при комнатной температуре. После кристаллизации можно слегка подогреть на водяной бане.',
      uses: 'Намазать на хлеб, добавить в кашу. Идеально подходит для длительного хранения.',
    },
    en: {
      season: 'August – early September',
      taste: 'Rich, dense, with a distinctive sunflower flavour. Very filling.',
      crystallisation: 'Crystallises very fast — within 2–4 weeks after extraction. Fine, firm crystals.',
      storage: 'Store at room temperature. Once crystallised, it can be gently warmed in a water bath.',
      uses: 'Spread on bread, stir into porridge. Ideal for long-term storage.',
    },
  },
  "Різнотрав'я": {
    uk: {
      season: 'Червень – серпень',
      taste: 'Складний, багатошаровий смак від різноманіття польових квітів. Кожна партія трохи відрізняється.',
      crystallisation: 'Кристалізується за 1–3 місяці. Залежить від складу нектару.',
      storage: 'Зберігати в прохолодному темному місці.',
      uses: 'Універсальний. Щоденне вживання, випічка, чай.',
    },
    ru: {
      season: 'Июнь – август',
      taste: 'Сложный, многослойный вкус от разнообразия полевых цветов. Каждая партия немного отличается.',
      crystallisation: 'Кристаллизуется за 1–3 месяца. Зависит от состава нектара.',
      storage: 'Хранить в прохладном тёмном месте.',
      uses: 'Универсальный. Ежедневное употребление, выпечка, чай.',
    },
    en: {
      season: 'June – August',
      taste: 'Complex, layered flavour from a variety of wildflowers. Each batch is a little different.',
      crystallisation: 'Crystallises within 1–3 months, depending on the nectar mix.',
      storage: 'Store in a cool, dark place.',
      uses: 'Versatile. Everyday use, baking, tea.',
    },
  },
  Сади: {
    uk: {
      season: 'Квітень – травень',
      taste: 'Ніжний, квітковий, з легким яблуневим або грушевим нотками залежно від садів.',
      crystallisation: "Кристалізується за 2–3 місяці. Кристали м'які та дрібні.",
      storage: 'Зберігати в прохолодному темному місці.',
      uses: 'Ідеально в чай, з сиром, як добавка до десертів.',
    },
    ru: {
      season: 'Апрель – май',
      taste: 'Нежный, цветочный, с лёгкими яблочными или грушевыми нотками в зависимости от садов.',
      crystallisation: 'Кристаллизуется за 2–3 месяца. Кристаллы мягкие и мелкие.',
      storage: 'Хранить в прохладном тёмном месте.',
      uses: 'Идеально в чай, с сыром, как добавка к десертам.',
    },
    en: {
      season: 'April – May',
      taste: 'Delicate, floral, with light apple or pear notes depending on the orchard.',
      crystallisation: 'Crystallises within 2–3 months. Soft, fine crystals.',
      storage: 'Store in a cool, dark place.',
      uses: 'Great in tea, with cheese, or as a dessert topping.',
    },
  },
  Ліс: {
    uk: {
      season: 'Червень – серпень',
      taste: 'Темний, комплексний, з мінеральними та деревними нотками. Яскраво виражений характер.',
      crystallisation: 'Кристалізується повільно. Може зберігатися рідким тривалий час.',
      storage: 'Зберігати в прохолодному темному місці.',
      uses: "Для цінителів: самостійно або в блюдах з м'ясом та сирами.",
    },
    ru: {
      season: 'Июнь – август',
      taste: 'Тёмный, комплексный, с минеральными и древесными нотками. Ярко выраженный характер.',
      crystallisation: 'Кристаллизуется медленно. Может долго оставаться жидким.',
      storage: 'Хранить в прохладном тёмном месте.',
      uses: 'Для ценителей: самостоятельно или в блюдах с мясом и сырами.',
    },
    en: {
      season: 'June – August',
      taste: 'Dark, complex, with mineral and woody notes. A distinctive character.',
      crystallisation: 'Crystallises slowly. Can stay liquid for a long time.',
      storage: 'Store in a cool, dark place.',
      uses: 'For connoisseurs: on its own or paired with meat and cheese dishes.',
    },
  },
}
