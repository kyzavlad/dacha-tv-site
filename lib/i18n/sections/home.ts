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
    uk: 'Dacha TV · інтернет-магазин · доставка по Україні',
    ru: 'Dacha TV · интернет-магазин · доставка по Украине',
    en: 'Dacha TV · online store · delivery across Ukraine',
  },
  heroTitle: {
    uk: 'Інтернет-магазин Dacha TV: товари для авто, скутерів, дому та саду.',
    ru: 'Интернет-магазин Dacha TV: товары для авто, скутеров, дома и сада.',
    en: 'Dacha TV online store: auto, scooter, home and garden goods.',
  },
  heroSubtext: {
    uk: 'Запчастини для скутерів і мото, автоаксесуари, інструменти, товари для дому, саду та господарства — з пошуком, замовленням онлайн і доставкою по Україні.',
    ru: 'Запчасти для скутеров и мото, автоаксессуары, инструменты, товары для дома, сада и хозяйства — с поиском, заказом онлайн и доставкой по Украине.',
    en: 'Scooter and motorcycle parts, auto accessories, tools, home, garden and household goods — searchable, orderable online, and delivered across Ukraine.',
  },
  heroCta: { uk: 'Перейти в магазин', ru: 'Перейти в магазин', en: 'Go to shop' },
  heroSecondary: { uk: 'Переглянути напрямки', ru: 'Посмотреть направления', en: 'Explore sections' },
  heroPhonePrefix: { uk: 'або зателефонуйте:', ru: 'или позвоните:', en: 'or call us:' },
  heroAria: { uk: 'Головний банер', ru: 'Главный баннер', en: 'Hero banner' },

  // EcosystemSections
  ecoEyebrow: { uk: 'Усе на одному сайті', ru: 'Всё на одном сайте', en: 'All on one site' },
  ecoTitle: { uk: 'Магазин і напрямки Dacha TV', ru: 'Магазин и направления Dacha TV', en: 'The Dacha TV shop and our own sections' },
  ecoIntro: {
    uk: 'Dacha TV — насамперед інтернет-магазин широкого асортименту. Окремо на сайті представлені власні продукти господарства, квіти, лаванда, пасіка та локальні послуги.',
    ru: 'Dacha TV — прежде всего интернет-магазин широкого ассортимента. Отдельно на сайте представлены собственные продукты хозяйства, цветы, лаванда, пасека и локальные услуги.',
    en: 'Dacha TV is first and foremost a broad online store. Our own farm products, flowers, lavender, apiary and local services are presented as separate sections.',
  },
  ecoGo: { uk: 'Перейти', ru: 'Перейти', en: 'Open' },
  ecoShopTitle: { uk: 'Магазин товарів', ru: 'Магазин товаров', en: 'Goods shop' },
  ecoShopText: {
    uk: 'Запчастини для скутерів і мото, автоаксесуари, інструменти, товари для дому, саду та господарства.',
    ru: 'Запчасти для скутеров и мото, автоаксессуары, инструменты, товары для дома, сада и хозяйства.',
    en: 'Scooter and motorcycle parts, auto accessories, tools, home, garden and household goods.',
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
    uk: 'Dacha TV: магазин, власні напрямки та реальна історія.',
    ru: 'Dacha TV: магазин, собственные направления и реальная история.',
    en: 'Dacha TV: a store, our own sections and a real story.',
  },
  storyPara1: {
    uk: 'Dacha TV починався з сімейного господарства та контенту про реальну роботу на Харківщині. Сьогодні головний онлайн-напрям бренду — інтернет-магазин широкого асортименту з доставкою по Україні.',
    ru: 'Dacha TV начинался с семейного хозяйства и контента о реальной работе на Харьковщине. Сегодня главное онлайн-направление бренда — интернет-магазин широкого ассортимента с доставкой по Украине.',
    en: 'Dacha TV began with a family farm and content about real work in the Kharkiv region. Today the brand’s main online direction is a broad online store with delivery across Ukraine.',
  },
  storyPara2: {
    uk: 'У магазині поєднані товари перевірених виробників і партнерів та окремі власні напрямки Dacha TV: мед і продукти пасіки, натуральні продукти, квіти та лаванда. Ми чітко розділяємо, що виробляємо самі, а що продаємо як магазин, і відкрито показуємо роботу бренду на YouTube та в соцмережах.',
    ru: 'В магазине объединены товары проверенных производителей и партнёров и отдельные собственные направления Dacha TV: мёд и продукты пасеки, натуральные продукты, цветы и лаванда. Мы чётко разделяем, что производим сами, а что продаём как магазин, и открыто показываем работу бренда на YouTube и в соцсетях.',
    en: 'The store combines goods from trusted producers and partners with Dacha TV’s own dedicated lines: honey and apiary products, natural goods, flowers and lavender. We clearly distinguish what we make ourselves from what we sell as a retailer, and we show the brand’s work openly on YouTube and social media.',
  },
  storyStatTitle: { uk: 'Dacha TV з Харківщини', ru: 'Dacha TV из Харьковской области', en: 'Dacha TV from the Kharkiv region' },
  storyStatLocation: { uk: 'Харківщина, с. Коротич', ru: 'Харьковщина, с. Коротич', en: 'Kharkiv region, Korotych' },
  storyImageAlt: {
    uk: 'Пасіка Дача TV — Коротич, Харківська область',
    ru: 'Пасека Дача TV — Коротич, Харьковская область',
    en: 'Dacha TV apiary — Korotych, Kharkiv region',
  },
  storyCta: { uk: 'Читати нашу історію', ru: 'Читать нашу историю', en: 'Read our story' },
  storyTrust1Label: { uk: 'Широкий каталог', ru: 'Широкий каталог', en: 'Broad catalog' },
  storyTrust1Desc: {
    uk: 'Понад сто тисяч позицій у каталозі: від запчастин і автоаксесуарів до інструментів та товарів для дому й саду.',
    ru: 'Более ста тысяч позиций в каталоге: от запчастей и автоаксессуаров до инструментов и товаров для дома и сада.',
    en: 'Over one hundred thousand catalog items, from parts and auto accessories to tools and home & garden goods.',
  },
  storyTrust2Label: { uk: 'Власні напрямки', ru: 'Собственные направления', en: 'Our own sections' },
  storyTrust2Desc: {
    uk: 'Мед, продукти пасіки, натуральні продукти, квіти й лаванду вирощуємо або виготовляємо самі; це окремі власні напрямки Dacha TV.',
    ru: 'Мёд, продукты пасеки, натуральные продукты, цветы и лаванду выращиваем или производим сами; это отдельные собственные направления Dacha TV.',
    en: 'We grow or make our honey, apiary products, natural goods, flowers and lavender ourselves; these are separate Dacha TV own-production lines.',
  },
  storyTrust3Label: { uk: 'Чесно і відкрито', ru: 'Честно и открыто', en: 'Honest and open' },
  storyTrust3Desc: {
    uk: 'Показуємо реальну роботу бренду, товари та власні напрямки без вигаданих переваг.',
    ru: 'Показываем реальную работу бренда, товары и собственные направления без выдуманных преимуществ.',
    en: 'We show the brand’s real work, products and own sections without invented claims.',
  },
  storyTrust4Label: { uk: 'Зручне замовлення', ru: 'Удобный заказ', en: 'Easy ordering' },
  storyTrust4Desc: {
    uk: 'Наші продукти й товари партнерів — в одному замовленні, з доставкою Новою Поштою по Україні.',
    ru: 'Наши продукты и товары партнёров — в одном заказе, с доставкой Новой Почтой по Украине.',
    en: 'Our own products and partner goods in one order, delivered by Nova Poshta across Ukraine.',
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
    uk: 'Товари з каталогу відправляємо Новою Поштою. Для продуктів нашого господарства можлива Укрпошта або самовивіз.',
    ru: 'Товары из каталога отправляем Новой Почтой. Для продуктов нашего хозяйства возможна Укрпочта или самовывоз.',
    en: 'Catalog goods ship via Nova Poshta. For our own farm products, Ukrposhta or self-pickup is also possible.',
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
    uk: 'Відправляємо Новою Поштою по всій Україні. Оплата при отриманні або передоплата до відправки після підтвердження менеджером.',
    ru: 'Отправляем Новой Почтой по всей Украине. Оплата при получении или предоплата до отправки после подтверждения менеджером.',
    en: 'We ship via Nova Poshta across Ukraine. Pay on receipt, or prepay before shipping after a manager confirms.',
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
