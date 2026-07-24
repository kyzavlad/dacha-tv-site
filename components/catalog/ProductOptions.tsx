import type { ReactNode } from 'react'
import { getRequestLocale } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

interface ProductOptionsProps {
  options?: Record<string, unknown> | null
}

function renderValue(value: unknown): ReactNode {
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <span
            key={i}
            className="inline-block text-xs bg-honey-50 text-bark/80 border border-honey-100 rounded-full px-2.5 py-1"
          >
            {String(v)}
          </span>
        ))}
      </div>
    )
  }
  if (value && typeof value === 'object') {
    return <span className="text-bark/80">{JSON.stringify(value)}</span>
  }
  return <span className="text-bark/80">{String(value)}</span>
}

// Clean attributes/options block for a product detail page. Renders the
// manual-catalog `options` JSONB (colors, thicknesses, coatings, sizes,
// packaging, delivery, seasonality) as a readable definition list. Renders
// nothing when there are no options.
export async function ProductOptions({ options }: ProductOptionsProps) {
  const locale = await getRequestLocale()
  if (!options || typeof options !== 'object') return null
  const entries = Object.entries(options).filter(
    ([, v]) => v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ''),
  )
  if (entries.length === 0) return null

  return (
    <div className="border-t border-gray-100 pt-6 mb-6">
      <h2 className="font-semibold text-bark mb-3 text-sm uppercase tracking-wide">{tr({ uk: 'Характеристики', ru: 'Характеристики' }, locale)}</h2>
      <dl className="divide-y divide-gray-100">
        {entries.map(([key, value]) => (
          <div key={key} className="py-2 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3">
            <dt className="text-sm font-medium text-bark/60">{key}</dt>
            <dd className="text-sm sm:col-span-2">{renderValue(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
