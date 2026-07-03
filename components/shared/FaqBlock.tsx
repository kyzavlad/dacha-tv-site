import { StructuredData } from '@/components/shared/StructuredData'
import { faqSchema, type FaqItem } from '@/lib/schema'

// Visible FAQ block + matching FAQPage JSON-LD. Google requires the Q&A to be
// visible, so this renders both together. Use on key landing/category pages to
// build topical authority.
export function FaqBlock({ items, heading = 'Часті запитання' }: { items: FaqItem[]; heading?: string }) {
  if (items.length === 0) return null
  return (
    <section className="mt-14 border-t border-gray-100 pt-10" aria-label={heading}>
      <StructuredData data={faqSchema(items)} />
      <h2 className="font-serif text-2xl font-bold text-bark mb-5">{heading}</h2>
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
