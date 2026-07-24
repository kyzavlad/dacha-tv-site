import { HoneyCard } from '@/components/honey/HoneyCard'
import { CTAButton } from '@/components/shared/CTAButton'
import type { HoneyProduct } from '@/types'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

interface ProductPreviewProps {
  products: HoneyProduct[]
}

export async function ProductPreview({ products }: ProductPreviewProps) {
  if (products.length === 0) return null

  const locale = await getRequestLocale()

  return (
    <section className="py-20 md:py-28 bg-cream" aria-labelledby="products-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
          <div>
            <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">
              {tr({ uk: 'Мед і продукти пасіки', ru: 'Мёд и продукты пасеки' }, locale)}
            </span>
            <h2 id="products-heading" className="font-serif text-3xl md:text-4xl font-bold text-bark">
              {tr({ uk: 'Наш мед', ru: 'Наш мёд' }, locale)}
            </h2>
          </div>
          <p className="text-gray-500 max-w-sm text-sm leading-relaxed">
            {tr({ uk: 'Сезонний мед без домішок. Кожен сорт — у свій час, з конкретних угідь.', ru: 'Сезонный мёд без примесей. Каждый сорт — в своё время, с конкретных угодий.' }, locale)}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {products.map((product) => (
            <HoneyCard key={product.id} product={product} />
          ))}
        </div>

        <div className="text-center">
          <CTAButton href={localizedPath(locale, '/honey')} variant="outline" size="md">
            {tr({ uk: 'Переглянути всі сорти', ru: 'Посмотреть все сорта' }, locale)}
          </CTAButton>
        </div>
      </div>
    </section>
  )
}
