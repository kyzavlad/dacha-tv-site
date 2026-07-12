export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { CTAButton } from '@/components/shared/CTAButton'
import { ProductsCatalog } from '@/components/products/ProductsCatalog'
import { getAllHoneyProducts, getAllApiaryProducts } from '@/lib/supabase/queries'
import { getNaturalProducts } from '@/lib/supabase/catalog'

export const metadata: Metadata = {
  title: 'Продукти',
  description:
    'Натуральні продукти, продукти пасіки та сезонні товари господарства з Харківщини: мед, пилок, прополіс, жимолость, живі олії, Іван-чай, часник, саджанці та інше.',
  alternates: { canonical: '/products' },
  openGraph: {
    title: 'Продукти',
    description: 'Натуральні продукти, продукти пасіки та сезонні товари господарства з Харківщини.',
    siteName: 'Дача TV',
    type: 'website',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Продукти',
    description: 'Натуральні продукти, продукти пасіки та сезонні товари господарства з Харківщини.',
  },
}

// /products is the CURRENT offer, not an archive. Inclusion is therefore by
// explicit allowlist — NOT merely by DB status, because many legacy apiary and
// natural rows are still marked available/published. Nothing is deleted: hidden
// rows stay in the DB and on their own detail pages, just off this storefront.

// Consumer bee products that are part of the current offer. Everything else in
// apiary_products (swarm lure, wax foundation, dried herbs, old syrups, the
// legacy chocolate duplicate, etc.) is hidden here. Edit to curate bee products.
const CURATED_APIARY_SLUGS = new Set(['flower-pollen', 'propolis', 'nuts-in-honey'])

// Manual-catalog categories shown in full — their products ARE the current offer.
const CURRENT_MANUAL_CATEGORIES = new Set(['zhyvi-olii-holodnogo-vidzhymu', 'podarunkovi-nabory'])
// Individually allowlisted products from the mixed "naturalni-produkty" category,
// so чай / часник / жимолость / саджанці stay off the storefront until curated in.
const CURATED_NATURAL_SLUGS = new Set(['medovyi-shokolad'])

const ORDERABLE_STATUS = new Set(['available', 'preorder'])

export default async function ProductsPage() {
  const [honeyAll, apiaryAll, naturalAll] = await Promise.all([
    getAllHoneyProducts().catch(() => []),
    getAllApiaryProducts().catch(() => []),
    getNaturalProducts().catch(() => []),
  ])

  // Honey: currently orderable rows only.
  const honey = honeyAll.filter((p) => ORDERABLE_STATUS.has(p.status))

  // Natural manual products: whole current categories (oils, gift sets) plus the
  // explicitly allowlisted single products (chocolate) from the mixed natural
  // category. This is what makes gift sets / oil / chocolate appear once seeded
  // while keeping garlic / herbs / berries / saplings off the storefront.
  const natural = naturalAll.filter(
    (p) => CURRENT_MANUAL_CATEGORIES.has(p.category_slug ?? '') || CURATED_NATURAL_SLUGS.has(p.slug),
  )

  // Apiary: allowlisted current bee products only, and never a slug already
  // covered by a manual product (prefer the canonical manual one).
  const naturalSlugs = new Set(natural.map((p) => p.slug))
  const apiary = apiaryAll.filter((p) => CURATED_APIARY_SLUGS.has(p.slug) && !naturalSlugs.has(p.slug))

  return (
    <div className="bg-cream min-h-screen">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-3 block">Продукти</span>
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-bark mb-4">
            Продукти господарства
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl">
            Натуральні продукти, продукти пасіки та сезонні товари господарства з Харківщини.
          </p>
        </div>
      </div>

      {/* Unified catalog: honey + bee products + natural farm products, one grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <ProductsCatalog honey={honey} apiary={apiary} natural={natural} />
      </div>

      {/* CTA */}
      <div className="bg-bark py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-cream mb-4">
            Потрібна допомога у виборі?
          </h2>
          <p className="text-cream/70 mb-6">
            Зателефонуйте або залиште заявку: ми відповімо на всі питання
          </p>
          <CTAButton href="/contact" variant="white">
            Зв&apos;язатись з нами
          </CTAButton>
        </div>
      </div>
    </div>
  )
}
