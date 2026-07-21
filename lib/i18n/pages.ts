// ─── Centralized page-body dictionary (uk canonical, ru, en) ─────────────────
// The problem this solves: choosing RU/EN previously only re-labeled the Header —
// page BODIES stayed Ukrainian. This module is the single, structured source of
// truth for static page-body copy, keyed by domain/page, with an intentional
// Ukrainian fallback. No server-only imports → usable from client and server.
//
// Usage (server component):
//   const locale = await getRequestLocale()
//   const t = pageDict(locale)
//   <h1>{t.about.title}</h1>
//
// Dynamic DB content (product/category names, FAQ rows, reviews) is localized
// separately via the translation tables — this module covers STATIC UI copy.

import type { Locale } from '@/lib/i18n'

// A translated string: uk is required (canonical + fallback), ru/en optional.
export interface Tr { uk: string; ru?: string; en?: string }

// Resolve one Tr for a locale with an intentional Ukrainian fallback. Exported so
// callers can localize ad-hoc `{uk,ru,en}` values (e.g. dynamic seed content).
export function tr(entry: Tr | undefined, locale: Locale): string {
  if (!entry) return ''
  return entry[locale] ?? entry.uk
}

// Deeply resolve a nested Tr tree into plain strings for the active locale, so a
// page reads `t.about.title` directly (no `tr(...)` at every call site). Recurses
// generically: a Tr → string, an array → resolved elements, any other object →
// resolved per key. (Runtime `resolve()` mirrors this exactly.)
type TrTree = { [k: string]: Tr | TrTree | Tr[] | TrTree[] }
type Resolved<T> =
  T extends Tr ? string :
  T extends readonly (infer U)[] ? Resolved<U>[] :
  T extends object ? { [K in keyof T]: Resolved<T[K]> } :
  T

function isTr(v: unknown): v is Tr {
  return !!v && typeof v === 'object' && 'uk' in (v as Record<string, unknown>)
}

function resolve<T>(node: T, locale: Locale): Resolved<T> {
  if (isTr(node)) return tr(node, locale) as Resolved<T>
  if (Array.isArray(node)) return node.map((n) => resolve(n, locale)) as Resolved<T>
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) out[k] = resolve(v, locale)
    return out as Resolved<T>
  }
  return node as Resolved<T>
}

// ─── Dictionary ──────────────────────────────────────────────────────────────
const DICT = {
  common: {
    backHome: { uk: 'На головну', ru: 'На главную', en: 'Home' },
    toCatalog: { uk: 'Перейти до магазину', ru: 'Перейти в магазин', en: 'Go to shop' },
    contactUs: { uk: "Зв'язатись з нами", ru: 'Связаться с нами', en: 'Contact us' },
    loading: { uk: 'Завантаження…', ru: 'Загрузка…', en: 'Loading…' },
    somethingWrong: { uk: 'Щось пішло не так', ru: 'Что-то пошло не так', en: 'Something went wrong' },
    tryAgain: { uk: 'Спробувати ще раз', ru: 'Попробовать снова', en: 'Try again' },
    nothingFound: { uk: 'Нічого не знайдено', ru: 'Ничего не найдено', en: 'Nothing found' },
    readMore: { uk: 'Детальніше', ru: 'Подробнее', en: 'Read more' },
    from: { uk: 'від', ru: 'от', en: 'from' },
  },

  footer: {
    tagline: {
      uk: 'Сімейне господарство на Харківщині: мед, натуральні продукти, квіти та товари для дому.',
      ru: 'Семейное хозяйство на Харьковщине: мёд, натуральные продукты, цветы и товары для дома.',
      en: 'A family farm in the Kharkiv region: honey, natural products, flowers and home goods.',
    },
    navigation: { uk: 'Навігація', ru: 'Навигация', en: 'Navigation' },
    information: { uk: 'Інформація', ru: 'Информация', en: 'Information' },
    contacts: { uk: 'Контакти', ru: 'Контакты', en: 'Contacts' },
    rights: { uk: 'Усі права захищено.', ru: 'Все права защищены.', en: 'All rights reserved.' },
  },

  notFound: {
    title: { uk: 'Сторінку не знайдено', ru: 'Страница не найдена', en: 'Page not found' },
    body: {
      uk: 'Схоже, ця сторінка не існує або була переміщена. Поверніться на головну або перейдіть до каталогу.',
      ru: 'Похоже, эта страница не существует или была перемещена. Вернитесь на главную или перейдите в каталог.',
      en: 'This page doesn’t exist or has moved. Go back home or browse the catalog.',
    },
    honeyCatalog: { uk: 'Каталог меду', ru: 'Каталог мёда', en: 'Honey catalog' },
  },

  delivery: {
    eyebrow: { uk: 'Доставка та оплата', ru: 'Доставка и оплата', en: 'Delivery & payment' },
    title: { uk: 'Доставка', ru: 'Доставка', en: 'Delivery' },
    intro: {
      uk: 'Відправляємо по всій Україні: Новою Поштою або Укрпоштою.',
      ru: 'Отправляем по всей Украине: Новой Почтой или Укрпочтой.',
      en: 'We ship across Ukraine via Nova Poshta or Ukrposhta.',
    },
    questionsTitle: { uk: 'Є питання щодо доставки?', ru: 'Есть вопросы по доставке?', en: 'Questions about delivery?' },
    questionsBody: {
      uk: 'Зателефонуйте або напишіть: відповімо швидко',
      ru: 'Позвоните или напишите — ответим быстро',
      en: 'Call or message us — we reply quickly',
    },
    sections: [
      {
        heading: { uk: 'Мед та продукти пасіки', ru: 'Мёд и продукты пасеки', en: 'Honey & apiary products' },
        body: {
          uk: 'Відправляємо по всій Україні: Новою Поштою або Укрпоштою. Орієнтовний термін доставки: 1–3 робочих дні залежно від регіону. Мінімальне замовлення не встановлено.',
          ru: 'Отправляем по всей Украине: Новой Почтой или Укрпочтой. Ориентировочный срок доставки: 1–3 рабочих дня в зависимости от региона. Минимальный заказ не установлен.',
          en: 'We ship across Ukraine via Nova Poshta or Ukrposhta. Estimated delivery: 1–3 business days depending on the region. No minimum order.',
        },
      },
      {
        heading: { uk: 'Упаковка для відправки', ru: 'Упаковка для отправки', en: 'Packaging for shipping' },
        body: {
          uk: 'Банки упаковуються в захисну пінопластову або картонну упаковку, яка запобігає пошкодженням при транспортуванні. Скляні банки упаковуємо окремо з додатковим захистом. Посилки страхуємо, тому якщо банка пошкодиться або мед розіллється під час доставки, не забирайте посилку на пошті — зв’яжіться з нами, і ми допоможемо вирішити ситуацію.',
          ru: 'Банки упаковываются в защитную пенопластовую или картонную упаковку, которая предотвращает повреждения при транспортировке. Стеклянные банки упаковываем отдельно с дополнительной защитой. Посылки страхуем, поэтому если банка повредится или мёд разольётся во время доставки, не забирайте посылку на почте — свяжитесь с нами, и мы поможем решить ситуацию.',
          en: 'Jars are packed in protective foam or cardboard packaging that prevents damage in transit. Glass jars are packed separately with extra protection. Parcels are insured, so if a jar is damaged or honey leaks during delivery, don’t collect the parcel at the post office — contact us and we’ll help resolve it.',
        },
      },
      {
        heading: { uk: 'Міжнародна доставка', ru: 'Международная доставка', en: 'International delivery' },
        body: {
          uk: 'Можливе відправлення за кордон: уточнюйте при замовленні. Конкретні умови залежать від країни призначення та поточних регуляцій.',
          ru: 'Возможна отправка за границу: уточняйте при заказе. Конкретные условия зависят от страны назначения и текущих регуляций.',
          en: 'International shipping is possible — ask when ordering. Exact terms depend on the destination country and current regulations.',
        },
      },
      {
        heading: { uk: 'Бджолопакети та вулики', ru: 'Пчелопакеты и ульи', en: 'Bee packages & hives' },
        body: {
          uk: 'Живі тварини та вулики відправляємо виключно самовивозом або індивідуальною домовленістю. Передача відбувається особисто в Коротичі, Харківська область, або за домовленістю.',
          ru: 'Живых пчёл и ульи передаём исключительно самовывозом или по индивидуальной договорённости. Передача происходит лично в Коротиче, Харьковская область, или по договорённости.',
          en: 'Live bees and hives are handed over by self-pickup or individual arrangement only. Handover takes place in person in Korotych, Kharkiv region, or as agreed.',
        },
      },
      {
        heading: { uk: 'Оплата', ru: 'Оплата', en: 'Payment' },
        body: {
          uk: 'Приймаємо оплату банківським переказом (Monobank) або готівкою при самовивозі. Оплата накладеним платежем також можлива при відправці Новою Поштою. Деталі уточнюйте при оформленні замовлення.',
          ru: 'Принимаем оплату банковским переводом (Monobank) или наличными при самовывозе. Оплата наложенным платежом также возможна при отправке Новой Почтой. Детали уточняйте при оформлении заказа.',
          en: 'We accept bank transfer (Monobank) or cash on self-pickup. Cash on delivery is also available with Nova Poshta. Details are confirmed at checkout.',
        },
      },
    ],
  },

  privacy: {
    title: { uk: 'Політика конфіденційності', ru: 'Политика конфиденциальности', en: 'Privacy policy' },
    sections: [
      {
        heading: { uk: 'Загальні положення', ru: 'Общие положения', en: 'General' },
        body: {
          uk: 'Ця політика конфіденційності описує, які дані збирає сайт Дача TV та як ми їх використовуємо. Використання сайту означає вашу згоду з цією політикою.',
          ru: 'Эта политика конфиденциальности описывает, какие данные собирает сайт Дача TV и как мы их используем. Использование сайта означает ваше согласие с этой политикой.',
          en: 'This privacy policy describes what data the Dacha TV website collects and how we use it. Using the site means you agree to this policy.',
        },
      },
      {
        heading: { uk: 'Які дані ми збираємо', ru: 'Какие данные мы собираем', en: 'What data we collect' },
        body: {
          uk: 'При заповненні форм замовлення або зворотного зв’язку ми збираємо: ім’я, номер телефону, повідомлення, яке ви залишаєте, та технічну інформацію (IP-адреса, тип браузера) для безпеки та запобігання спаму.',
          ru: 'При заполнении форм заказа или обратной связи мы собираем: имя, номер телефона, оставленное сообщение и техническую информацию (IP-адрес, тип браузера) для безопасности и предотвращения спама.',
          en: 'When you fill in an order or contact form we collect: your name, phone number, the message you leave, and technical information (IP address, browser type) for security and spam prevention.',
        },
      },
      {
        heading: { uk: 'Як ми використовуємо ваші дані', ru: 'Как мы используем ваши данные', en: 'How we use your data' },
        body: {
          uk: 'Зібрані дані використовуються виключно для обробки вашого замовлення або заявки, зв’язку з вами у відповідь на ваш запит та покращення роботи сайту. Ми не передаємо ваші персональні дані третім особам без вашої згоди, за винятком випадків, передбачених законодавством України.',
          ru: 'Собранные данные используются исключительно для обработки вашего заказа или заявки, связи с вами в ответ на ваш запрос и улучшения работы сайта. Мы не передаём ваши персональные данные третьим лицам без вашего согласия, за исключением случаев, предусмотренных законодательством Украины.',
          en: 'Collected data is used solely to process your order or request, to contact you in reply to your enquiry, and to improve the site. We do not share your personal data with third parties without your consent, except as required by Ukrainian law.',
        },
      },
      {
        heading: { uk: 'Cookies та аналітика', ru: 'Cookies и аналитика', en: 'Cookies & analytics' },
        body: {
          uk: 'Сайт може використовувати Google Analytics для аналізу трафіку. Ця служба збирає анонімну статистику відвідувань. Ви можете відключити збір даних через налаштування браузера.',
          ru: 'Сайт может использовать Google Analytics для анализа трафика. Эта служба собирает анонимную статистику посещений. Вы можете отключить сбор данных через настройки браузера.',
          en: 'The site may use Google Analytics to analyse traffic. This service collects anonymous visit statistics. You can disable data collection in your browser settings.',
        },
      },
      {
        heading: { uk: 'Зберігання даних', ru: 'Хранение данных', en: 'Data storage' },
        body: {
          uk: 'Дані форм зберігаються в захищеній базі даних та використовуються лише для обробки вашого замовлення. Ми не зберігаємо дані платіжних карток: розрахунок відбувається поза межами нашого сайту.',
          ru: 'Данные форм хранятся в защищённой базе данных и используются только для обработки вашего заказа. Мы не храним данные платёжных карт: расчёт происходит за пределами нашего сайта.',
          en: 'Form data is stored in a secure database and used only to process your order. We do not store payment-card data: payment happens outside our site.',
        },
      },
      {
        heading: { uk: 'Ваші права', ru: 'Ваши права', en: 'Your rights' },
        body: {
          uk: 'Ви маєте право дізнатись, які ваші дані ми зберігаємо, вимагати видалення ваших даних та відкликати свою згоду на обробку даних. Для реалізації цих прав зв’яжіться з нами через сторінку контактів.',
          ru: 'Вы имеете право узнать, какие ваши данные мы храним, требовать удаления ваших данных и отозвать своё согласие на обработку данных. Для реализации этих прав свяжитесь с нами через страницу контактов.',
          en: 'You have the right to learn what data we store, to request deletion of your data, and to withdraw your consent to processing. To exercise these rights, contact us via the contact page.',
        },
      },
      {
        heading: { uk: 'Зміни до політики', ru: 'Изменения политики', en: 'Changes to this policy' },
        body: {
          uk: 'Ми можемо оновлювати цю політику. Актуальна версія завжди доступна на цій сторінці.',
          ru: 'Мы можем обновлять эту политику. Актуальная версия всегда доступна на этой странице.',
          en: 'We may update this policy. The current version is always available on this page.',
        },
      },
      {
        heading: { uk: 'Контакти', ru: 'Контакты', en: 'Contacts' },
        body: {
          uk: 'З питань щодо конфіденційності зв’яжіться з нами через сторінку контактів.',
          ru: 'По вопросам конфиденциальности свяжитесь с нами через страницу контактов.',
          en: 'For privacy questions, contact us via the contact page.',
        },
      },
    ],
  },

  faq: {
    eyebrow: { uk: 'FAQ', ru: 'FAQ', en: 'FAQ' },
    title: { uk: 'Часті запитання', ru: 'Частые вопросы', en: 'Frequently asked questions' },
    intro: {
      uk: 'Відповіді на найпоширеніші запитання про наш мед, замовлення та доставку.',
      ru: 'Ответы на самые частые вопросы о нашем мёде, заказах и доставке.',
      en: 'Answers to the most common questions about our honey, ordering and delivery.',
    },
    ctaTitle: { uk: 'Готові замовити?', ru: 'Готовы заказать?', en: 'Ready to order?' },
    ctaBody: {
      uk: 'Переходьте до магазину або напишіть нам — допоможемо обрати',
      ru: 'Переходите в магазин или напишите нам — поможем выбрать',
      en: 'Go to the shop or message us — we’ll help you choose',
    },
    categories: {
      products: { uk: 'Про продукти', ru: 'О продуктах', en: 'Products' },
      ordering: { uk: 'Замовлення', ru: 'Заказ', en: 'Ordering' },
      delivery: { uk: 'Доставка', ru: 'Доставка', en: 'Delivery' },
      beekeeping: { uk: 'Бджільництво', ru: 'Пчеловодство', en: 'Beekeeping' },
    },
  },

  about: {
    eyebrow: { uk: 'Про нас', ru: 'О нас', en: 'About us' },
    title: { uk: 'Наша пасіка, наша робота', ru: 'Наша пасека, наша работа', en: 'Our apiary, our work' },
    intro: {
      uk: 'Сімейна пасіка на Харківщині: наша історія, наш підхід, наші бджоли.',
      ru: 'Семейная пасека на Харьковщине: наша история, наш подход, наши пчёлы.',
      en: 'A family apiary in the Kharkiv region: our story, our approach, our bees.',
    },
    storyTitle: { uk: 'Наша історія', ru: 'Наша история', en: 'Our story' },
    story: [
      {
        uk: 'Дача TV — це сімейна пасіка на Харківщині. Ми тримаємо бджіл вже багато років, і кожен крок нашого виробництва — від підготовки вуликів навесні до фасування осіннього меду — це наша власна праця.',
        ru: 'Дача TV — это семейная пасека на Харьковщине. Мы держим пчёл уже много лет, и каждый шаг нашего производства — от подготовки ульев весной до фасовки осеннего мёда — это наш собственный труд.',
        en: 'Dacha TV is a family apiary in the Kharkiv region. We’ve kept bees for many years, and every step of our production — from preparing hives in spring to bottling autumn honey — is our own work.',
      },
      {
        uk: 'Все починалося як особисте захоплення. Поступово кількість вуликів росла, якість меду покращувалася, і ми зрозуміли, що хочемо ділитися не лише продуктом, але й знаннями. Так з’явився YouTube-канал.',
        ru: 'Всё начиналось как личное увлечение. Постепенно количество ульев росло, качество мёда улучшалось, и мы поняли, что хотим делиться не только продуктом, но и знаниями. Так появился YouTube-канал.',
        en: 'It started as a personal hobby. Gradually the number of hives grew, the honey got better, and we realised we wanted to share not just the product but knowledge too. That’s how the YouTube channel began.',
      },
      {
        uk: 'Сьогодні ми виробляємо мед кількох сортів, продаємо бджолопакети та вулики, і продовжуємо відкрито розповідати про свою роботу. Бо чесність — це не маркетинг. Це наш спосіб.',
        ru: 'Сегодня мы производим мёд нескольких сортов, продаём пчелопакеты и ульи и продолжаем открыто рассказывать о своей работе. Ведь честность — это не маркетинг. Это наш способ.',
        en: 'Today we produce several honey varieties, sell bee packages and hives, and keep talking openly about our work. Because honesty isn’t marketing. It’s our way.',
      },
    ],
    apiaryTitle: { uk: 'Наша пасіка', ru: 'Наша пасека', en: 'Our apiary' },
    apiaryFacts: [
      {
        label: { uk: 'Місцезнаходження', ru: 'Местоположение', en: 'Location' },
        value: { uk: 'Коротич, Харківська область', ru: 'Коротич, Харьковская область', en: 'Korotych, Kharkiv region' },
      },
      {
        label: { uk: 'Формат', ru: 'Формат', en: 'Format' },
        value: { uk: 'Сімейна пасіка, пряма поставка', ru: 'Семейная пасека, прямая поставка', en: 'Family apiary, direct supply' },
      },
      {
        label: { uk: 'Продукти', ru: 'Продукты', en: 'Products' },
        value: { uk: 'Мед 6 сортів, пилок, прополіс, горіхи в меду', ru: 'Мёд 6 сортов, пыльца, прополис, орехи в мёду', en: 'Honey in 6 varieties, pollen, propolis, nuts in honey' },
      },
      {
        label: { uk: 'Бджолопакети', ru: 'Пчелопакеты', en: 'Bee packages' },
        value: { uk: 'Buckfast, Українська степова, Карніка', ru: 'Buckfast, Украинская степная, Карника', en: 'Buckfast, Ukrainian Steppe, Carnica' },
      },
    ],
    approachTitle: { uk: 'Наш підхід', ru: 'Наш подход', en: 'Our approach' },
    approach: [
      {
        uk: 'Ми самі доглядаємо за вуликами, самі качаємо, самі пакуємо. Жодних посередників. Ніякого змішування сортів. Жодного підігріву меду вище природних температур.',
        ru: 'Мы сами ухаживаем за ульями, сами качаем, сами пакуем. Никаких посредников. Никакого смешивания сортов. Никакого нагрева мёда выше природных температур.',
        en: 'We tend the hives, extract and pack the honey ourselves. No middlemen. No blending of varieties. No heating honey above natural temperatures.',
      },
      {
        uk: 'Кожен сорт збирається у свій природний час: коли конкретна культура цвіте і нектар дозріває. Акація в травні, липа в липні, соняшник наприкінці серпня. Це й робить смак кожного сорту особливим.',
        ru: 'Каждый сорт собирается в своё природное время: когда конкретная культура цветёт и нектар созревает. Акация в мае, липа в июле, подсолнух в конце августа. Это и делает вкус каждого сорта особенным.',
        en: 'Each variety is gathered in its natural season, when that plant blooms and the nectar ripens. Acacia in May, linden in July, sunflower in late August. That’s what makes each variety’s taste distinct.',
      },
      {
        uk: 'Якщо меду немає — ми говоримо про це прямо. Сезонний продукт не може бути доступним цілий рік в необмеженій кількості. Ми не торгуємо тим, чого немає.',
        ru: 'Если мёда нет — мы говорим об этом прямо. Сезонный продукт не может быть доступен круглый год в неограниченном количестве. Мы не торгуем тем, чего нет.',
        en: 'If a honey is sold out, we say so plainly. A seasonal product can’t be available all year in unlimited amounts. We don’t sell what we don’t have.',
      },
    ],
    youtubeTitle: { uk: 'YouTube та контент', ru: 'YouTube и контент', en: 'YouTube & content' },
    youtubeBody: {
      uk: 'На нашому YouTube-каналі ми показуємо пасіку зсередини: підготовку до сезону, роботу з вуликами, збір та фасування меду. Підписуйтесь: ми нічого не приховуємо.',
      ru: 'На нашем YouTube-канале мы показываем пасеку изнутри: подготовку к сезону, работу с ульями, сбор и фасовку мёда. Подписывайтесь: мы ничего не скрываем.',
      en: 'On our YouTube channel we show the apiary from the inside: preparing for the season, working the hives, harvesting and bottling honey. Subscribe — we hide nothing.',
    },
    youtubeCardTitle: { uk: 'Дача TV на YouTube', ru: 'Дача TV на YouTube', en: 'Dacha TV on YouTube' },
    youtubeCardBody: {
      uk: 'Пасіка зсередини: підготовка вуликів, качка меду, робота з бджолопакетами — відкрито, без прикрас.',
      ru: 'Пасека изнутри: подготовка ульев, качка мёда, работа с пчелопакетами — открыто, без прикрас.',
      en: 'The apiary from the inside: hive prep, honey extraction, working with bee packages — openly, unvarnished.',
    },
    openChannel: { uk: 'Відкрити канал', ru: 'Открыть канал', en: 'Open channel' },
    trustTitle: { uk: 'Довіра та прозорість', ru: 'Доверие и прозрачность', en: 'Trust & transparency' },
    ctaTitle: { uk: 'Готові замовити натуральний мед?', ru: 'Готовы заказать натуральный мёд?', en: 'Ready to order natural honey?' },
    ctaBody: {
      uk: 'Перегляньте наш каталог і оберіть улюблений сорт.',
      ru: 'Посмотрите наш каталог и выберите любимый сорт.',
      en: 'Browse our catalog and pick your favourite variety.',
    },
    ctaButton: { uk: 'Перейти до каталогу', ru: 'Перейти в каталог', en: 'Go to catalog' },
  },

  contact: {
    eyebrow: { uk: 'Контакти', ru: 'Контакты', en: 'Contacts' },
    title: { uk: "Зв'язатись з нами", ru: 'Связаться с нами', en: 'Contact us' },
    intro: {
      uk: 'Відповідаємо протягом кількох годин. Найшвидший спосіб: зателефонувати.',
      ru: 'Отвечаем в течение нескольких часов. Самый быстрый способ — позвонить.',
      en: 'We reply within a few hours. The fastest way is to call.',
    },
    infoTitle: { uk: 'Контактна інформація', ru: 'Контактная информация', en: 'Contact information' },
    phonePrimary: { uk: 'Телефон (дзвінки та Viber):', ru: 'Телефон (звонки и Viber):', en: 'Phone (calls & Viber):' },
    phoneSecondary: { uk: 'Додатковий телефон:', ru: 'Дополнительный телефон:', en: 'Secondary phone:' },
    telegram: { uk: 'Telegram:', ru: 'Telegram:', en: 'Telegram:' },
    telegramWrite: { uk: 'Написати в Telegram', ru: 'Написать в Telegram', en: 'Message on Telegram' },
    addressTitle: { uk: 'Адреса', ru: 'Адрес', en: 'Address' },
    responseTitle: { uk: 'Відповідаємо протягом кількох годин', ru: 'Отвечаем в течение нескольких часов', en: 'We reply within a few hours' },
    responseBody: {
      uk: 'Найшвидший спосіб: зателефонувати або написати в Telegram.',
      ru: 'Самый быстрый способ: позвонить или написать в Telegram.',
      en: 'Fastest way: call or message us on Telegram.',
    },
    socialTitle: { uk: 'Ми в соціальних мережах:', ru: 'Мы в социальных сетях:', en: 'Find us on social media:' },
    formTitle: { uk: 'Надіслати повідомлення', ru: 'Отправить сообщение', en: 'Send a message' },
  },

  // Shared form labels, placeholders, validation + status messages.
  forms: {
    nameLabel: { uk: "Ваше ім'я", ru: 'Ваше имя', en: 'Your name' },
    namePlaceholder: { uk: "Ваше ім'я", ru: 'Ваше имя', en: 'Your name' },
    phoneLabel: { uk: 'Телефон', ru: 'Телефон', en: 'Phone' },
    messageLabel: { uk: 'Повідомлення', ru: 'Сообщение', en: 'Message' },
    messagePlaceholder: { uk: 'Ваше питання або повідомлення...', ru: 'Ваш вопрос или сообщение...', en: 'Your question or message...' },
    submit: { uk: 'Надіслати', ru: 'Отправить', en: 'Send' },
    submitting: { uk: 'Надсилаємо...', ru: 'Отправляем...', en: 'Sending...' },
    footerNote: { uk: 'Відповідаємо протягом кількох годин', ru: 'Отвечаем в течение нескольких часов', en: 'We reply within a few hours' },
    successTitle: { uk: 'Дякуємо!', ru: 'Спасибо!', en: 'Thank you!' },
    successBody: { uk: "Ми зв'яжемося з вами найближчим часом.", ru: 'Мы свяжемся с вами в ближайшее время.', en: 'We’ll get in touch shortly.' },
    sendAnother: { uk: 'Надіслати ще одне повідомлення', ru: 'Отправить ещё одно сообщение', en: 'Send another message' },
    errNameMin: { uk: "Ім'я має містити щонайменше 2 символи", ru: 'Имя должно содержать не менее 2 символов', en: 'Name must be at least 2 characters' },
    errPhone: { uk: 'Введіть номер у форматі +380XXXXXXXXX або 0XXXXXXXXX', ru: 'Введите номер в формате +380XXXXXXXXX или 0XXXXXXXXX', en: 'Enter a number as +380XXXXXXXXX or 0XXXXXXXXX' },
  },

  // Shared storefront UI (cards, listing, cart, checkout labels + validation).
  shop: {
    inStock: { uk: 'В наявності', ru: 'В наличии', en: 'In stock' },
    outOfStock: { uk: 'Немає в наявності', ru: 'Нет в наличии', en: 'Out of stock' },
    checkAvailability: { uk: 'Уточнити наявність', ru: 'Уточнить наличие', en: 'Check availability' },
    priceOnRequest: { uk: 'Уточнити ціну', ru: 'Уточнить цену', en: 'Price on request' },
    addToCart: { uk: 'До кошика', ru: 'В корзину', en: 'Add to cart' },
    added: { uk: 'Додано', ru: 'Добавлено', en: 'Added' },
    buyNow: { uk: 'Купити зараз', ru: 'Купить сейчас', en: 'Buy now' },
    more: { uk: 'Детальніше →', ru: 'Подробнее →', en: 'Details →' },
    emptyCatalog: {
      uk: 'Товарів поки немає. Завітайте пізніше або перегляньте інші розділи.',
      ru: 'Товаров пока нет. Загляните позже или посмотрите другие разделы.',
      en: 'No products yet. Check back later or browse other sections.',
    },
    emptySearch: {
      uk: 'За вашим запитом нічого не знайдено.',
      ru: 'По вашему запросу ничего не найдено.',
      en: 'Nothing matched your search.',
    },
    sortLabel: { uk: 'Сортування', ru: 'Сортировка', en: 'Sort' },
    sortFeatured: { uk: 'Рекомендовані', ru: 'Рекомендуемые', en: 'Featured' },
    sortPriceAsc: { uk: 'Спочатку дешевші', ru: 'Сначала дешевле', en: 'Price: low to high' },
    sortPriceDesc: { uk: 'Спочатку дорожчі', ru: 'Сначала дороже', en: 'Price: high to low' },
    sortNewest: { uk: 'Найновіші', ru: 'Новые', en: 'Newest' },
    sortName: { uk: 'За назвою', ru: 'По названию', en: 'By name' },
    onlyWithPrice: { uk: 'Тільки з ціною', ru: 'Только с ценой', en: 'Only with price' },
    onlyWithPhoto: { uk: 'Тільки з фото', ru: 'Только с фото', en: 'Only with photo' },
    prev: { uk: 'Назад', ru: 'Назад', en: 'Previous' },
    next: { uk: 'Далі', ru: 'Далее', en: 'Next' },
    cartTitle: { uk: 'Кошик', ru: 'Корзина', en: 'Cart' },
    cartEmpty: { uk: 'Кошик порожній', ru: 'Корзина пуста', en: 'Your cart is empty' },
    cartTotal: { uk: 'Разом', ru: 'Итого', en: 'Total' },
    checkout: { uk: 'Оформити замовлення', ru: 'Оформить заказ', en: 'Checkout' },
    remove: { uk: 'Видалити', ru: 'Удалить', en: 'Remove' },
    // Checkout revalidation errors (authoritative, server-side).
    errOutOfStock: {
      uk: 'Деякі товари закінчились: {names}. Видаліть їх з кошика, щоб оформити замовлення.',
      ru: 'Некоторые товары закончились: {names}. Удалите их из корзины, чтобы оформить заказ.',
      en: 'Some items are out of stock: {names}. Remove them from the cart to place your order.',
    },
    errStockCheckFailed: {
      uk: 'Не вдалося перевірити наявність. Спробуйте ще раз за хвилину.',
      ru: 'Не удалось проверить наличие. Попробуйте ещё раз через минуту.',
      en: 'Could not verify availability. Please try again in a minute.',
    },
    errItemUnavailable: {
      uk: 'Деякі товари більше недоступні: {names}. Оновіть кошик і спробуйте ще раз.',
      ru: 'Некоторые товары больше недоступны: {names}. Обновите корзину и попробуйте снова.',
      en: 'Some items are no longer available: {names}. Update your cart and try again.',
    },
  },
} satisfies Record<string, TrTree | { [k: string]: Tr | Tr[] | TrTree }>

// Resolve the whole dictionary for a locale. Memoized per locale so a request
// resolves the tree once. Returns plain strings (page-body friendly).
const CACHE = new Map<Locale, Resolved<typeof DICT>>()
export function pageDict(locale: Locale): Resolved<typeof DICT> {
  const hit = CACHE.get(locale)
  if (hit) return hit
  const resolved = resolve(DICT, locale)
  CACHE.set(locale, resolved)
  return resolved
}

// Raw dictionary (unresolved Tr tree) for tooling/coverage checks.
export const RAW_DICT = DICT
export type PageDict = Resolved<typeof DICT>
