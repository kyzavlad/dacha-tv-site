'use client'

import { useMemo, useState } from 'react'
import type { Review } from '@/types'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { homeDict } from '@/lib/i18n/sections/home'
import { tr, type Tr } from '@/lib/i18n/pages'

interface ReviewsProps {
  reviews?: Review[]
  locale?: Locale
}

// Curated fallback testimonials (shown only when fewer than 3 DB reviews exist).
// quote + tag are localized; reviewer names/cities are Ukrainian proper nouns
// kept verbatim across locales.
const CURATED_REVIEWS: Array<{ quote: Tr; name: string; city: string; tag: Tr; rating: number }> = [
  { quote: { uk: 'Мед справжній, ароматний, кристалізується як натуральний. Замовляю вже третій раз.', ru: 'Мёд настоящий, ароматный, кристаллизуется как натуральный. Заказываю уже третий раз.', en: 'The honey is real, fragrant, crystallizes like natural honey. Ordering for the third time already.' }, name: 'Олена', city: 'Харків', tag: { uk: 'Мед', ru: 'Мёд', en: 'Honey' }, rating: 5 },
  { quote: { uk: 'Акацієвий мед брали на подарунок — смак ніжний, баночка акуратна, усе гарно запаковано.', ru: 'Акациевый мёд брали в подарок — вкус нежный, баночка аккуратная, всё красиво упаковано.', en: 'We bought acacia honey as a gift — delicate taste, neat jar, everything nicely packaged.' }, name: 'Дмитро', city: 'Харків', tag: { uk: 'Мед', ru: 'Мёд', en: 'Honey' }, rating: 5 },
  { quote: { uk: 'Брали пилок і прополіс. Все свіже, якісне, відправили швидко Новою Поштою.', ru: 'Брали пыльцу и прополис. Всё свежее, качественное, отправили быстро Новой Почтой.', en: 'We bought pollen and propolis. All fresh, high quality, shipped quickly via Nova Poshta.' }, name: 'Андрій', city: 'Полтава', tag: { uk: 'Продукти', ru: 'Продукты', en: 'Products' }, rating: 5 },
  { quote: { uk: 'Горіхи в меду дуже сподобались. Видно, що роблять не масово, а нормально для людей.', ru: 'Орехи в мёду очень понравились. Видно, что делают не массово, а нормально для людей.', en: 'We loved the nuts in honey. You can tell it’s made with care, not mass-produced.' }, name: 'Світлана', city: 'Люботин', tag: { uk: 'Продукти', ru: 'Продукты', en: 'Products' }, rating: 5 },
  { quote: { uk: 'Замовляла букет на свято — квіти свіжі, зібрані красиво, привезли вчасно.', ru: 'Заказывала букет на праздник — цветы свежие, собраны красиво, привезли вовремя.', en: 'I ordered a bouquet for a holiday — fresh flowers, beautifully arranged, delivered on time.' }, name: 'Марія', city: 'Мерефа', tag: { uk: 'Квіти', ru: 'Цветы', en: 'Flowers' }, rating: 5 },
  { quote: { uk: 'Лавандове поле гарне для фото й заходів. Забронювали час, усе підтвердили, без зайвої метушні.', ru: 'Лавандовое поле отличное для фото и мероприятий. Забронировали время, всё подтвердили, без лишней суеты.', en: 'The lavender field is great for photos and events. We booked a slot, everything was confirmed, no fuss.' }, name: 'Ірина', city: 'Харків', tag: { uk: 'Лаванда', ru: 'Лаванда', en: 'Lavender' }, rating: 5 },
  { quote: { uk: 'Брали профнастил і металочерепицю на дах. Порахували під розмір, доставили по області.', ru: 'Брали профнастил и металлочерепицу на крышу. Посчитали под размер, доставили по области.', en: 'We bought corrugated sheeting and metal tiles for the roof. Cut to size, delivered across the region.' }, name: 'Сергій', city: 'Коротич', tag: { uk: 'Метал', ru: 'Металл', en: 'Metal' }, rating: 5 },
  { quote: { uk: 'Замовляли металевий штахетник на паркан — колір підібрали, саморізи в тон. Монтувати було зручно.', ru: 'Заказывали металлический штакетник на забор — цвет подобрали, саморезы в тон. Монтировать было удобно.', en: 'We ordered a metal picket fence — matched the color, screws to tone. Easy to install.' }, name: 'Олександр', city: 'Валки', tag: { uk: 'Метал', ru: 'Металл', en: 'Metal' }, rating: 5 },
  { quote: { uk: 'Жимолість і живі олії — справжній смак з господарства. Гарбузова олія дуже сподобалась.', ru: 'Жимолость и живые масла — настоящий вкус из хозяйства. Тыквенное масло очень понравилось.', en: 'Honeyberries and cold-pressed oils — real farm taste. The pumpkin oil was excellent.' }, name: 'Тетяна', city: 'Дергачі', tag: { uk: 'Натуральні продукти', ru: 'Натуральные продукты', en: 'Natural products' }, rating: 5 },
  { quote: { uk: 'Замовлення зібрали швидко, тримали в курсі, відправили того ж дня. Все чесно.', ru: 'Заказ собрали быстро, держали в курсе, отправили в тот же день. Всё честно.', en: 'The order was packed quickly, kept me updated, shipped the same day. All honest.' }, name: 'Володимир', city: 'Чугуїв', tag: { uk: 'Доставка', ru: 'Доставка', en: 'Delivery' }, rating: 5 },
]

function StarRating({ rating, ariaLabel }: { rating: number; ariaLabel: string }) {
  return (
    <div className="flex gap-0.5" aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} className={`w-4 h-4 ${star <= rating ? 'text-honey-500' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

function ReviewerInitial({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-honey-100 border-2 border-honey-200 flex items-center justify-center flex-shrink-0">
      <span className="font-serif font-bold text-honey-700 text-sm">{name.trim().charAt(0).toUpperCase()}</span>
    </div>
  )
}

function ReviewCard({ review, ratingAria }: { review: { quote: string; name: string; city: string; tag: string; rating: number }; ratingAria: string }) {
  return (
    <blockquote className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300 flex flex-col min-h-[260px]">
      <div className="flex items-center justify-between gap-2 mb-4">
        <StarRating rating={review.rating} ariaLabel={ratingAria} />
        {review.tag && (
          <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-honey-700 bg-honey-50 border border-honey-100 rounded-full px-2.5 py-1">
            {review.tag}
          </span>
        )}
      </div>
      <p className="text-gray-700 mb-6 leading-relaxed flex-1 text-sm">&ldquo;{review.quote}&rdquo;</p>
      <footer className="flex items-center gap-3">
        <ReviewerInitial name={review.name} />
        <cite className="not-italic">
          <span className="font-semibold text-bark text-sm block">{review.name}</span>
          {review.city && <span className="text-gray-400 text-xs">{review.city}</span>}
        </cite>
      </footer>
    </blockquote>
  )
}

export function Reviews({ reviews, locale = DEFAULT_LOCALE }: ReviewsProps) {
  const t = homeDict(locale)
  const items = useMemo(() => {
    return (reviews && reviews.length >= 3)
      ? reviews.slice(0, 10).map((r) => ({ quote: r.quote, name: r.reviewer_name, city: r.city ?? '', tag: '', rating: r.rating }))
      : CURATED_REVIEWS.map((r) => ({ quote: tr(r.quote, locale), name: r.name, city: r.city, tag: tr(r.tag, locale), rating: r.rating }))
  }, [reviews, locale])

  const [index, setIndex] = useState(0)

  const visible = [0, 1, 2].map((offset) => items[(index + offset) % items.length])

  function prev() {
    setIndex((i) => (i - 1 + items.length) % items.length)
  }

  function next() {
    setIndex((i) => (i + 1) % items.length)
  }

  return (
    <section className="py-20 md:py-28 bg-cream" aria-labelledby="reviews-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-4 block">{t.reviewsEyebrow}</span>
            <h2 id="reviews-heading" className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
              {t.reviewsTitle}
            </h2>
            <p className="text-gray-500 text-base max-w-xl">
              {t.reviewsIntro}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-gray-400">{index + 1} / {items.length}</span>
            <button
              type="button"
              onClick={prev}
              aria-label={t.reviewsPrevAria}
              className="w-11 h-11 rounded-full border border-gray-200 bg-white flex items-center justify-center text-bark/60 hover:text-bark hover:border-bark/30 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={next}
              aria-label={t.reviewsNextAria}
              className="w-11 h-11 rounded-full border border-gray-200 bg-white flex items-center justify-center text-bark/60 hover:text-bark hover:border-bark/30 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {visible.map((review, i) => (
            <ReviewCard key={`${index}-${i}-${review.name}`} review={review} ratingAria={t.reviewsRatingAria.replace('{n}', String(review.rating))} />
          ))}
        </div>

        <div className="flex justify-center gap-2 mt-8">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t.reviewsDotAria.replace('{n}', String(i + 1))}
              className={`h-2 rounded-full transition-all ${i === index ? 'w-8 bg-honey-600' : 'w-2 bg-gray-300 hover:bg-gray-400'}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
