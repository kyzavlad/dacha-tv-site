export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { getAdminClient } from '@/lib/supabase/admin'
import type { FaqItem } from '@/types'
import { createFaqItem, deleteFaqItem } from './actions'
import { seedLaunchDataAction } from '@/app/admin/actions/seed'

export const metadata: Metadata = {
  title: 'Адмін — FAQ',
  robots: 'noindex, nofollow',
}

const CATEGORIES = [
  { value: 'products', label: 'Про продукти' },
  { value: 'ordering', label: 'Замовлення' },
  { value: 'delivery', label: 'Доставка' },
  { value: 'beekeeping', label: 'Бджільництво' },
]

const CATEGORY_LABELS: Record<string, string> = {
  products: 'Про продукти',
  ordering: 'Замовлення',
  delivery: 'Доставка',
  beekeeping: 'Бджільництво',
}

export default async function AdminFaqPage() {
  let items: FaqItem[] = []
  try {
    const client = getAdminClient()
    const { data } = await client.from('faq_items').select('*').order('display_order', { ascending: true })
    items = (data ?? []) as FaqItem[]
  } catch { /* env not set — show empty list */ }

  const grouped = ['products', 'ordering', 'delivery', 'beekeeping'].reduce<Record<string, typeof items>>(
    (acc, cat) => {
      acc[cat] = items.filter((item) => item.category === cat)
      return acc
    },
    { products: [], ordering: [], delivery: [], beekeeping: [] }
  )

  return (
    <div className="px-4 sm:px-6 py-8">
      <h1 className="font-serif text-2xl font-bold text-bark mb-6">FAQ</h1>

      {/* Items grouped by category */}
      {items.length > 0 && (
        <div className="space-y-6 mb-8">
          {Object.entries(grouped).map(([cat, catItems]) => {
            if (catItems.length === 0) return null
            return (
              <div key={cat}>
                <h2 className="font-semibold text-bark mb-3">{CATEGORY_LABELS[cat]}</h2>
                <div className="space-y-2">
                  {catItems.map((item) => (
                    <div key={item.id} className="bg-white rounded-xl border border-honey-100 p-4 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-bark text-sm mb-1">{item.question}</p>
                        <p className="text-bark/60 text-xs truncate">{item.answer}</p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <span className="text-xs text-bark/40">#{item.display_order}</span>
                        <form action={deleteFaqItem.bind(null, item.id)}>
                          <button type="submit"
                            className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors">
                            Видалити
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-8 text-bark/50 text-sm mb-8">
          <p className="mb-4">Немає питань</p>
          <form action={seedLaunchDataAction}>
            <button type="submit"
              className="bg-honey-700 hover:bg-honey-800 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]">
              Заповнити стартовими даними
            </button>
          </form>
        </div>
      )}

      {/* Add form */}
      <div className="bg-white rounded-2xl border border-honey-100 p-6 max-w-2xl">
        <h2 className="font-serif text-lg font-bold text-bark mb-4">Додати питання</h2>
        <form action={createFaqItem} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-bark mb-1">Питання</label>
            <input name="question" type="text" required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-honey-400" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-bark mb-1">Відповідь</label>
            <textarea name="answer" rows={4} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-honey-400" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-bark mb-1">Категорія</label>
              <select name="category" required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-honey-400">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-bark mb-1">Порядок</label>
              <input name="display_order" type="number" defaultValue={10}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-honey-400" />
            </div>
          </div>

          <button type="submit"
            className="bg-bark text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-bark-light transition-colors text-sm min-h-[44px]">
            Додати
          </button>
        </form>
      </div>
    </div>
  )
}
