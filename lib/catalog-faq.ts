import type { FaqItem } from '@/lib/schema'

// Clean, honest FAQ copy — no forbidden/superlative claims, aligned with the
// delivery/payment pages. Used to give /catalog and category pages real SEO
// content and topical/local authority (delivery across Ukraine, Kharkiv region).

export const CATALOG_FAQ: FaqItem[] = [
  {
    question: 'Як зробити замовлення в магазині Дача TV?',
    answer:
      'Оберіть товар, додайте його в кошик і оформіть замовлення — вкажіть імʼя, телефон і відділення Нової Пошти. Менеджер звʼяжеться з вами для підтвердження. Також можна замовити за телефоном.',
  },
  {
    question: 'Ви доставляєте по всій Україні?',
    answer:
      'Так, відправляємо замовлення по всій Україні Новою Поштою та іншими службами. Ми — сімейне господарство на Харківщині (смт Коротич), тож для Харкова та області можлива швидша передача.',
  },
  {
    question: 'Які способи оплати доступні?',
    answer:
      'Доступна оплата при отриманні (накладений платіж) або передоплата банківським переказом. Деталі уточнюйте при підтвердженні замовлення.',
  },
  {
    question: 'Чи можна замовити товар, якого немає в наявності?',
    answer:
      'Напишіть або зателефонуйте нам — ми уточнимо наявність і терміни у постачальника та повідомимо вас.',
  },
]

// Category-scoped FAQ — the same practical answers, phrased around one category.
export function categoryFaq(categoryName: string): FaqItem[] {
  const name = categoryName.trim()
  return [
    {
      question: `Як замовити товари з категорії «${name}»?`,
      answer:
        'Додайте потрібні товари в кошик і оформіть замовлення онлайн або зателефонуйте нам. Менеджер підтвердить замовлення та деталі доставки.',
    },
    {
      question: 'Яка доставка та оплата?',
      answer:
        'Відправляємо по всій Україні Новою Поштою. Оплата — при отриманні або передоплатою. Ми працюємо з Харківщини (смт Коротич).',
    },
  ]
}
