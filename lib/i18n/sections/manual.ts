// ─── Static chrome dictionary for the manual Dacha TV section landing pages ───
// Covers ONLY static UI copy (eyebrows, headings, intros, empty states, CTAs,
// trust/"how to order" blocks) on the honey / products / flowers / flowers-catalog
// / beekeeper / services / lavender landing pages. Dynamic DB content
// (product names/descriptions/prices) is NOT here — it is localized separately.
// Keys are namespaced per page. uk is canonical; ru + en are faithful natives.

import type { Locale } from '@/lib/i18n'
import { tr, type Tr } from '@/lib/i18n/pages'

const D = {
  // ── /honey ─────────────────────────────────────────────────────────────
  honeyEyebrow: { uk: 'Каталог', ru: 'Каталог', en: 'Catalog' },
  honeyH1: { uk: 'Наш мед', ru: 'Наш мёд', en: 'Our honey' },
  honeyIntro: {
    uk: 'Сезонний мед без домішок. Акація, Липа, Сонях: кожен сорт зібраний у свій час і відповідає природному циклу цвітіння.',
    ru: 'Сезонный мёд без примесей. Акация, Липа, Подсолнух: каждый сорт собран в своё время и соответствует природному циклу цветения.',
    en: 'Seasonal honey with no additives. Acacia, Linden, Sunflower: each variety is gathered in its own season, following the natural bloom cycle.',
  },
  honeyPackagingTitle: { uk: 'Про упаковку', ru: 'Об упаковке', en: 'About the packaging' },
  honeyPlasticTitle: { uk: '1L пластик', ru: '1L пластик', en: '1L plastic' },
  honeyPlasticBody: {
    uk: 'Надійна й легка упаковка: зручна для щоденного використання та відправки Новою Поштою. Займає мінімум місця.',
    ru: 'Надёжная и лёгкая упаковка: удобна для ежедневного использования и отправки Новой Почтой. Занимает минимум места.',
    en: 'Durable and lightweight: handy for everyday use and shipping via Nova Poshta. Takes up minimal space.',
  },
  honeyGlassTitle: { uk: '1L скло', ru: '1L стекло', en: '1L glass' },
  honeyGlassBody: {
    uk: 'Ідеально для подарунка: виглядає красиво і підкреслює якість продукту. Скляна банка зберігає мед без впливу пластику.',
    ru: 'Идеально для подарка: выглядит красиво и подчёркивает качество продукта. Стеклянная банка хранит мёд без влияния пластика.',
    en: 'Perfect as a gift: it looks beautiful and highlights the quality. A glass jar keeps honey free from any plastic contact.',
  },
  honeyInsuranceNote: {
    uk: 'Мед відправляємо з надійним пакуванням. Посилки страхуємо, тому якщо банка пошкодиться або мед розіллється під час доставки, не забирайте посилку на пошті — зв’яжіться з нами, і ми допоможемо вирішити ситуацію.',
    ru: 'Мёд отправляем с надёжной упаковкой. Посылки страхуем, поэтому если банка повредится или мёд разольётся во время доставки, не забирайте посылку на почте — свяжитесь с нами, и мы поможем решить ситуацию.',
    en: 'We ship honey with secure packaging. Parcels are insured, so if a jar is damaged or honey leaks in transit, don’t collect the parcel at the post office — contact us and we’ll help resolve it.',
  },
  honeyCtaTitle: { uk: 'Не знаєте, що обрати?', ru: 'Не знаете, что выбрать?', en: 'Not sure what to choose?' },
  honeyCtaBody: {
    uk: 'Зателефонуйте нам або залиште заявку: ми допоможемо підібрати потрібний сорт',
    ru: 'Позвоните нам или оставьте заявку: мы поможем подобрать нужный сорт',
    en: 'Call us or leave a request: we’ll help you pick the right variety',
  },
  honeyCtaButton: { uk: "Зв'язатись з нами", ru: 'Связаться с нами', en: 'Contact us' },

  // ── /products ──────────────────────────────────────────────────────────
  productsEyebrow: { uk: 'Продукти', ru: 'Продукты', en: 'Products' },
  productsH1: { uk: 'Продукти господарства', ru: 'Продукты хозяйства', en: 'Farm products' },
  productsIntro: {
    uk: 'Натуральні продукти, продукти пасіки та сезонні товари господарства з Харківщини.',
    ru: 'Натуральные продукты, продукты пасеки и сезонные товары хозяйства с Харьковщины.',
    en: 'Natural products, apiary products and seasonal farm goods from the Kharkiv region.',
  },
  productsCtaTitle: { uk: 'Потрібна допомога у виборі?', ru: 'Нужна помощь с выбором?', en: 'Need help choosing?' },
  productsCtaBody: {
    uk: 'Зателефонуйте або залиште заявку: ми відповімо на всі питання',
    ru: 'Позвоните или оставьте заявку: мы ответим на все вопросы',
    en: 'Call or leave a request: we’ll answer any question',
  },
  productsCtaButton: { uk: "Зв'язатись з нами", ru: 'Связаться с нами', en: 'Contact us' },

  // ── /flowers ───────────────────────────────────────────────────────────
  flowersBreadcrumbHome: { uk: 'Головна', ru: 'Главная', en: 'Home' },
  flowersBreadcrumbCurrent: { uk: 'Квіти', ru: 'Цветы', en: 'Flowers' },
  flowersEyebrow: { uk: 'Домашній розсадник · Харківщина', ru: 'Домашний питомник · Харьковщина', en: 'Home nursery · Kharkiv region' },
  flowersH1: { uk: 'Хризантеми', ru: 'Хризантемы', en: 'Chrysanthemums' },
  flowersIntro: {
    uk: 'Понад {count} сортів. Помпонові, кущові, великоквіткові і рідкісні. Вирощуємо вдома: для букетів, подарунків і саду.',
    ru: 'Более {count} сортов. Помпонные, кустовые, крупноцветковые и редкие. Выращиваем дома: для букетов, подарков и сада.',
    en: 'Over {count} varieties. Pompon, spray, exhibition and rare ones. Grown at home: for bouquets, gifts and the garden.',
  },
  flowersFeatured: { uk: 'Рекомендовані', ru: 'Рекомендуемые', en: 'Featured' },
  flowersInquiryTitle: { uk: 'Замовити квіти', ru: 'Заказать цветы', en: 'Order flowers' },
  flowersInquiryBody: {
    uk: 'Уточнимо наявність, ціну і домовимося про передачу або доставку.',
    ru: 'Уточним наличие, цену и договоримся о передаче или доставке.',
    en: 'We’ll confirm availability and price and arrange pickup or delivery.',
  },

  // ── /flowers/catalog ───────────────────────────────────────────────────
  catalogBreadcrumbCatalog: { uk: 'Каталог', ru: 'Каталог', en: 'Catalog' },
  catalogEyebrow: {
    uk: 'Домашній розсадник · Харківщина · Хризантеми',
    ru: 'Домашний питомник · Харьковщина · Хризантемы',
    en: 'Home nursery · Kharkiv region · Chrysanthemums',
  },
  catalogH1: { uk: 'Колекція', ru: 'Коллекция', en: 'Collection' },
  catalogSortsLabel: { uk: 'сортів хризантем', ru: 'сортов хризантем', en: 'chrysanthemum varieties' },
  catalogVarietiesLabel: { uk: 'різновидів', ru: 'разновидностей', en: 'types' },
  catalogFeatured: { uk: 'Рекомендовані', ru: 'Рекомендуемые', en: 'Featured' },
  catalogHit: { uk: 'Хіт', ru: 'Хит', en: 'Top' },
  catalogFrom: { uk: 'від', ru: 'от', en: 'from' },
  catalogCtaTitle: { uk: 'Не знаєте що обрати?', ru: 'Не знаете, что выбрать?', en: 'Not sure what to choose?' },
  catalogCtaBody: {
    uk: 'Підберемо сорти за кольором, строком цвітіння і бюджетом. Залиште заявку: зв’яжемося протягом дня.',
    ru: 'Подберём сорта по цвету, сроку цветения и бюджету. Оставьте заявку: свяжемся в течение дня.',
    en: 'We’ll pick varieties by colour, bloom time and budget. Leave a request: we’ll get back to you within the day.',
  },
  catalogPhotoCatalog: { uk: '← Фото каталог', ru: '← Фотокаталог', en: '← Photo catalog' },
  catalogOrderFlowers: { uk: 'Замовити квіти', ru: 'Заказать цветы', en: 'Order flowers' },
  // Static variety descriptions (keyed by uk variety name in the page).
  catalogDescPompon: {
    uk: 'Щільні кулясті суцвіття 3–6 см. Класика флористики.',
    ru: 'Плотные шаровидные соцветия 3–6 см. Классика флористики.',
    en: 'Dense spherical blooms 3–6 cm. A florist’s classic.',
  },
  catalogDescSpray: {
    uk: 'Один стебель: безліч квіток. Природна пишність.',
    ru: 'Один стебель: множество цветков. Природная пышность.',
    en: 'One stem, many flowers. Naturally lush.',
  },
  catalogDescExhibition: {
    uk: 'Одна квітка до 25 см. Виставковий формат.',
    ru: 'Один цветок до 25 см. Выставочный формат.',
    en: 'A single bloom up to 25 cm. Exhibition format.',
  },
  catalogDescMicro: {
    uk: 'Хмарка з сотень крихітних суцвіть.',
    ru: 'Облачко из сотен крошечных соцветий.',
    en: 'A cloud of hundreds of tiny blooms.',
  },
  catalogDescCompact: {
    uk: 'До 35 см. Для вазонів і балконів.',
    ru: 'До 35 см. Для вазонов и балконов.',
    en: 'Up to 35 cm. For pots and balconies.',
  },
  catalogDescAnemone: {
    uk: 'Плоскі пелюстки + пухнастий центр.',
    ru: 'Плоские лепестки + пушистый центр.',
    en: 'Flat petals with a fluffy centre.',
  },
  catalogDescSpider: {
    uk: 'Довгі звивисті пелюстки. Екзотика.',
    ru: 'Длинные извилистые лепестки. Экзотика.',
    en: 'Long, curling petals. Exotic.',
  },

  // ── /beekeeper ─────────────────────────────────────────────────────────
  beekeeperEyebrow: { uk: 'Для пасічників', ru: 'Для пчеловодов', en: 'For beekeepers' },
  beekeeperH1: { uk: 'Бджолопакети та вулики', ru: 'Пчелопакеты и ульи', en: 'Bee packages & hives' },
  beekeeperIntro: {
    uk: "Ми пасічники, і розуміємо, що вам потрібно. Пропонуємо бджолопакети, бджолосім'ї та вулики: з індивідуальним підходом.",
    ru: 'Мы пчеловоды и понимаем, что вам нужно. Предлагаем пчелопакеты, пчелосемьи и ульи: с индивидуальным подходом.',
    en: 'We’re beekeepers, and we understand what you need. We offer bee packages, bee colonies and hives, with an individual approach.',
  },
  beekeeperOffersTitle: { uk: 'Що пропонуємо пасічникам', ru: 'Что предлагаем пчеловодам', en: 'What we offer beekeepers' },
  beekeeperOffersSubtitle: {
    uk: 'Напряму від пасічника. Наявність і ціни залежать від сезону — уточнюйте.',
    ru: 'Напрямую от пчеловода. Наличие и цены зависят от сезона — уточняйте.',
    en: 'Directly from the beekeeper. Availability and prices depend on the season — ask us.',
  },
  beekeeperLeaveInquiry: { uk: 'Залишити заявку', ru: 'Оставить заявку', en: 'Leave a request' },
  beekeeperOrCall: { uk: 'або зателефонуйте:', ru: 'или позвоните:', en: 'or call us:' },
  beekeeperEmptyState: {
    uk: "Каталог поповнюється. Залиште заявку: ми зв'яжемося для обговорення.",
    ru: 'Каталог пополняется. Оставьте заявку: мы свяжемся для обсуждения.',
    en: 'The catalog is being updated. Leave a request and we’ll get in touch to discuss.',
  },
  beekeeperImportantTitle: { uk: 'Важливо знати', ru: 'Важно знать', en: 'Important to know' },
  beekeeperImportantBody: {
    uk: "Всі бджолопродукти: живі тварини зі складною сезонною логістикою. Ціни залежать від сезону, породи та кількості. Ми завжди повідомляємо про реальну наявність. Залиште заявку: і ми зв'яжемося для обговорення деталей.",
    ru: 'Вся пчелопродукция: живые животные со сложной сезонной логистикой. Цены зависят от сезона, породы и количества. Мы всегда сообщаем о реальном наличии. Оставьте заявку: и мы свяжемся для обсуждения деталей.',
    en: 'All bee products are live animals with complex seasonal logistics. Prices depend on the season, breed and quantity. We always tell you what’s really available. Leave a request and we’ll get in touch to discuss the details.',
  },
  beekeeperFormTitle: { uk: 'Залишити заявку', ru: 'Оставить заявку', en: 'Leave a request' },
  beekeeperFormBody: {
    uk: 'Щоб дізнатись наявність та вартість: залиште заявку або зателефонуйте',
    ru: 'Чтобы узнать наличие и стоимость: оставьте заявку или позвоните',
    en: 'To check availability and price: leave a request or call us',
  },
  // Offer cards.
  beekeeperOfferColoniesTitle: { uk: 'Бджолосімʼї', ru: 'Пчелосемьи', en: 'Bee colonies' },
  beekeeperOfferColoniesNote: {
    uk: 'Сильні сімʼї від власної пасіки, з урахуванням сезону та породи.',
    ru: 'Сильные семьи с собственной пасеки, с учётом сезона и породы.',
    en: 'Strong colonies from our own apiary, matched to the season and breed.',
  },
  beekeeperOfferSplitsTitle: { uk: 'Відводки', ru: 'Отводки', en: 'Nucleus colonies' },
  beekeeperOfferSplitsNote: {
    uk: 'Відводки на замовлення — уточнюйте наявність та терміни.',
    ru: 'Отводки под заказ — уточняйте наличие и сроки.',
    en: 'Nucs made to order — ask about availability and timing.',
  },
  beekeeperOfferHivesTitle: { uk: 'Вулики ППУ', ru: 'Ульи ППУ', en: 'PPU hives' },
  beekeeperOfferHivesNote: {
    uk: 'Вулики з пінополіуретану — легкі, теплі. Наявність за запитом.',
    ru: 'Ульи из пенополиуретана — лёгкие, тёплые. Наличие по запросу.',
    en: 'Polyurethane-foam hives — light and warm. Availability on request.',
  },
  beekeeperOfferConsultTitle: { uk: 'Консультація / підбір', ru: 'Консультация / подбор', en: 'Consultation / selection' },
  beekeeperOfferConsultNote: {
    uk: 'Допоможемо підібрати рішення під вашу пасіку.',
    ru: 'Поможем подобрать решение под вашу пасеку.',
    en: 'We’ll help find the right solution for your apiary.',
  },
  // Section type headings.
  beekeeperTypeBeePackages: { uk: 'Бджолопакети', ru: 'Пчелопакеты', en: 'Bee packages' },
  beekeeperTypeBeeColonies: { uk: "Бджолосім'ї", ru: 'Пчелосемьи', en: 'Bee colonies' },
  beekeeperTypeEmptyHives: { uk: 'Порожні вулики', ru: 'Пустые ульи', en: 'Empty hives' },
  beekeeperTypeHivesWithBees: { uk: 'Вулики з бджолами', ru: 'Ульи с пчёлами', en: 'Hives with bees' },
  beekeeperTypeApiarySupply: { uk: 'Товари пасічника', ru: 'Товары пчеловода', en: 'Beekeeping supplies' },

  // ── /services ──────────────────────────────────────────────────────────
  servicesBreadcrumbHome: { uk: 'Головна', ru: 'Главная', en: 'Home' },
  servicesBreadcrumbCurrent: { uk: 'Послуги', ru: 'Услуги', en: 'Services' },
  servicesH1: { uk: 'Послуги садиби', ru: 'Услуги усадьбы', en: 'Homestead services' },
  servicesIntro: {
    uk: 'Фотосесії у лаванді, відпочинок над ставком та консультації пасічника: все на одній садибі.',
    ru: 'Фотосессии в лаванде, отдых у пруда и консультации пчеловода: всё на одной усадьбе.',
    en: 'Photo shoots in the lavender, rest by the pond and beekeeper consultations: all on one homestead.',
  },
  servicesEmpty: { uk: "Послуги незабаром з'являться.", ru: 'Услуги скоро появятся.', en: 'Services are coming soon.' },
  servicesBook: { uk: 'Забронювати', ru: 'Забронировать', en: 'Book now' },
  servicesLearnMore: { uk: 'Дізнатися більше', ru: 'Узнать больше', en: 'Learn more' },
  servicesQuestionsTitle: { uk: 'Маєте питання?', ru: 'Есть вопросы?', en: 'Have questions?' },
  servicesQuestionsBody: {
    uk: 'Залиште контакти: розповімо деталі та допоможемо обрати.',
    ru: 'Оставьте контакты: расскажем детали и поможем выбрать.',
    en: 'Leave your contacts: we’ll share the details and help you choose.',
  },

  // ── /lavender ──────────────────────────────────────────────────────────
  lavenderBreadcrumbHome: { uk: 'Головна', ru: 'Главная', en: 'Home' },
  lavenderBreadcrumbCurrent: { uk: 'Лаванда', ru: 'Лаванда', en: 'Lavender' },
  lavenderEyebrow: { uk: 'Садиба Дача TV · Харківщина', ru: 'Усадьба Дача TV · Харьковщина', en: 'Dacha TV homestead · Kharkiv region' },
  lavenderH1: { uk: 'Лавандове поле', ru: 'Лавандовое поле', en: 'Lavender field' },
  lavenderHeroIntro: {
    uk: 'Сезон цвітіння: червень–липень. Оренда поля для фотосесій і відпочинку. Букети лаванди під замовлення.',
    ru: 'Сезон цветения: июнь–июль. Аренда поля для фотосессий и отдыха. Букеты лаванды под заказ.',
    en: 'Blooming season: June–July. Rent the field for photo shoots and relaxation. Lavender bouquets to order.',
  },
  lavenderBookField: { uk: 'Забронювати поле', ru: 'Забронировать поле', en: 'Book the field' },
  lavenderPhotoInstagram: { uk: 'Фото в Instagram', ru: 'Фото в Instagram', en: 'Photos on Instagram' },
  lavenderRentEyebrow: { uk: 'Оренда локації', ru: 'Аренда локации', en: 'Location rental' },
  lavenderRentTitle: { uk: 'Лавандове поле', ru: 'Лавандовое поле', en: 'Lavender field' },
  lavenderRentIntro: {
    uk: 'Орендуйте лавандове поле на нашій садибі для фотосесій, освітніх, культурних і оздоровчих заходів. Вартість включає 5 осіб, кожна додаткова — 200 ₴.',
    ru: 'Арендуйте лавандовое поле на нашей усадьбе для фотосессий, образовательных, культурных и оздоровительных мероприятий. Стоимость включает 5 человек, каждый дополнительный — 200 ₴.',
    en: 'Rent the lavender field at our homestead for photo shoots and educational, cultural or wellness events. The price includes 5 people; each extra guest is 200 ₴.',
  },
  lavenderPriceLabel: { uk: 'Вартість оренди', ru: 'Стоимость аренды', en: 'Rental price' },
  lavenderMorningDay: { uk: 'Ранок / день', ru: 'Утро / день', en: 'Morning / day' },
  lavenderPerHourDay: { uk: 'за годину · 06:00–15:00', ru: 'за час · 06:00–15:00', en: 'per hour · 06:00–15:00' },
  lavenderEvening: { uk: 'Вечір', ru: 'Вечер', en: 'Evening' },
  lavenderPerHourEvening: { uk: 'за годину · 15:00–21:00', ru: 'за час · 15:00–21:00', en: 'per hour · 15:00–21:00' },
  lavenderIncludedGuests: { uk: 'Включено гостей', ru: 'Включено гостей', en: 'Guests included' },
  lavenderUpToGuests: { uk: 'до {count} осіб', ru: 'до {count} человек', en: 'up to {count} guests' },
  lavenderExtraGuest: { uk: 'Додатковий гість', ru: 'Дополнительный гость', en: 'Extra guest' },
  lavenderExtraGuestValue: { uk: '+{price} ₴/особа', ru: '+{price} ₴/человек', en: '+{price} ₴/person' },
  lavenderWorkTime: { uk: 'Час роботи', ru: 'Время работы', en: 'Opening hours' },
  lavenderSeason: { uk: 'Сезон', ru: 'Сезон', en: 'Season' },
  lavenderSeasonValue: { uk: 'Червень – Липень', ru: 'Июнь – Июль', en: 'June – July' },
  lavenderPrepayTitle: { uk: '💳 Передплата 100%', ru: '💳 Предоплата 100%', en: '💳 100% prepayment' },
  lavenderPrepayBody: {
    uk: 'Реквізити для оплати надійдуть у повідомленні після підтвердження.',
    ru: 'Реквизиты для оплаты придут в сообщении после подтверждения.',
    en: 'Payment details will be sent by message after confirmation.',
  },
  lavenderAddressTitle: { uk: '📍 Адреса', ru: '📍 Адрес', en: '📍 Address' },
  lavenderAddressValue: {
    uk: 'Харківська обл., смт Коротич, вул. Дачна, 27',
    ru: 'Харьковская обл., пгт Коротич, ул. Дачная, 27',
    en: 'Kharkiv region, Korotych, 27 Dachna St.',
  },
  lavenderDaily: { uk: 'Щодня 06:00–21:00', ru: 'Ежедневно 06:00–21:00', en: 'Daily 06:00–21:00' },
  lavenderRoute: { uk: 'Прокласти маршрут →', ru: 'Проложить маршрут →', en: 'Get directions →' },
  lavenderBookTimeTitle: { uk: 'Забронювати час', ru: 'Забронировать время', en: 'Book a time' },
  lavenderBookTimeBody: {
    uk: 'Оберіть дату та годину — підтвердимо дзвінком.',
    ru: 'Выберите дату и час — подтвердим звонком.',
    en: 'Pick a date and time — we’ll confirm by phone.',
  },
  lavenderRulesLabel: {
    uk: 'З правилами відвідування лавандового поля ознайомлений(а)',
    ru: 'С правилами посещения лавандового поля ознакомлен(а)',
    en: 'I have read the rules for visiting the lavender field',
  },
  lavenderRouteEyebrow: { uk: 'Як нас знайти', ru: 'Как нас найти', en: 'How to find us' },
  lavenderRouteTitle: {
    uk: 'Як доїхати до лавандової локації',
    ru: 'Как добраться до лавандовой локации',
    en: 'How to reach the lavender location',
  },
  lavenderRouteIntro: {
    uk: 'Відео покаже орієнтири по дорозі, а карта — точну адресу з можливістю прокласти маршрут.',
    ru: 'Видео покажет ориентиры по дороге, а карта — точный адрес с возможностью проложить маршрут.',
    en: 'The video shows landmarks along the way, and the map gives the exact address with directions.',
  },
  lavenderVideoCaption: {
    uk: 'Відео: маршрут від Харкова до поля',
    ru: 'Видео: маршрут от Харькова до поля',
    en: 'Video: the route from Kharkiv to the field',
  },
  lavenderMapAddress1: { uk: '📍 Харківська обл., смт Коротич', ru: '📍 Харьковская обл., пгт Коротич', en: '📍 Kharkiv region, Korotych' },
  lavenderMapAddress2: { uk: 'вул. Дачна, 27 · щодня 06:00–21:00', ru: 'ул. Дачная, 27 · ежедневно 06:00–21:00', en: '27 Dachna St. · daily 06:00–21:00' },
  lavenderMapCaption: {
    uk: 'Карта: смт Коротич, вул. Дачна, 27',
    ru: 'Карта: пгт Коротич, ул. Дачная, 27',
    en: 'Map: Korotych, 27 Dachna St.',
  },
  lavenderRouteBtn: { uk: 'Маршрут', ru: 'Маршрут', en: 'Route' },
  lavenderInstaTitle: { uk: 'Лаванда в Instagram', ru: 'Лаванда в Instagram', en: 'Lavender on Instagram' },
  lavenderInstaBody: {
    uk: 'Цвітіння, фотосесії та живі сторіс просто з поля. Підписуйтесь, щоб не пропустити сезон.',
    ru: 'Цветение, фотосессии и живые сторис прямо с поля. Подписывайтесь, чтобы не пропустить сезон.',
    en: 'Blooms, photo shoots and live stories straight from the field. Follow us so you don’t miss the season.',
  },
  lavenderInstaSubscribe: { uk: 'Підписатися в Instagram', ru: 'Подписаться в Instagram', en: 'Follow on Instagram' },
  // Instagram showcase card captions (hashtags stay as-is).
  lavenderCard1: { uk: 'Цвітіння лавандового поля', ru: 'Цветение лавандового поля', en: 'Lavender field in bloom' },
  lavenderCard2: { uk: 'Фотосесія серед лаванди', ru: 'Фотосессия среди лаванды', en: 'A photo shoot among the lavender' },
  lavenderCard3: { uk: 'Світанок над полем', ru: 'Рассвет над полем', en: 'Sunrise over the field' },
  lavenderCard4: { uk: 'Свіжі букети лаванди', ru: 'Свежие букеты лаванды', en: 'Fresh lavender bouquets' },
  lavenderCard5: { uk: 'Захід сонця в полі', ru: 'Закат в поле', en: 'Sunset in the field' },
  lavenderCard6: { uk: 'Сезон лаванди', ru: 'Сезон лаванды', en: 'Lavender season' },

  // ── Shared [slug] detail-page chrome (services/honey/flowers/beekeeper/products) ─
  detailBreadcrumbHome: { uk: 'Головна', ru: 'Главная', en: 'Home' },
  detailPrice: { uk: 'Вартість', ru: 'Стоимость', en: 'Price' },
  detailDuration: { uk: 'Тривалість', ru: 'Длительность', en: 'Duration' },
  detailBookNow: { uk: 'Забронювати зараз', ru: 'Забронировать сейчас', en: 'Book now' },
  detailBookTitle: { uk: 'Забронювати', ru: 'Забронировать', en: 'Book' },
  detailBookDailyBody: {
    uk: 'Оберіть дати заїзду і виїзду: ми підтвердимо бронювання дзвінком.',
    ru: 'Выберите даты заезда и выезда: мы подтвердим бронирование звонком.',
    en: 'Choose check-in and check-out dates — we’ll confirm the booking by phone.',
  },
  detailBookHourTitle: { uk: 'Забронювати годину', ru: 'Забронировать час', en: 'Book an hour' },
  detailBookHourBody: {
    uk: 'Оберіть дату і зручний час: ми підтвердимо бронювання дзвінком.',
    ru: 'Выберите дату и удобное время: мы подтвердим бронирование звонком.',
    en: 'Choose a date and a convenient time — we’ll confirm the booking by phone.',
  },
  detailOrderServiceTitle: { uk: 'Замовити послугу', ru: 'Заказать услугу', en: 'Order the service' },
  detailOrderServiceBody: {
    uk: 'Залиште контакти: уточнимо деталі та домовимося про час.',
    ru: 'Оставьте контакты: уточним детали и договоримся о времени.',
    en: 'Leave your contacts: we’ll confirm the details and arrange a time.',
  },
  detailServiceNotFound: { uk: 'Послугу не знайдено', ru: 'Услуга не найдена', en: 'Service not found' },
  detailNotAvailable: { uk: 'Наразі недоступно', ru: 'Сейчас недоступно', en: 'Currently unavailable' },
  detailPriceOnRequest: { uk: 'Ціна за запитом', ru: 'Цена по запросу', en: 'Price on request' },
  detailOrderTitle: { uk: 'Замовити', ru: 'Заказать', en: 'Order' },
  detailBackToList: { uk: 'Усі товари', ru: 'Все товары', en: 'All products' },
  detailNotFound: { uk: 'Продукт не знайдено', ru: 'Продукт не найден', en: 'Product not found' },
  detailOutOfStockNote: {
    uk: "Наразі немає в наявності. Залиште заявку: ми повідомимо, коли з'явиться.",
    ru: 'Сейчас нет в наличии. Оставьте заявку: мы сообщим, когда появится.',
    en: 'Currently out of stock. Leave a request and we’ll let you know when it’s back.',
  },
  detailSeason: { uk: 'Сезон', ru: 'Сезон', en: 'Season' },
  detailAroma: { uk: 'Аромат', ru: 'Аромат', en: 'Aroma' },
  detailTaste: { uk: 'Смак', ru: 'Вкус', en: 'Taste' },
  detailColor: { uk: 'Колір', ru: 'Цвет', en: 'Color' },
  detailCrystallization: { uk: 'Кристалізація', ru: 'Кристаллизация', en: 'Crystallization' },
  detailStorage: { uk: 'Зберігання', ru: 'Хранение', en: 'Storage' },
  detailRecommended: { uk: 'Рекомендовано', ru: 'Рекомендовано', en: 'Recommended' },
  detailPackaging: { uk: 'Упаковка', ru: 'Упаковка', en: 'Packaging' },
  detailVideoAbout: { uk: 'Відео про цей мед', ru: 'Видео об этом мёде', en: 'Video about this honey' },
  detailAlsoOnYoutube: { uk: 'Також на YouTube', ru: 'Также на YouTube', en: 'Also on YouTube' },
  detailAlsoInterested: { uk: 'Також може зацікавити', ru: 'Также может заинтересовать', en: 'You may also like' },
  detailPerLiter: { uk: 'за 1 л', ru: 'за 1 л', en: 'per liter' },
  detailMostPopular: { uk: 'Найпопулярніший', ru: 'Самый популярный', en: 'Most popular' },
  detailPackagingNote: {
    uk: 'Доступна упаковка: пластикове відро, скляна банка або подарункова упаковка за домовленістю.',
    ru: 'Доступна упаковка: пластиковое ведро, стеклянная банка или подарочная упаковка по договорённости.',
    en: 'Available packaging: plastic bucket, glass jar or gift packaging by arrangement.',
  },
  detailShippingNote: {
    uk: 'Відправляємо Новою Поштою зі страхуванням. Якщо під час доставки мед пошкодився або розбився — не забирайте посилку, оформіть повернення, і ми відправимо нову.',
    ru: 'Отправляем Новой Почтой со страхованием. Если во время доставки мёд повредился или разбился — не забирайте посылку, оформите возврат, и мы отправим новую.',
    en: 'We ship via Nova Poshta with insurance. If the honey is damaged or broken in transit, don’t collect the parcel — file a return and we’ll send a new one.',
  },
  // ── /flowers/[slug], /beekeeper/[slug], /products/[slug] shared labels ───
  detailInquireBtn: { uk: 'Замовити', ru: 'Заказать', en: 'Order' },
  detailColorLabel: { uk: 'Колір', ru: 'Цвет', en: 'Color' },
  detailBloomSeason: { uk: 'Сезон цвітіння', ru: 'Сезон цветения', en: 'Bloom season' },
  detailAvailability: { uk: 'Наявність', ru: 'Наличие', en: 'Availability' },
  detailChrysanthemum: { uk: 'Хризантема', ru: 'Хризантема', en: 'Chrysanthemum' },
  detailFlowerOutOfStock: {
    uk: "Наразі немає в наявності. Залиште заявку: повідомимо, коли з'явиться.",
    ru: 'Сейчас нет в наличии. Оставьте заявку: сообщим, когда появится.',
    en: 'Currently out of stock. Leave a request and we’ll let you know when it’s back.',
  },
  detailBlooming: { uk: 'Цвітіння', ru: 'Цветение', en: 'Blooming' },
  detailHeight: { uk: 'Висота', ru: 'Высота', en: 'Height' },
  detailUpTo: { uk: 'до', ru: 'до', en: 'up to' },
  detailLighting: { uk: 'Освітлення', ru: 'Освещение', en: 'Lighting' },
  detailVideoAboutFlower: { uk: 'Відео про цю квітку', ru: 'Видео об этом цветке', en: 'Video about this flower' },
  detailOtherVarieties: { uk: 'Інші сорти', ru: 'Другие сорта', en: 'Other varieties' },
  detailOrderTitle2: { uk: 'Замовити', ru: 'Заказать', en: 'Order' },
  detailOrderFlowerBody: {
    uk: 'Залиште заявку: уточнимо наявність і домовимося про передачу.',
    ru: 'Оставьте заявку: уточним наличие и договоримся о передаче.',
    en: 'Leave a request: we’ll confirm availability and arrange handover.',
  },
  detailOutOfStockShort: { uk: 'Немає в наявності', ru: 'Нет в наличии', en: 'Out of stock' },
  detailAvailableBreeds: { uk: 'Доступні породи', ru: 'Доступные породы', en: 'Available breeds' },
  detailVideoAboutProduct: { uk: 'Відео про цей продукт', ru: 'Видео об этом продукте', en: 'Video about this product' },
  detailPerUnit: { uk: 'за одиницю', ru: 'за единицу', en: 'per unit' },
  detailComposition: { uk: 'Склад', ru: 'Состав', en: 'Composition' },
  detailUsage: { uk: 'Застосування', ru: 'Применение', en: 'Usage' },
  detailPriceOnRequest2: { uk: 'Уточнити ціну', ru: 'Уточнить цену', en: 'Price on request' },
  detailOutOfStockNotify: {
    uk: 'Немає в наявності. Залиште заявку: повідомимо про надходження.',
    ru: 'Нет в наличии. Оставьте заявку: сообщим о поступлении.',
    en: 'Out of stock. Leave a request and we’ll let you know when it arrives.',
  },
} satisfies Record<string, Tr>

export function manualDict(locale: Locale) {
  const out = {} as Record<keyof typeof D, string>
  for (const k in D) out[k as keyof typeof D] = tr(D[k as keyof typeof D], locale)
  return out
}

export type ManualDict = ReturnType<typeof manualDict>
