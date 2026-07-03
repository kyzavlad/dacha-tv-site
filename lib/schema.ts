// Shared Schema.org JSON-LD builders. Pure functions — render the result with
// <StructuredData data={...} />. Kept dependency-free and render-time only.

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dachatv.com'

function abs(path: string): string {
  if (!path) return BASE_URL
  if (path.startsWith('http')) return path
  return `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

export interface Crumb {
  label: string
  href?: string
}

// BreadcrumbList for rich-result breadcrumbs. Only items with an href get a URL.
export function breadcrumbSchema(crumbs: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: abs(c.href) } : {}),
    })),
  }
}

export interface FaqItem {
  question: string
  answer: string
}

// FAQPage schema — pair it with a visible FAQ block on the page (Google requires
// the Q&A to be visible to the user).
export function faqSchema(items: FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }
}
