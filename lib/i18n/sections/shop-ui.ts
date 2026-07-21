// ─── Shop UI dictionary (uk canonical, ru, en) ───────────────────────────────
// Static, visible copy for the transactional storefront surfaces: product search
// page, checkout form + order summary, the cart drawer, cart button and the
// honey add-to-cart widget. Dynamic product NAMES (cart line items, results) are
// never here — they come from the stored item name / DB translation rows.
//
// Usage (server component):
//   const locale = await getRequestLocale()
//   const t = shopUiDict(locale)
//   <h1>{t.searchTitle}</h1>
//
// Client components ('use client') accept a `locale?` prop (default uk) or derive
// it from the URL and call shopUiDict(locale) themselves. Only visible COPY is
// localized here — no checkout/validation RULES or data flow live in this file.

import type { Locale } from '@/lib/i18n'
import { tr, type Tr } from '@/lib/i18n/pages'

const D = {
  // ── Search page ──
  searchTitle: { uk: 'Пошук товарів', ru: 'Поиск товаров', en: 'Product search' },
  searchPrompt: {
    uk: 'Введіть запит, щоб знайти товари за назвою або артикулом.',
    ru: 'Введите запрос, чтобы найти товары по названию или артикулу.',
    en: 'Enter a query to search products by name or SKU.',
  },
  searchEmpty: {
    uk: 'Не знайшли потрібну деталь? Напишіть нам — допоможемо підібрати.',
    ru: 'Не нашли нужную деталь? Напишите нам — поможем подобрать.',
    en: "Didn't find the part you need? Message us — we'll help you choose.",
  },
  searchContact: { uk: "Зв'язатися з нами", ru: 'Связаться с нами', en: 'Contact us' },

  // ── Checkout: success screen ──
  successTitle: { uk: 'Дякуємо за замовлення!', ru: 'Спасибо за заказ!', en: 'Thank you for your order!' },
  successBody: {
    uk: 'Ваше замовлення прийнято та передано на комплектацію.',
    ru: 'Ваш заказ принят и передан на комплектацию.',
    en: 'Your order has been received and passed on for fulfilment.',
  },
  successHome: { uk: 'На головну', ru: 'На главную', en: 'Home' },

  // ── Checkout: empty-cart guard ──
  emptyCartText: { uk: 'Кошик порожній', ru: 'Корзина пуста', en: 'Your cart is empty' },
  backToShopping: { uk: 'Повернутися до покупок', ru: 'Вернуться к покупкам', en: 'Back to shopping' },

  // ── Checkout: header / breadcrumb ──
  crumbHome: { uk: 'Головна', ru: 'Главная', en: 'Home' },
  crumbCheckout: { uk: 'Оформлення замовлення', ru: 'Оформление заказа', en: 'Checkout' },
  checkoutTitle: { uk: 'Оформлення замовлення', ru: 'Оформление заказа', en: 'Checkout' },

  // ── Checkout: recipient fields ──
  recipientTitle: { uk: 'Отримувач', ru: 'Получатель', en: 'Recipient' },
  lastNameLabel: { uk: 'Прізвище', ru: 'Фамилия', en: 'Last name' },
  lastNamePlaceholder: { uk: 'Іваненко', ru: 'Иваненко', en: 'Ivanenko' },
  firstNameLabel: { uk: "Ім'я", ru: 'Имя', en: 'First name' },
  firstNamePlaceholder: { uk: 'Іван', ru: 'Иван', en: 'Ivan' },
  cyrillicHint: {
    uk: 'Введіть кирилицею, наприклад: Іван / Кузьменко',
    ru: 'Введите кириллицей, например: Иван / Кузьменко',
    en: 'Enter in Cyrillic, e.g. Іван / Кузьменко',
  },

  // ── Checkout: phone ──
  phoneLabel: { uk: 'Номер телефону', ru: 'Номер телефона', en: 'Phone number' },
  phonePlaceholder: {
    uk: '+380XXXXXXXXX або 0XXXXXXXXX',
    ru: '+380XXXXXXXXX или 0XXXXXXXXX',
    en: '+380XXXXXXXXX or 0XXXXXXXXX',
  },
  phoneHint: {
    uk: 'Введіть номер у форматі +380XXXXXXXXX або 0XXXXXXXXX',
    ru: 'Введите номер в формате +380XXXXXXXXX или 0XXXXXXXXX',
    en: 'Enter a number as +380XXXXXXXXX or 0XXXXXXXXX',
  },
  phoneError: {
    uk: 'Введіть коректний номер телефону (+380XXXXXXXXX або 0XXXXXXXXX)',
    ru: 'Введите корректный номер телефона (+380XXXXXXXXX или 0XXXXXXXXX)',
    en: 'Enter a valid phone number (+380XXXXXXXXX or 0XXXXXXXXX)',
  },

  // ── Checkout: payment method ──
  paymentTitle: { uk: 'Спосіб оплати', ru: 'Способ оплаты', en: 'Payment method' },
  payCodLabel: { uk: 'Накладний платіж', ru: 'Наложенный платёж', en: 'Cash on delivery' },
  payCodDesc: { uk: 'Оплата при отриманні', ru: 'Оплата при получении', en: 'Pay on receipt' },
  payPrepayLabel: { uk: 'Передоплата', ru: 'Предоплата', en: 'Prepayment' },
  payPrepayDesc: { uk: 'Оплата до відправки', ru: 'Оплата до отправки', en: 'Pay before shipping' },
  payLockedHint: {
    uk: 'Передплата буде доступна після підтвердження менеджером',
    ru: 'Предоплата будет доступна после подтверждения менеджером',
    en: 'Prepayment becomes available after a manager confirms',
  },

  // ── Checkout: Nova Poshta warehouse picker ──
  warehouseLabel: { uk: 'Відділення Нової Пошти', ru: 'Отделение Новой Почты', en: 'Nova Poshta branch' },
  warehousePlaceholder: {
    uk: 'Населений пункт або відділення (наприклад: Пісочин)',
    ru: 'Населённый пункт или отделение (например: Песочин)',
    en: 'Town or branch (e.g. Pisochyn)',
  },
  warehouseAriaLabel: {
    uk: 'Населений пункт або відділення Нової Пошти',
    ru: 'Населённый пункт или отделение Новой Почты',
    en: 'Town or Nova Poshta branch',
  },
  warehouseResultsAria: {
    uk: 'Результати пошуку відділень',
    ru: 'Результаты поиска отделений',
    en: 'Branch search results',
  },
  warehouseShortHint: { uk: 'Введіть населений пункт', ru: 'Введите населённый пункт', en: 'Enter a town' },
  warehouseSearching: {
    uk: 'Шукаємо відділення Нової Пошти…',
    ru: 'Ищем отделения Новой Почты…',
    en: 'Searching Nova Poshta branches…',
  },
  warehouseSlowHint: {
    uk: 'Перший пошук може тривати кілька секунд.',
    ru: 'Первый поиск может занять несколько секунд.',
    en: 'The first search can take a few seconds.',
  },
  warehouseSelected: { uk: 'Обрано:', ru: 'Выбрано:', en: 'Selected:' },
  warehouseErrSearch: { uk: 'Помилка пошуку', ru: 'Ошибка поиска', en: 'Search error' },
  warehouseNotFound: {
    uk: 'Населений пункт або відділення не знайдено',
    ru: 'Населённый пункт или отделение не найдено',
    en: 'Town or branch not found',
  },
  warehouseErrConnection: { uk: "Помилка з'єднання", ru: 'Ошибка соединения', en: 'Connection error' },
  warehouseError: {
    uk: 'Оберіть відділення Нової Пошти',
    ru: 'Выберите отделение Новой Почты',
    en: 'Choose a Nova Poshta branch',
  },

  // ── Checkout: comment ──
  commentLabel: { uk: 'Коментар', ru: 'Комментарий', en: 'Comment' },
  commentOptional: { uk: '(необов’язково)', ru: '(необязательно)', en: '(optional)' },
  commentPlaceholder: {
    uk: 'Будь-які побажання або уточнення',
    ru: 'Любые пожелания или уточнения',
    en: 'Any wishes or details',
  },

  // ── Checkout: submit + notes ──
  submit: { uk: 'Оформити замовлення', ru: 'Оформить заказ', en: 'Place order' },
  submitting: { uk: 'Оформлюємо…', ru: 'Оформляем…', en: 'Placing order…' },
  afterSubmitNote: {
    uk: 'Після підтвердження ми зателефонуємо та узгодимо деталі доставки',
    ru: 'После подтверждения мы позвоним и согласуем детали доставки',
    en: 'After confirmation we will call to arrange the delivery details',
  },

  // ── Checkout: order summary ──
  orderSummaryTitle: { uk: 'Ваше замовлення', ru: 'Ваш заказ', en: 'Your order' },
  total: { uk: 'Разом', ru: 'Итого', en: 'Total' },
  summaryNote: {
    uk: 'Доставка: Нова Пошта. Оплата при отриманні або передоплата.',
    ru: 'Доставка: Новая Почта. Оплата при получении или предоплата.',
    en: 'Delivery: Nova Poshta. Payment on receipt or prepayment.',
  },
  infoDelivery: {
    uk: 'Доставка по Україні: Нова Пошта',
    ru: 'Доставка по Украине: Новая Почта',
    en: 'Delivery across Ukraine: Nova Poshta',
  },
  infoPayment: {
    uk: 'Оплата при отриманні або передоплата',
    ru: 'Оплата при получении или предоплата',
    en: 'Payment on receipt or prepayment',
  },
  infoCall: {
    uk: 'Підтвердимо дзвінком після отримання заявки',
    ru: 'Подтвердим звонком после получения заявки',
    en: 'We confirm by phone after receiving your request',
  },

  // ── Cart drawer ──
  cartTitle: { uk: 'Кошик', ru: 'Корзина', en: 'Cart' },
  cartCloseAria: { uk: 'Закрити кошик', ru: 'Закрыть корзину', en: 'Close cart' },
  cartEmpty: { uk: 'Кошик порожній', ru: 'Корзина пуста', en: 'Your cart is empty' },
  cartEmptyHint: {
    uk: 'Додайте товари, щоб продовжити',
    ru: 'Добавьте товары, чтобы продолжить',
    en: 'Add products to continue',
  },
  qtyDecrease: { uk: 'Зменшити кількість', ru: 'Уменьшить количество', en: 'Decrease quantity' },
  qtyIncrease: { uk: 'Збільшити кількість', ru: 'Увеличить количество', en: 'Increase quantity' },
  remove: { uk: 'Видалити', ru: 'Удалить', en: 'Remove' },
  checkout: { uk: 'Оформити замовлення', ru: 'Оформить заказ', en: 'Place order' },
  continueShopping: { uk: 'Продовжити покупки', ru: 'Продолжить покупки', en: 'Continue shopping' },

  // ── Cart button (aria) ──
  cartItemOne: { uk: 'товар', ru: 'товар', en: 'item' },
  cartItemMany: { uk: 'товарів', ru: 'товаров', en: 'items' },

  // ── Honey add-to-cart widget ──
  outOfStock: { uk: 'Немає в наявності', ru: 'Нет в наличии', en: 'Out of stock' },
  priceOnRequest: { uk: 'Уточнити ціну', ru: 'Уточнить цену', en: 'Price on request' },
} satisfies Record<string, Tr>

export function shopUiDict(locale: Locale) {
  const out = {} as Record<keyof typeof D, string>
  for (const k in D) out[k as keyof typeof D] = tr(D[k as keyof typeof D], locale)
  return out
}

// Raw dictionary (unresolved Tr map) for tooling/coverage checks.
export const RAW_SHOP_UI = D
