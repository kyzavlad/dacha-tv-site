import type { Locale } from '@/lib/i18n'
import type { FaqItem } from '@/types'

const STATIC_FAQ_UK: FaqItem[] = [
  { id: 's1', question: 'Як замовити мед?', answer: 'Ви можете залишити заявку на сайті або зателефонувати нам напряму. Ми уточнимо сорт, упаковку та спосіб доставки.', category: 'ordering', display_order: 1 },
  { id: 's2', question: 'Які сорти меду у вас є?', answer: 'Наявність залежить від сезону. Основні сорти: акація, липа, сонях, різнотрав\'я, садовий та лісовий мед.', category: 'products', display_order: 1 },
  { id: 's3', question: 'У якій упаковці доступний мед?', answer: 'Основні варіанти: 1 л пластик та 1 л скло.', category: 'products', display_order: 2 },
  { id: 's4', question: 'Чи є доставка по Україні?', answer: 'Так, ми відправляємо замовлення по Україні службами доставки.', category: 'delivery', display_order: 1 },
  { id: 's5', question: 'Чи можна замовити самовивіз?', answer: 'Так, деталі самовивозу узгоджуються під час оформлення.', category: 'delivery', display_order: 2 },
  { id: 's6', question: 'Як швидко ви відповідаєте?', answer: 'Зазвичай відповідаємо протягом кількох годин.', category: 'ordering', display_order: 2 },
  { id: 's7', question: 'Чи є у вас продукція для пасічників?', answer: 'Так, окрім меду, ми маємо продукцію для пасічників, зокрема приманку для роїв.', category: 'beekeeping', display_order: 1 },
  { id: 's8', question: 'Чи весь мед натуральний?', answer: 'Так, ми продаємо натуральний мед із власної сімейної пасіки.', category: 'products', display_order: 3 },
  { id: 's9', question: 'Чому деяких сортів може тимчасово не бути?', answer: 'Мед є сезонним продуктом, тому окремі сорти можуть бути недоступні в окремі періоди.', category: 'products', display_order: 4 },
  { id: 's10', question: 'Чи можна уточнити деталі перед замовленням?', answer: 'Так, ми завжди можемо проконсультувати перед оформленням заявки.', category: 'ordering', display_order: 3 },
]

const STATIC_FAQ_RU: FaqItem[] = [
  { id: 's1', question: 'Как заказать мёд?', answer: 'Вы можете оставить заявку на сайте или позвонить нам напрямую. Мы уточним сорт, упаковку и способ доставки.', category: 'ordering', display_order: 1 },
  { id: 's2', question: 'Какие сорта мёда у вас есть?', answer: 'Наличие зависит от сезона. Основные сорта: акация, липа, подсолнечник, разнотравье, садовый и лесной мёд.', category: 'products', display_order: 1 },
  { id: 's3', question: 'В какой упаковке доступен мёд?', answer: 'Основные варианты: пластик 1 л и стекло 1 л.', category: 'products', display_order: 2 },
  { id: 's4', question: 'Есть ли доставка по Украине?', answer: 'Да, мы отправляем заказы по Украине службами доставки.', category: 'delivery', display_order: 1 },
  { id: 's5', question: 'Можно ли заказать самовывоз?', answer: 'Да, детали самовывоза согласовываются при оформлении.', category: 'delivery', display_order: 2 },
  { id: 's6', question: 'Как быстро вы отвечаете?', answer: 'Обычно отвечаем в течение нескольких часов.', category: 'ordering', display_order: 2 },
  { id: 's7', question: 'Есть ли у вас продукция для пчеловодов?', answer: 'Да, кроме мёда, у нас есть продукция для пчеловодов, в том числе приманка для роёв.', category: 'beekeeping', display_order: 1 },
  { id: 's8', question: 'Весь ли мёд натуральный?', answer: 'Да, мы продаём натуральный мёд с собственной семейной пасеки.', category: 'products', display_order: 3 },
  { id: 's9', question: 'Почему некоторых сортов может временно не быть?', answer: 'Мёд является сезонным продуктом, поэтому отдельные сорта могут быть недоступны в некоторые периоды.', category: 'products', display_order: 4 },
  { id: 's10', question: 'Можно ли уточнить детали перед заказом?', answer: 'Да, мы всегда можем проконсультировать перед оформлением заявки.', category: 'ordering', display_order: 3 },
]

export function getStaticFaqItems(locale: Locale): FaqItem[] {
  return locale === 'ru' ? STATIC_FAQ_RU : STATIC_FAQ_UK
}
