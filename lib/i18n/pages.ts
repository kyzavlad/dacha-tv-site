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
      uk: 'Український інтернет-магазин широкого асортименту з доставкою по Україні. Власні продукти й локальні напрямки — окремими розділами.',
      ru: 'Украинский интернет-магазин широкого ассортимента с доставкой по Украине. Собственные продукты и локальные направления — в отдельных разделах.',
      en: 'A Ukrainian online store with a broad assortment and delivery across Ukraine. Own products and local services are in dedicated sections.',
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
      uk: 'Замовлення з каталогу — Новою Поштою. Продукти нашого господарства — Новою Поштою чи Укрпоштою, або самовивозом.',
      ru: 'Заказы из каталога — Новой Почтой. Продукты нашего хозяйства — Новой Почтой или Укрпочтой, либо самовывозом.',
      en: 'Catalog orders ship via Nova Poshta. Our own farm products ship via Nova Poshta or Ukrposhta, or by self-pickup.',
    },
    questionsTitle: { uk: 'Є питання щодо доставки?', ru: 'Есть вопросы по доставке?', en: 'Questions about delivery?' },
    questionsBody: {
      uk: 'Зателефонуйте або напишіть: відповімо швидко',
      ru: 'Позвоните или напишите — ответим быстро',
      en: 'Call or message us — we reply quickly',
    },
    sections: [
      {
        heading: { uk: 'Товари з каталогу', ru: 'Товары из каталога', en: 'Catalog goods' },
        body: {
          uk: 'Замовлення з каталогу оформлюються на сайті й відправляються Новою Поштою — під час оформлення потрібно обрати відділення. Оплата на вибір: накладений платіж при отриманні або передоплата до відправки. Передоплату ми узгоджуємо з вами після підтвердження замовлення менеджером — сайт не списує кошти з картки. Частина товарів у каталозі — від перевірених виробників і партнерів, тож менеджер підтверджує наявність перед відправкою.',
          ru: 'Заказы из каталога оформляются на сайте и отправляются Новой Почтой — при оформлении нужно выбрать отделение. Оплата на выбор: наложенный платёж при получении или предоплата до отправки. Предоплату мы согласовываем с вами после подтверждения заказа менеджером — сайт не списывает средства с карты. Часть товаров в каталоге — от проверенных производителей и партнёров, поэтому менеджер подтверждает наличие перед отправкой.',
          en: 'Catalog orders are placed on the site and ship via Nova Poshta — you choose a branch during checkout. Payment is your choice: cash on delivery on receipt, or prepayment before shipping. Prepayment is arranged with you after a manager confirms the order — the site does not charge your card. Some catalog goods come from trusted producers and partners, so a manager confirms availability before shipping.',
        },
      },
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
          uk: 'Замовлення з каталогу: накладений платіж при отриманні або передоплата до відправки — спосіб ви обираєте на сайті. Продукти нашого господарства, бджолопакети та послуги: банківський переказ (Monobank) або готівка при самовивозі чи особистій передачі. Сайт не приймає оплату карткою онлайн — реквізити для передоплати менеджер надає після підтвердження замовлення.',
          ru: 'Заказы из каталога: наложенный платёж при получении или предоплата до отправки — способ вы выбираете на сайте. Продукты нашего хозяйства, пчелопакеты и услуги: банковский перевод (Monobank) или наличные при самовывозе либо личной передаче. Сайт не принимает оплату картой онлайн — реквизиты для предоплаты менеджер предоставляет после подтверждения заказа.',
          en: 'Catalog orders: cash on delivery on receipt, or prepayment before shipping — you choose the method on the site. Our own farm products, bee packages and services: bank transfer (Monobank), or cash on self-pickup or handover. The site does not take card payments online — a manager provides prepayment details after confirming the order.',
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
      uk: 'Відповіді на поширені запитання про товари Dacha TV, замовлення, оплату, доставку, власні продукти та окремі напрямки.',
      ru: 'Ответы на частые вопросы о товарах Dacha TV, заказах, оплате, доставке, собственных продуктах и отдельных направлениях.',
      en: 'Answers to common questions about Dacha TV products, ordering, payment, delivery, own products and dedicated sections.',
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
    title: { uk: 'Про Dacha TV', ru: 'О Dacha TV', en: 'About Dacha TV' },
    intro: {
      uk: 'Dacha TV — український інтернет-магазин широкого асортименту з власними напрямками: продукти господарства, квіти, лаванда, пасіка та локальні послуги.',
      ru: 'Dacha TV — украинский интернет-магазин широкого ассортимента с собственными направлениями: продукты хозяйства, цветы, лаванда, пасека и локальные услуги.',
      en: 'Dacha TV is a Ukrainian online store with a broad assortment and dedicated own sections for farm products, flowers, lavender, the apiary and local services.',
    },
    storyTitle: { uk: 'Наша історія', ru: 'Наша история', en: 'Our story' },
    story: [
      {
        uk: 'Dacha TV виріс із сімейного господарства та YouTube-каналу на Харківщині. Сьогодні головний онлайн-напрям бренду — великий інтернет-магазин, де ми продаємо широкий асортимент товарів з доставкою по Україні.',
        ru: 'Dacha TV вырос из семейного хозяйства и YouTube-канала на Харьковщине. Сегодня главное онлайн-направление бренда — большой интернет-магазин с широким ассортиментом товаров и доставкой по Украине.',
        en: 'Dacha TV grew from a family farm and YouTube channel in the Kharkiv region. Today the brand’s main online direction is a large online store with a broad assortment and delivery across Ukraine.',
      },
      {
        uk: 'Пасіка, натуральні продукти, квіти та лаванда залишаються справжньою частиною Dacha TV, але це окремі власні напрямки бренду. Основний каталог магазину значно ширший і включає товари від перевірених виробників та партнерів.',
        ru: 'Пасека, натуральные продукты, цветы и лаванда остаются реальной частью Dacha TV, но это отдельные собственные направления бренда. Основной каталог магазина значительно шире и включает товары проверенных производителей и партнёров.',
        en: 'The apiary, natural products, flowers and lavender remain genuine parts of Dacha TV, but they are separate own sections of the brand. The main store catalog is much broader and includes goods from trusted manufacturers and partners.',
      },
      {
        uk: 'Наш принцип простий: не видавати партнерський асортимент за власне виробництво, показувати актуальні ціни й наявність та давати покупцю зрозумілий шлях від пошуку товару до замовлення й доставки.',
        ru: 'Наш принцип прост: не выдавать партнёрский ассортимент за собственное производство, показывать актуальные цены и наличие и давать покупателю понятный путь от поиска товара до заказа и доставки.',
        en: 'Our principle is simple: never present partner inventory as our own production, show current prices and availability, and give customers a clear path from product search to order and delivery.',
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
    approachTitle: { uk: 'Як працює Dacha TV', ru: 'Как работает Dacha TV', en: 'How Dacha TV works' },
    approach: [
      {
        uk: 'Для великого каталогу Dacha TV працює як інтернет-магазин: товари постачають перевірені виробники й партнери, а ми відповідаємо за зручний каталог, замовлення, комунікацію та організацію доставки.',
        ru: 'Для большого каталога Dacha TV работает как интернет-магазин: товары поставляют проверенные производители и партнёры, а мы отвечаем за удобный каталог, заказ, коммуникацию и организацию доставки.',
        en: 'For the main catalog Dacha TV operates as an online retailer: goods come from trusted manufacturers and partners, while we handle product discovery, ordering, communication and delivery coordination.',
      },
      {
        uk: 'Власні продукти господарства, квіти, лаванда та пасіка винесені в окремі розділи. Там ми прямо вказуємо сезонність, умови замовлення та те, що справді робимо або вирощуємо самі.',
        ru: 'Собственные продукты хозяйства, цветы, лаванда и пасека вынесены в отдельные разделы. Там мы прямо указываем сезонность, условия заказа и то, что действительно делаем или выращиваем сами.',
        en: 'Our own farm products, flowers, lavender and apiary are kept in dedicated sections. There we state seasonality, ordering terms and what we genuinely make or grow ourselves.',
      },
      {
        uk: 'Для всіх напрямків діє одна логіка: не обіцяти того, чого немає, підтверджувати замовлення й наявність та чітко пояснювати доставку, оплату й повернення.',
        ru: 'Для всех направлений действует одна логика: не обещать того, чего нет, подтверждать заказ и наличие и понятно объяснять доставку, оплату и возврат.',
        en: 'The same rule applies across all sections: don’t promise unavailable goods, confirm orders and availability, and explain delivery, payment and returns clearly.',
      },
    ],
    youtubeTitle: { uk: 'YouTube та контент', ru: 'YouTube и контент', en: 'YouTube & content' },
    youtubeBody: {
      uk: 'На YouTube та в соцмережах Dacha TV ми показуємо реальну роботу бренду: господарство, пасіку, дачу, товари, огляди та практичні рішення.',
      ru: 'На YouTube и в соцсетях Dacha TV мы показываем реальную работу бренда: хозяйство, пасеку, дачу, товары, обзоры и практические решения.',
      en: 'On Dacha TV’s YouTube and social channels we show the brand’s real work: the farm, apiary, dacha, products, reviews and practical solutions.',
    },
    youtubeCardTitle: { uk: 'Дача TV на YouTube', ru: 'Дача TV на YouTube', en: 'Dacha TV on YouTube' },
    youtubeCardBody: {
      uk: 'Дача, господарство, пасіка, товари, огляди й практичні рішення — відкрито та без вигаданих історій.',
      ru: 'Дача, хозяйство, пасека, товары, обзоры и практические решения — открыто и без выдуманных историй.',
      en: 'The dacha, farm, apiary, products, reviews and practical solutions — openly and without invented stories.',
    },
    openChannel: { uk: 'Відкрити канал', ru: 'Открыть канал', en: 'Open channel' },
    trustTitle: { uk: 'Довіра та прозорість', ru: 'Доверие и прозрачность', en: 'Trust & transparency' },
    ctaTitle: { uk: 'Перейти до магазину Dacha TV', ru: 'Перейти в магазин Dacha TV', en: 'Browse the Dacha TV store' },
    ctaBody: {
      uk: 'Знайдіть потрібний товар у каталозі або скористайтеся пошуком за назвою чи артикулом.',
      ru: 'Найдите нужный товар в каталоге или воспользуйтесь поиском по названию или артикулу.',
      en: 'Find the product you need in the catalog or search by name or SKU.',
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
