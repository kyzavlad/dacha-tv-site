import type { Locale } from '@/lib/i18n'

export const RETURNS_POLICY_PATH = '/returns'
export const RETURNS_POLICY_UPDATED_AT = '30.08.2026'

interface ReturnsPolicyCopy {
  eyebrow: string
  title: string
  intro: string
  updatedLabel: string
  summary: Array<{ title: string; body: string }>
  sections: Array<{ heading: string; body?: string; bullets?: string[] }>
  contactTitle: string
  contactBody: string
  contactCta: string
  legalNote: string
}

const COPY: Record<Locale, ReturnsPolicyCopy> = {
  uk: {
    eyebrow: 'Покупки без зайвого ризику',
    title: 'Повернення, обмін і відшкодування',
    intro:
      'Ми за прозорі правила: нижче зібрано, які товари можна повернути або обміняти, хто оплачує доставку та коли повертаються кошти.',
    updatedLabel: 'Актуально станом на',
    summary: [
      {
        title: '14 днів',
        body: 'Для обміну або повернення непродовольчих товарів належної якості, якщо закон не встановлює виняток.',
      },
      {
        title: 'Без комісії',
        body: 'Ми не стягуємо окрему комісію за повернення або відновлення товару.',
      },
      {
        title: 'До 7 днів',
        body: 'Якщо кошти неможливо повернути в день розірвання договору, повертаємо їх у погоджений строк, але не пізніше 7 днів.',
      },
    ],
    sections: [
      {
        heading: '1. Товар належної якості',
        body:
          'Непродовольчий товар належної якості можна обміняти протягом 14 днів, не рахуючи дня купівлі, якщо товар не використовувався та збережено його товарний вигляд, споживчі властивості, пломби, ярлики й розрахунковий документ. Якщо аналогічного товару немає, можна обрати інший товар із перерахунком вартості або погодити повернення коштів.',
      },
      {
        heading: '2. Товари, для яких повернення належної якості обмежене законом',
        body:
          'Продовольчі товари та інші категорії з чинного переліку Кабінету Міністрів України не підлягають обміну або поверненню лише з причини, що вони не підійшли, якщо вони належної якості. Це не обмежує права покупця у випадку недоліків, непридатності або помилки в замовленні.',
      },
      {
        heading: '3. Пошкоджений, непридатний або не той товар',
        body:
          'Якщо ви отримали товар із недоліком, непридатний харчовий продукт, пошкодження під час доставки або товар, що не відповідає замовленню, зверніться до нас якомога швидше. Ми перевіримо ситуацію та погодимо заміну, усунення недоліку або повернення коштів відповідно до законодавства.',
        bullets: [
          'Збережіть товар, упаковку та документ про оплату до завершення перевірки.',
          'Для пошкодження або невідповідності додайте фото товару й упаковки — це прискорить вирішення.',
          'Якщо помилка або дефект на нашому боці, витрати на погоджену зворотну доставку беремо на себе.',
        ],
      },
      {
        heading: '4. Як оформити повернення або обмін',
        bullets: [
          'Зателефонуйте за номером, указаним у контактах, або надішліть звернення через форму на сайті.',
          'Вкажіть ім’я, номер телефону, товар, орієнтовну дату замовлення та причину звернення.',
          'Ми підтвердимо, чи підлягає товар поверненню, і надамо актуальні реквізити/пункт для відправлення Новою Поштою або погодимо особисту передачу.',
          'Надішліть товар із номером відстеження. Не відправляйте посилку післяплатою без окремого погодження.',
          'Після отримання та перевірки товару підтвердимо обмін або спосіб повернення коштів.',
        ],
      },
      {
        heading: '5. Вартість зворотної доставки',
        bullets: [
          'Для повернення або обміну товару належної якості через те, що він не підійшов, зворотну доставку оплачує покупець.',
          'Для помилково відправленого, пошкодженого або дефектного товару погоджену зворотну доставку оплачує або компенсує Дача TV.',
          'Окремої комісії за повернення (restocking fee) немає.',
        ],
      },
      {
        heading: '6. Повернення коштів',
        body:
          'Повертаємо кошти тим самим способом, яким це технічно можливо, або банківським переказом за погодженням із покупцем. За поверненням товару належної якості розрахунок проводиться виходячи з його вартості на час купівлі. Кошти повертаються в день розірвання договору, а якщо це неможливо — в інший погоджений строк, але не пізніше ніж протягом 7 днів.',
      },
      {
        heading: '7. Що підготувати для звернення',
        bullets: [
          'ПІБ або ім’я, на яке оформлювали замовлення.',
          'Контактний номер телефону.',
          'Назву товару та, за можливості, номер замовлення або розрахунковий документ.',
          'Короткий опис причини повернення/обміну.',
          'Фото або відео, якщо йдеться про дефект, пошкодження чи невідповідність.',
        ],
      },
    ],
    contactTitle: 'Потрібно оформити повернення?',
    contactBody:
      'Напишіть нам через форму зворотного зв’язку або зателефонуйте. Ми підтвердимо порядок дій і актуальні реквізити для відправлення.',
    contactCta: 'Зв’язатися з нами',
    legalNote:
      'Політика застосовується разом із чинним законодавством України. Якщо закон передбачає для споживача ширші права, застосовуються вимоги закону.',
  },
  ru: {
    eyebrow: 'Покупки без лишнего риска',
    title: 'Возврат, обмен и возмещение',
    intro:
      'Мы за прозрачные правила: ниже указано, какие товары можно вернуть или обменять, кто оплачивает доставку и когда возвращаются деньги.',
    updatedLabel: 'Актуально по состоянию на',
    summary: [
      {
        title: '14 дней',
        body: 'Для обмена или возврата непродовольственных товаров надлежащего качества, если законом не установлен исключительный случай.',
      },
      {
        title: 'Без комиссии',
        body: 'Мы не взимаем отдельную комиссию за возврат или восстановление товара.',
      },
      {
        title: 'До 7 дней',
        body: 'Если деньги невозможно вернуть в день расторжения договора, возвращаем их в согласованный срок, но не позднее 7 дней.',
      },
    ],
    sections: [
      {
        heading: '1. Товар надлежащего качества',
        body:
          'Непродовольственный товар надлежащего качества можно обменять в течение 14 дней, не считая дня покупки, если товар не использовался и сохранены его товарный вид, потребительские свойства, пломбы, ярлыки и расчетный документ. Если аналогичного товара нет, можно выбрать другой товар с перерасчетом стоимости или согласовать возврат денег.',
      },
      {
        heading: '2. Товары, возврат надлежащего качества которых ограничен законом',
        body:
          'Продовольственные товары и другие категории из действующего перечня Кабинета Министров Украины не подлежат обмену или возврату только по причине, что они не подошли, если они надлежащего качества. Это не ограничивает права покупателя при наличии недостатков, непригодности или ошибки в заказе.',
      },
      {
        heading: '3. Поврежденный, непригодный или неверный товар',
        body:
          'Если вы получили товар с недостатком, непригодный пищевой продукт, повреждение при доставке или товар, не соответствующий заказу, свяжитесь с нами как можно быстрее. Мы проверим ситуацию и согласуем замену, устранение недостатка или возврат денег в соответствии с законодательством.',
        bullets: [
          'Сохраните товар, упаковку и документ об оплате до завершения проверки.',
          'Для повреждения или несоответствия приложите фото товара и упаковки — это ускорит решение.',
          'Если ошибка или дефект на нашей стороне, расходы на согласованную обратную доставку берем на себя.',
        ],
      },
      {
        heading: '4. Как оформить возврат или обмен',
        bullets: [
          'Позвоните по номеру, указанному в контактах, или отправьте обращение через форму на сайте.',
          'Укажите имя, номер телефона, товар, примерную дату заказа и причину обращения.',
          'Мы подтвердим, подлежит ли товар возврату, и предоставим актуальные реквизиты/пункт для отправки Новой Почтой или согласуем личную передачу.',
          'Отправьте товар с номером отслеживания. Не отправляйте посылку наложенным платежом без отдельного согласования.',
          'После получения и проверки товара подтвердим обмен или способ возврата денег.',
        ],
      },
      {
        heading: '5. Стоимость обратной доставки',
        bullets: [
          'При возврате или обмене товара надлежащего качества из-за того, что он не подошел, обратную доставку оплачивает покупатель.',
          'Для ошибочно отправленного, поврежденного или дефектного товара согласованную обратную доставку оплачивает или компенсирует Дача TV.',
          'Отдельной комиссии за возврат (restocking fee) нет.',
        ],
      },
      {
        heading: '6. Возврат денег',
        body:
          'Возвращаем деньги тем же способом, когда это технически возможно, либо банковским переводом по согласованию с покупателем. При возврате товара надлежащего качества расчет проводится исходя из его стоимости на момент покупки. Деньги возвращаются в день расторжения договора, а если это невозможно — в другой согласованный срок, но не позднее чем в течение 7 дней.',
      },
      {
        heading: '7. Что подготовить для обращения',
        bullets: [
          'ФИО или имя, на которое оформлялся заказ.',
          'Контактный номер телефона.',
          'Название товара и, по возможности, номер заказа или расчетный документ.',
          'Краткое описание причины возврата/обмена.',
          'Фото или видео, если речь о дефекте, повреждении или несоответствии.',
        ],
      },
    ],
    contactTitle: 'Нужно оформить возврат?',
    contactBody:
      'Напишите нам через форму обратной связи или позвоните. Мы подтвердим порядок действий и актуальные реквизиты для отправки.',
    contactCta: 'Связаться с нами',
    legalNote:
      'Политика применяется вместе с действующим законодательством Украины. Если закон предусматривает для потребителя более широкие права, применяются требования закона.',
  },
  en: {
    eyebrow: 'Shop with clear rules',
    title: 'Returns, exchanges and refunds',
    intro:
      'We keep the process transparent: below you can see which goods may be returned or exchanged, who pays return shipping, and when refunds are issued.',
    updatedLabel: 'Effective as of',
    summary: [
      {
        title: '14 days',
        body: 'For eligible non-food goods of proper quality unless a statutory exception applies.',
      },
      {
        title: 'No restocking fee',
        body: 'Dacha TV does not charge a separate return or restocking fee.',
      },
      {
        title: 'Up to 7 days',
        body: 'If a refund cannot be made on the day the sale is terminated, it is issued within the agreed period and no later than 7 days.',
      },
    ],
    sections: [
      {
        heading: '1. Goods of proper quality',
        body:
          'Eligible non-food goods of proper quality may be exchanged within 14 days, excluding the day of purchase, if they have not been used and their presentation, consumer properties, seals, labels, and proof of purchase are preserved. If an equivalent item is unavailable, you may choose another item with a price adjustment or agree on a refund.',
      },
      {
        heading: '2. Categories restricted by law',
        body:
          'Food products and other categories listed by the applicable Cabinet of Ministers of Ukraine rules cannot be returned merely because they are unwanted when they are of proper quality. This does not limit customer rights where an item is defective, unfit, damaged, or was supplied incorrectly.',
      },
      {
        heading: '3. Damaged, defective, unfit, or incorrect goods',
        body:
          'If you receive a defective item, an unfit food product, shipping damage, or a product that does not match your order, contact us as soon as reasonably possible. We will review the case and arrange a replacement, remedy, or refund as required by law.',
        bullets: [
          'Keep the product, packaging, and proof of payment until the review is complete.',
          'For damage or mismatch, include photos of the item and packaging to speed up resolution.',
          'Where the mistake or defect is ours, Dacha TV covers the agreed return-shipping cost.',
        ],
      },
      {
        heading: '4. How to request a return or exchange',
        bullets: [
          'Call the phone number shown on our Contact page or send a message through the website contact form.',
          'Provide your name, phone number, product, approximate order date, and reason for the request.',
          'We will confirm eligibility and provide the current Nova Poshta return destination/details or arrange an in-person handover.',
          'Send the parcel with tracking. Do not send it cash-on-delivery unless we have explicitly agreed to that method.',
          'After receipt and inspection, we will confirm the exchange or refund method.',
        ],
      },
      {
        heading: '5. Return shipping cost',
        bullets: [
          'For an eligible proper-quality item returned because it is unwanted or unsuitable, the customer pays return shipping.',
          'For an incorrect, damaged, or defective item, Dacha TV pays or reimburses the agreed return shipping.',
          'There is no separate restocking fee.',
        ],
      },
      {
        heading: '6. Refunds',
        body:
          'Refunds are made through the original method where technically possible, or by bank transfer as agreed with the customer. For a proper-quality return, the refund is based on the purchase price. Funds are returned on the day the sale is terminated, or, if that is not possible, within another agreed period but no later than 7 days.',
      },
      {
        heading: '7. What to include in your request',
        bullets: [
          'The name used for the order.',
          'Your contact phone number.',
          'Product name and, where available, the order number or proof of purchase.',
          'A short reason for the return or exchange.',
          'Photos or video if the issue is a defect, damage, or mismatch.',
        ],
      },
    ],
    contactTitle: 'Need to arrange a return?',
    contactBody:
      'Use our contact form or call us. We will confirm the steps and provide the current shipping details for your return.',
    contactCta: 'Contact us',
    legalNote:
      'This policy applies together with the laws of Ukraine. Where applicable law grants the consumer broader rights, the statutory rights prevail.',
  },
}

export function returnsPolicyCopy(locale: Locale): ReturnsPolicyCopy {
  return COPY[locale] ?? COPY.uk
}
