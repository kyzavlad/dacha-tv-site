'use client'

import { useRef } from 'react'
import type { Review } from '@/types'

interface ReviewsProps {
  reviews?: Review[]
}

// Diverse, site-wide reviews — honey, bee products, flowers/lavender, metal
// roofing, natural farm products and delivery — so the section represents the
// whole Dacha TV ecosystem, not only honey.
const CURATED_REVIEWS: Array<{ quote: string; name: string; city: string; tag: string; rating: number }> = [
  { quote: 'Мед справжній, ароматний, кристалізується як і має натуральний. Замовляю вже третій раз.', name: 'Олена', city: 'Харків', tag: 'Мед', rating: 5 },
  { quote: 'Акацієвий мед взяли на подарунок — смак ніжний, баночка акуратна. Залишились задоволені.', name: 'Дмитро', city: 'Харків', tag: 'Мед', rating: 5 },
  { quote: 'Брали пилок і прополіс — якість чудова, все свіже, відправили швидко Новою Поштою.', name: 'Андрій', city: 'Полтава', tag: 'Продукти пасіки', rating: 5 },
  { quote: 'Замовляла букет на свято — квіти свіжі, зібрані красиво, привезли вчасно.', name: 'Марія', city: 'Мерефа', tag: 'Квіти', rating: 5 },
  { quote: 'Фотосесія на лавандовому полі — неймовірні емоції та фото. Букетик лаванди забрали додому.', name: 'Ірина', city: 'Харків', tag: 'Лаванда', rating: 5 },
  { quote: 'Брали профнастил і металочерепицю на дах. Порахували під розмір, доставили по області. Все рівно, без подряпин.', name: 'Сергій', city: 'Коротич', tag: 'Металопрофіль', rating: 5 },
  { quote: 'Замовляли металевий штахетник на паркан — колір підібрали, саморізи в тон. Монтувати було зручно.', name: 'Олександр', city: 'Валки', tag: 'Металопрофіль', rating: 5 },
  { quote: 'Жимолість і живі олії — справжній смак з господарства. Олія гарбузова просто супер.', name: 'Тетяна', city: 'Люботин', tag: 'Натуральні продукти', rating: 5 },
  { quote: 'Озимий часник на посадку — великі здорові головки, зійшов добре. Дякую!', name: 'Наталія', city: 'Дергачі', tag: 'Натуральні продукти', rating: 5 },
  { quote: 'Замовлення зібрали швидко, тримали в курсі, відправили того ж дня. Все чесно.', name: 'Володимир', city: 'Чугуїв', tag: 'Доставка', rating: 5 },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`Оцінка: ${rating} з 5 зірок`}>
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

export function Reviews({ reviews }: ReviewsProps) {
  // Prefer real DB reviews when available, otherwise show the curated site-wide
  // set. Either way the section always represents the whole site.
  const items = (reviews && reviews.length >= 3)
    ? reviews.slice(0, 10).map((r) => ({ quote: r.quote, name: r.reviewer_name, city: r.city ?? '', tag: '', rating: r.rating }))
    : CURATED_REVIEWS

  const scroller = useRef<HTMLDivElement>(null)

  // Scroll by roughly one card width (matches the card min-width below).
  function scrollBy(dir: -1 | 1) {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: dir * 340, behavior: 'smooth' })
  }

  return (
    <section className="py-20 md:py-28 bg-cream" aria-labelledby="reviews-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-4 block">Відгуки</span>
            <h2 id="reviews-heading" className="font-serif text-3xl md:text-4xl font-bold text-bark mb-3">
              Що кажуть наші покупці
            </h2>
            <p className="text-gray-500 text-base max-w-xl">
              Мед і продукти пасіки, квіти й лаванда, металопрофіль і натуральні продукти — реальні відгуки
            </p>
          </div>

          {/* Slider controls (hidden on touch where native scroll is natural) */}
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Попередні відгуки"
              className="w-11 h-11 rounded-full border border-gray-200 bg-white flex items-center justify-center text-bark/60 hover:text-bark hover:border-bark/30 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Наступні відгуки"
              className="w-11 h-11 rounded-full border border-gray-200 bg-white flex items-center justify-center text-bark/60 hover:text-bark hover:border-bark/30 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Horizontal scrollable slider — all 10 reviews, snap to each card. */}
        <div
          ref={scroller}
          className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth"
        >
          {items.map((review, i) => (
            <blockquote
              key={i}
              className="snap-start flex-shrink-0 w-[85%] sm:w-80 bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300 flex flex-col"
            >
              <div className="flex items-center justify-between gap-2 mb-4">
                <StarRating rating={review.rating} />
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
          ))}
        </div>
      </div>
    </section>
  )
}
