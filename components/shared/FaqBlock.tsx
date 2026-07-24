import { StructuredData } from '@/components/shared/StructuredData'
import { faqSchema, type FaqItem } from '@/lib/schema'
import { getRequestLocale } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

// Visible FAQ block + matching FAQPage JSON-LD. Google requires the Q&A to be
// visible, so this renders both together. Use on key landing/category pages to
// build topical authority.
export async function FaqBlock({ items, heading }: { items: FaqItem[]; heading?: string }) {
  if (items.length === 0) return null
  const locale = await getRequestLocale()
  const resolvedHeading = heading ?? tr({ uk: 'Часті запитання', ru: 'Частые вопросы' }, locale)
  return (
    <section className="mt-14 border-t border-gray-100 pt-10" aria-label={resolvedHeading}>
      <StructuredData data={faqSchema(items)} />
      <h2 className="font-serif text-2xl font-bold text-bark mb-5">{resolvedHeading}</h2>
      <div className="space-y-3 max-w-3xl">
        {items.map((f, i) => (
          <details key={i} className="group rounded-xl border border-honey-100 bg-white p-4">
            <summary className="cursor-pointer list-none font-semibold text-bark flex items-center justify-between gap-3">
              <span>{f.question}</span>
              <span className="text-honey-600 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <p className="text-bark/70 text-sm leading-relaxed mt-3">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
