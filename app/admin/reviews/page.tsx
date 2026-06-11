export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { getAdminClient } from '@/lib/supabase/admin'
import { createReview, deleteReview, toggleReviewVisibility } from './actions'

export const metadata: Metadata = {
  title: 'Адмін — Відгуки',
  robots: 'noindex, nofollow',
}

export default async function AdminReviewsPage() {
  const client = getAdminClient()
  const { data: reviews } = await client
    .from('reviews')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="px-4 sm:px-6 py-8">
      <h1 className="font-serif text-2xl font-bold text-bark mb-6">Відгуки</h1>

      {/* Reviews list */}
      {reviews && reviews.length > 0 ? (
        <div className="space-y-3 mb-8">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-xl border border-honey-100 p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-bark text-sm">{review.reviewer_name}</span>
                  <span className="text-bark/50 text-xs">— {review.city}</span>
                  <span className="text-honey-500 text-xs">{'★'.repeat(review.rating)}</span>
                </div>
                <p className="text-bark/70 text-sm truncate">{review.quote}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <form action={toggleReviewVisibility.bind(null, review.id, review.is_visible)}>
                  <button type="submit"
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      review.is_visible
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {review.is_visible ? 'Видно' : 'Приховано'}
                  </button>
                </form>
                <form action={deleteReview.bind(null, review.id)}>
                  <button type="submit"
                    className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors">
                    Видалити
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-bark/50 text-sm mb-8">Немає відгуків</div>
      )}

      {/* Add form */}
      <div className="bg-white rounded-2xl border border-honey-100 p-6 max-w-2xl">
        <h2 className="font-serif text-lg font-bold text-bark mb-4">Додати відгук</h2>
        <form action={createReview} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-bark mb-1">Ім&apos;я</label>
              <input name="reviewer_name" type="text" required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-honey-400" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-bark mb-1">Місто</label>
              <input name="city" type="text" required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-honey-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-bark mb-1">Відгук</label>
            <textarea name="quote" rows={3} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-honey-400" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-bark mb-1">Рейтинг (1–5)</label>
              <select name="rating" defaultValue="5"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-honey-400">
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>{r} зірок</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="is_visible" defaultChecked className="w-4 h-4 accent-honey-600" />
                <span className="text-sm font-medium text-bark">Показати на сайті</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-bark mb-1">
              Фото відгуку <span className="font-normal text-gray-400">— необов&apos;язково (URL)</span>
            </label>
            <input name="photo_url" type="text"
              placeholder="https://..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-honey-400" />
          </div>

          <button type="submit"
            className="bg-bark text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-bark-light transition-colors text-sm min-h-[44px]">
            Додати відгук
          </button>
        </form>
      </div>
    </div>
  )
}
