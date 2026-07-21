// ─── Home page body dictionary (uk canonical, ru, en) ────────────────────────
// Static, visible body copy for the home page sections. Previously these strings
// were hardcoded Ukrainian, so choosing RU/EN only re-labeled the Header while
// the page body stayed Ukrainian. This module is the single source of truth for
// the home body copy; uk is canonical and used as the fallback (via `tr`).
//
// Server sections: `const t = homeDict(await getRequestLocale())`.
// Client sections ('use client'): receive `locale` as a prop from app/page.tsx.
//
// Dynamic DB content (hero_tagline/subtext from site_settings, DB-managed
// reviews) is localized elsewhere — only STATIC UI copy lives here.

import type { Locale } from '@/lib/i18n'
import { tr, type Tr } from '@/lib/i18n/pages'

const D = {
  // Hero
  heroBadge: {
    uk: 'Дача TV · магазин, господарство, лаванда, квіти та послуги садиби',
    ru: 'Дача TV · магазин, хозяйство, лаванда, цветы и услуги усадьбы',
    en: 'Dacha TV · shop, farm, lavender, flowers and homestead services',
  },
  heroTitle: {
    uk: 'Товари для дому, саду та господарства — з Дача TV.',
    ru: 'Товары для дома, сада и хозяйства — с Дача TV.',
    en: 'Goods for home, garden and farm — with Dacha TV.',
  },
  heroSubtext: {
    uk: 'Магазин корисних товарів, продукція нашого господарства, квіти, лаванда та послуги садиби — все в одному місці з доставкою по Україні.',
    ru: 'Магазин полезных товаров, продукция нашего хозяйства, цветы, лаванда и услуги усадьбы — всё в одном месте с доставкой по Украине.',
    en: 'A shop of useful goods, our own farm produce, flowers, lavender and homestead services — all in one place, with delivery across Ukraine.',
  },
  heroCta: { uk: 'Перейти в магазин', ru: 'Перейти в магазин', en: 'Go to shop' },
  heroSecondary: { uk: 'Переглянути напрямки', ru: 'Посмотреть направления', en: 'Explore sections' },
  heroPhonePrefix: { uk: 'або зателефонуйте:', ru: 'или позвоните:', en: 'or call us:' },
  heroAria: { uk: 'Головний банер', ru: 'Главный баннер', en: 'Hero banner' },

  // EcosystemSections
  ecoEyebrow: { uk: 'Усе на одному сайті', ru: 'Всё на одном сайте', en: 'All on one site' },
  ecoTitle: { uk: 'Що ми пропонуємо', ru: 'Что мы предлагаем', en: 'What we offer' },
  ecoIntro: {
    uk: 'Дача TV — це більше, ніж мед. Натуральні продукти, квіти, лаванда, послуги, будівельні матеріали та магазин товарів для господарства.',
    ru: 'Дача TV — это больше, чем мёд. Натуральные продукты, цветы, лаванда, услуги, строительные материалы и магазин товаров для хозяйства.',
    en: 'Dacha TV is more than honey. Natural products, flowers, lavender, services, building materials and a shop of farm goods.',
  },
  ecoGo: { uk: 'Перейти', ru: 'Перейти', en: 'Open' },
  ecoShopTitle: { uk: 'Магазин товарів', ru: 'Магазин товаров', en: 'Goods shop' },
  ecoShopText: {
    uk: 'Товари для дому, саду та господарства з доставкою по Україні.',
    ru: 'Товары для дома, сада и хозяйства с доставкой по Украине.',
    en: 'Goods for home, garden and farm with delivery across Ukraine.',
  },
  ecoHoneyTitle: { uk: 'Мед і продукти пасіки', ru: 'Мёд и продукты пасеки', en: 'Honey & apiary products' },
  ecoHoneyText: {
    uk: 'Сезонний мед, пилок, прополіс та бджолопакети напряму від сімейної пасіки.',
    ru: 'Сезонный мёд, пыльца, прополис и пчелопакеты напрямую от семейной пасеки.',
    en: 'Seasonal honey, pollen, propolis and bee packages straight from a family apiary.',
  },
  ecoProductsTitle: { uk: 'Натуральні продукти господарства', ru: 'Натуральные продукты хозяйства', en: 'Natural farm products' },
  ecoProductsText: {
    uk: 'Жимолість, живі олії холодного віджиму, ферментований Іван-чай, озимий часник.',
    ru: 'Жимолость, живые масла холодного отжима, ферментированный Иван-чай, озимый чеснок.',
    en: 'Honeyberry, cold-pressed live oils, fermented Ivan-tea, winter garlic.',
  },
  ecoFlowersTitle: { uk: 'Квіти', ru: 'Цветы', en: 'Flowers' },
  ecoFlowersText: {
    uk: 'Сезонні квіти та композиції під замовлення.',
    ru: 'Сезонные цветы и композиции под заказ.',
    en: 'Seasonal flowers and made-to-order arrangements.',
  },
  ecoLavenderTitle: { uk: 'Лаванда', ru: 'Лаванда', en: 'Lavender' },
  ecoLavenderText: {
    uk: 'Оренда лавандового поля для фотосесій, фотозйомка та лавандові продукти.',
    ru: 'Аренда лавандового поля для фотосессий, фотосъёмка и лавандовые продукты.',
    en: 'Lavender-field rental for photo shoots, photography and lavender products.',
  },
  ecoServicesTitle: { uk: 'Послуги', ru: 'Услуги', en: 'Services' },
  ecoServicesText: {
    uk: 'Послуги нашого господарства — перегляньте напрями та залиште заявку.',
    ru: 'Услуги нашего хозяйства — посмотрите направления и оставьте заявку.',
    en: 'Our farm services — browse the options and leave a request.',
  },
  ecoMetalTitle: { uk: 'Металопрофіль і покрівля', ru: 'Металлопрофиль и кровля', en: 'Metal profile & roofing' },
  ecoMetalText: {
    uk: 'Профнастил, металочерепиця, штахетник, комплектуючі та саморізи під розмір.',
    ru: 'Профнастил, металлочерепица, штакетник, комплектующие и саморезы под размер.',
    en: 'Corrugated sheeting, metal tiles, fencing, fittings and screws cut to size.',
  },
  ecoBeekeeperTitle: { uk: 'Для пасічників', ru: 'Для пчеловодов', en: 'For beekeepers' },
  ecoBeekeeperText: {
    uk: "Бджолопакети Buckfast, Карніка, Українська степова, бджолосім'ї та вулики.",
    ru: 'Пчелопакеты Buckfast, Карника, Украинская степная, пчелосемьи и ульи.',
    en: 'Buckfast, Carnica and Ukrainian Steppe bee packages, bee colonies and hives.',
  },

  // AvailableNow
  availEyebrow: { uk: 'Зараз доступно', ru: 'Сейчас доступно', en: 'Available now' },
  availTitle: { uk: 'Що можна замовити просто зараз', ru: 'Что можно заказать прямо сейчас', en: 'What you can order right now' },
  availIntro: {
    uk: 'Частина продуктів сезонна або виготовляється на замовлення. Тут — те, що доступно сьогодні.',
    ru: 'Часть продуктов сезонная или изготавливается на заказ. Здесь — то, что доступно сегодня.',
    en: 'Some products are seasonal or made to order. Here is what is available today.',
  },
  availView: { uk: 'Дивитись →', ru: 'Смотреть →', en: 'View →' },
  availHoneyTitle: { uk: 'Липовий мед', ru: 'Липовый мёд', en: 'Linden honey' },
  availHoneyNote: {
    uk: '600 грн / 1 л · є в наявності',
    ru: '600 грн / 1 л · в наличии',
    en: 'UAH 600 / 1 L · in stock',
  },
  availChocolateTitle: { uk: 'Шоколад на меду', ru: 'Шоколад на мёду', en: 'Honey chocolate' },
  availChocolateNote: {
    uk: '250 грн · готуємо на замовлення',
    ru: '250 грн · готовим на заказ',
    en: 'UAH 250 · made to order',
  },
  availOilTitle: { uk: 'Масло холодного віджиму', ru: 'Масло холодного отжима', en: 'Cold-pressed oil' },
  availOilNote: {
    uk: 'від 500 грн / 1 л · на деревʼяному пресі',
    ru: 'от 500 грн / 1 л · на деревянном прессе',
    en: 'from UAH 500 / 1 L · on a wooden press',
  },
  availBeesTitle: { uk: 'Бджолосімʼї та відводки', ru: 'Пчелосемьи и отводки', en: 'Bee colonies & nucs' },
  availBeesNote: {
    uk: 'для пасічників · за наявністю',
    ru: 'для пчеловодов · по наличию',
    en: 'for beekeepers · subject to availability',
  },

  // BrandStory
  storyEyebrow: { uk: 'Хто ми', ru: 'Кто мы', en: 'Who we are' },
  storyTitle: {
    uk: 'Сімейне господарство. Власна праця. Чесний підхід.',
    ru: 'Семейное хозяйство. Собственный труд. Честный подход.',
    en: 'A family farm. Our own work. An honest approach.',
  },
  storyPara1: {
    uk: 'Дача TV — це сімейне господарство на Харківщині. Починали з пасіки, а сьогодні це ще й натуральні продукти, квіти, лавандове поле, послуги та магазин товарів для дому й господарства.',
    ru: 'Дача TV — это семейное хозяйство на Харьковщине. Начинали с пасеки, а сегодня это ещё и натуральные продукты, цветы, лавандовое поле, услуги и магазин товаров для дома и хозяйства.',
    en: 'Dacha TV is a family farm in the Kharkiv region. We started with an apiary, and today it also means natural products, flowers, a lavender field, services and a shop of goods for home and farm.',
  },
  storyPara2: {
    uk: 'Кожен напрям — це наша власна праця. На YouTube-каналі ми відкрито показуємо весь процес, бо чесність у роботі — це не маркетинг, а наш спосіб.',
    ru: 'Каждое направление — это наш собственный труд. На YouTube-канале мы открыто показываем весь процесс, ведь честность в работе — это не маркетинг, а наш способ.',
    en: 'Every part of it is our own work. On our YouTube channel we openly show the whole process, because honesty in our work isn’t marketing — it’s our way.',
  },
  storyStatTitle: { uk: 'Власне господарство', ru: 'Собственное хозяйство', en: 'Our own farm' },
  storyStatLocation: { uk: 'Харківщина, с. Коротич', ru: 'Харьковщина, с. Коротич', en: 'Kharkiv region, Korotych' },
  storyImageAlt: {
    uk: 'Пасіка Дача TV — Коротич, Харківська область',
    ru: 'Пасека Дача TV — Коротич, Харьковская область',
    en: 'Dacha TV apiary — Korotych, Kharkiv region',
  },
  storyCta: { uk: 'Читати нашу історію', ru: 'Читать нашу историю', en: 'Read our story' },
  storyTrust1Label: { uk: 'Сімейна справа', ru: 'Семейное дело', en: 'A family business' },
  storyTrust1Desc: {
    uk: 'Власне господарство на Харківщині — без посередників.',
    ru: 'Собственное хозяйство на Харьковщине — без посредников.',
    en: 'Our own farm in the Kharkiv region — no middlemen.',
  },
  storyTrust2Label: { uk: 'Власне виробництво', ru: 'Собственное производство', en: 'Our own production' },
  storyTrust2Desc: {
    uk: 'Мед, натуральні продукти та квіти вирощуємо й готуємо самі.',
    ru: 'Мёд, натуральные продукты и цветы выращиваем и готовим сами.',
    en: 'We grow and make the honey, natural products and flowers ourselves.',
  },
  storyTrust3Label: { uk: 'Чесно і відкрито', ru: 'Честно и открыто', en: 'Honest and open' },
  storyTrust3Desc: {
    uk: 'Показуємо всю роботу на YouTube — від поля до столу.',
    ru: 'Показываем всю работу на YouTube — от поля до стола.',
    en: 'We show all our work on YouTube — from field to table.',
  },
  storyTrust4Label: { uk: 'Зручне замовлення', ru: 'Удобный заказ', en: 'Easy ordering' },
  storyTrust4Desc: {
    uk: 'Замовляйте онлайн із доставкою Новою Поштою по всій Україні.',
    ru: 'Заказывайте онлайн с доставкой Новой Почтой по всей Украине.',
    en: 'Order online with Nova Poshta delivery across Ukraine.',
  },

  // YouTubeSection
  ytEyebrow: { uk: 'YouTube-канал Дача TV', ru: 'YouTube-канал Дача TV', en: 'Dacha TV YouTube channel' },
  ytTitle: {
    uk: 'Корисні відео про дачу й господарство',
    ru: 'Полезные видео о даче и хозяйстве',
    en: 'Useful videos about the dacha and farming',
  },
  ytIntro: {
    uk: 'Наш бренд-канал — це практичні відео про дачу, господарство, пасіку, квіти, лаванду, товари та готові рішення для дому й саду. Дивіться, як усе влаштовано насправді.',
    ru: 'Наш бренд-канал — это практичные видео о даче, хозяйстве, пасеке, цветах, лаванде, товарах и готовых решениях для дома и сада. Смотрите, как всё устроено на самом деле.',
    en: 'Our brand channel is practical videos about the dacha, farming, the apiary, flowers, lavender, goods and ready-made solutions for home and garden. See how it all really works.',
  },
  ytFacadeTitle: {
    uk: 'Дача TV — корисні відео про дачу, господарство та пасіку',
    ru: 'Дача TV — полезные видео о даче, хозяйстве и пасеке',
    en: 'Dacha TV — useful videos about the dacha, farming and the apiary',
  },
  ytOpenChannel: { uk: 'Відкрити канал', ru: 'Открыть канал', en: 'Open channel' },
  ytTopicDacha: { uk: 'Дача', ru: 'Дача', en: 'Dacha' },
  ytTopicFarm: { uk: 'Господарство', ru: 'Хозяйство', en: 'Farming' },
  ytTopicApiary: { uk: 'Пасіка', ru: 'Пасека', en: 'Apiary' },
  ytTopicFlowers: { uk: 'Квіти', ru: 'Цветы', en: 'Flowers' },
  ytTopicLavender: { uk: 'Лаванда', ru: 'Лаванда', en: 'Lavender' },
  ytTopicGoods: { uk: 'Товари', ru: 'Товары', en: 'Goods' },
  ytTopicSolutions: { uk: 'Практичні рішення', ru: 'Практичные решения', en: 'Practical solutions' },

  // HowToOrder
  orderTitle: { uk: 'Як замовити', ru: 'Как заказать', en: 'How to order' },
  orderSubtitle: {
    uk: 'Усього три кроки — і замовлення у вас вдома',
    ru: 'Всего три шага — и заказ у вас дома',
    en: 'Just three steps — and your order is at your door',
  },
  orderStepLabel: { uk: 'Крок', ru: 'Шаг', en: 'Step' },
  orderCta: { uk: 'Перейти в магазин', ru: 'Перейти в магазин', en: 'Go to shop' },
  orderStep1Title: { uk: 'Оберіть товар або продукт', ru: 'Выберите товар или продукт', en: 'Choose a product' },
  orderStep1Desc: {
    uk: 'Перегляньте каталог і оберіть товар, продукт пасіки або послугу, що вас цікавить.',
    ru: 'Просмотрите каталог и выберите товар, продукт пасеки или услугу, которая вас интересует.',
    en: 'Browse the catalog and pick the product, apiary item or service you want.',
  },
  orderStep2Title: { uk: 'Залиште заявку або зателефонуйте', ru: 'Оставьте заявку или позвоните', en: 'Leave a request or call' },
  orderStep2Desc: {
    uk: 'Заповніть коротку форму на сайті або зателефонуйте нам напряму — ми відповімо швидко.',
    ru: 'Заполните короткую форму на сайте или позвоните нам напрямую — мы ответим быстро.',
    en: 'Fill in a short form on the site or call us directly — we reply quickly.',
  },
  orderStep3Title: { uk: 'Отримайте замовлення', ru: 'Получите заказ', en: 'Receive your order' },
  orderStep3Desc: {
    uk: 'Відправимо Новою Поштою або Укрпоштою по всій Україні. Можливий самовивіз.',
    ru: 'Отправим Новой Почтой или Укрпочтой по всей Украине. Возможен самовывоз.',
    en: 'We ship via Nova Poshta or Ukrposhta across Ukraine. Self-pickup is available.',
  },

  // Reviews (client component)
  reviewsEyebrow: { uk: 'Відгуки', ru: 'Отзывы', en: 'Reviews' },
  reviewsTitle: { uk: 'Що кажуть наші покупці', ru: 'Что говорят наши покупатели', en: 'What our customers say' },
  reviewsIntro: {
    uk: 'Відгуки про мед, продукти, квіти, лаванду, металопрофіль і доставку',
    ru: 'Отзывы о мёде, продуктах, цветах, лаванде, металлопрофиле и доставке',
    en: 'Reviews of our honey, products, flowers, lavender, metal profile and delivery',
  },
  reviewsPrevAria: { uk: 'Попередні відгуки', ru: 'Предыдущие отзывы', en: 'Previous reviews' },
  reviewsNextAria: { uk: 'Наступні відгуки', ru: 'Следующие отзывы', en: 'Next reviews' },
  reviewsRatingAria: { uk: 'Оцінка: {n} з 5 зірок', ru: 'Оценка: {n} из 5 звёзд', en: 'Rating: {n} out of 5 stars' },
  reviewsDotAria: { uk: 'Показати відгук {n}', ru: 'Показать отзыв {n}', en: 'Show review {n}' },

  // DeliveryTeaser
  deliveryEyebrow: { uk: 'Доставка', ru: 'Доставка', en: 'Delivery' },
  deliveryTitle: {
    uk: 'По всій Україні — надійно і вчасно',
    ru: 'По всей Украине — надёжно и вовремя',
    en: 'Across Ukraine — reliably and on time',
  },
  deliveryIntro: {
    uk: 'Ми на Харківщині, але відправляємо в будь-яку точку країни. Кожне замовлення — надійно упаковане, щоб дісталося до вас у цілості.',
    ru: 'Мы на Харьковщине, но отправляем в любую точку страны. Каждый заказ надёжно упакован, чтобы дошёл до вас в целости.',
    en: 'We are in the Kharkiv region, but we ship anywhere in the country. Every order is securely packed to reach you intact.',
  },
  deliveryCta: { uk: 'Детальніше про доставку', ru: 'Подробнее о доставке', en: 'More about delivery' },
  deliveryCard1Title: { uk: 'Товари з каталогу', ru: 'Товары из каталога', en: 'Catalog goods' },
  deliveryCard1Desc: {
    uk: 'Відправляємо Новою Поштою по всій Україні. Оплата накладеним платежем при отриманні.',
    ru: 'Отправляем Новой Почтой по всей Украине. Оплата наложенным платежом при получении.',
    en: 'We ship via Nova Poshta across Ukraine. Cash on delivery on receipt.',
  },
  deliveryCard2Title: { uk: 'Мед та продукти пасіки', ru: 'Мёд и продукты пасеки', en: 'Honey & apiary products' },
  deliveryCard2Desc: {
    uk: 'Відправляємо по всій Україні — Новою Поштою або Укрпоштою. Надійна упаковка для безпечного транспортування.',
    ru: 'Отправляем по всей Украине — Новой Почтой или Укрпочтой. Надёжная упаковка для безопасной транспортировки.',
    en: 'We ship across Ukraine via Nova Poshta or Ukrposhta. Sturdy packaging for safe transport.',
  },
  deliveryCard3Title: { uk: 'Бджолопакети та вулики', ru: 'Пчелопакеты и ульи', en: 'Bee packages & hives' },
  deliveryCard3Desc: {
    uk: 'Самовивіз або індивідуальна домовленість з доставкою. Уточніть деталі при оформленні заявки.',
    ru: 'Самовывоз или индивидуальная договорённость о доставке. Уточните детали при оформлении заявки.',
    en: 'Self-pickup or an individual delivery arrangement. Confirm the details when you place your request.',
  },
  deliveryMethodNovaPoshta: { uk: 'Нова Пошта', ru: 'Новая Почта', en: 'Nova Poshta' },
  deliveryMethodUkrposhta: { uk: 'Укрпошта', ru: 'Укрпочта', en: 'Ukrposhta' },
  deliveryMethodPickup: { uk: 'Самовивіз', ru: 'Самовывоз', en: 'Self-pickup' },

  // ApiaryTrustStrip
  trustAria: { uk: 'Довіра та прозорість', ru: 'Доверие и прозрачность', en: 'Trust & transparency' },
  trust1Label: { uk: 'Офіційна реєстрація ФОП', ru: 'Официальная регистрация ФЛП', en: 'Officially registered sole trader' },
  trust1Detail: {
    uk: 'ФОП Кузьменко Владислав Сергійович — документи та чеки на вимогу',
    ru: 'ФЛП Кузьменко Владислав Сергеевич — документы и чеки по запросу',
    en: 'Sole trader Vladyslav Kuzmenko — documents and receipts on request',
  },
  trust2Label: { uk: 'Доставка по Україні', ru: 'Доставка по Украине', en: 'Delivery across Ukraine' },
  trust2Detail: {
    uk: "Нова Пошта та кур'єр — у будь-яке місто",
    ru: 'Новая Почта и курьер — в любой город',
    en: 'Nova Poshta and courier — to any city',
  },
  trust3Label: { uk: 'Відкрито на YouTube', ru: 'Открыто на YouTube', en: 'Open on YouTube' },
  trust3Detail: {
    uk: 'Садиба, пасіка, поля — весь процес без прикрас',
    ru: 'Усадьба, пасека, поля — весь процесс без прикрас',
    en: 'The homestead, apiary and fields — the whole process, unvarnished',
  },
  trustFooter: {
    uk: 'Садиба Дача TV — с. Коротич, Харківська область. Документи та чеки — на вимогу.',
    ru: 'Усадьба Дача TV — с. Коротич, Харьковская область. Документы и чеки — по запросу.',
    en: 'Dacha TV homestead — Korotych, Kharkiv region. Documents and receipts on request.',
  },
  trustMore: { uk: 'Докладніше про нас', ru: 'Подробнее о нас', en: 'More about us' },
} satisfies Record<string, Tr>

export function homeDict(locale: Locale) {
  const out = {} as Record<keyof typeof D, string>
  for (const k in D) out[k as keyof typeof D] = tr(D[k as keyof typeof D], locale)
  return out
}

// Raw dictionary (unresolved Tr map) for tooling/coverage checks.
export const RAW_HOME = D
