export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumb } from '@/components/catalog/Breadcrumb'
import { FaqBlock } from '@/components/shared/FaqBlock'
import { StructuredData } from '@/components/shared/StructuredData'
import { breadcrumbSchema } from '@/lib/schema'
import { buildAlternates, buildSocialMetadata } from '@/lib/seo'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import {
  getScooterGuide,
  SCOOTER_GUIDE_SLUGS,
  type GuideLocale,
} from '@/lib/moto/scooter-guides'

interface Props {
  params: Promise<{ guide: string }>
}

const UI = {
  uk: {
    home: 'Головна',
    guides: 'Поради',
    selectionGuide: 'Чеклист підбору',
    related: 'Корисні посилання',
    compatibility: 'Важливо про сумісність',
    compatibilityText: 'Цей матеріал допомагає звузити пошук, але не є гарантією сумісності конкретної запчастини. Перед замовленням звірте дані картки товару та свою модифікацію.',
    faq: 'Часті запитання',
  },
  ru: {
    home: 'Главная',
    guides: 'Советы',
    selectionGuide: 'Чеклист подбора',
    related: 'Полезные ссылки',
    compatibility: 'Важно о совместимости',
    compatibilityText: 'Этот материал помогает сузить поиск, но не является гарантией совместимости конкретной запчасти. Перед заказом сверьте данные карточки товара и свою модификацию.',
    faq: 'Частые вопросы',
  },
} satisfies Record<GuideLocale, Record<string, string>>

export function generateStaticParams() {
  return SCOOTER_GUIDE_SLUGS.map((guide) => ({ guide }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { guide: slug } = await params
  const guide = getScooterGuide(slug)
  if (!guide) return { title: 'Не знайдено' }

  const locale = await getRequestLocale()
  if (locale === 'en') return { title: guide.copy.uk.metaTitle, robots: { index: false, follow: false } }
  const l: GuideLocale = locale === 'ru' ? 'ru' : 'uk'
  const copy = guide.copy[l]
  const { canonical, languages } = buildAlternates(locale, `/moto/guides/${guide.slug}`, ['uk', 'ru'])

  return buildSocialMetadata({
    bareTitle: copy.metaTitle,
    description: copy.metaDescription,
    canonical,
    languages,
    imageAlt: copy.title,
  })
}

export default async function ScooterGuidePage({ params }: Props) {
  const { guide: slug } = await params
  const guide = getScooterGuide(slug)
  if (!guide) notFound()

  const locale = await getRequestLocale()
  if (locale === 'en') notFound()
  const l: GuideLocale = locale === 'ru' ? 'ru' : 'uk'
  const t = UI[l]
  const copy = guide.copy[l]

  const crumbs = [
    { label: t.home, href: localizedPath(locale, '/') },
    { label: t.guides, href: localizedPath(locale, '/moto/guides') },
    { label: copy.title },
  ]

  return (
    <main className="min-h-screen bg-cream">
      <StructuredData data={breadcrumbSchema(crumbs)} />
      <article className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <Breadcrumb crumbs={crumbs} />

        <header className="mt-7 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-honey-700">{t.selectionGuide}</p>
          <h1 className="mt-3 font-serif text-3xl md:text-5xl font-bold text-bark leading-tight">{copy.title}</h1>
          <p className="mt-5 text-base md:text-lg leading-relaxed text-bark/70">{copy.intro}</p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-10">
            {copy.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-serif text-2xl font-bold text-bark">{section.heading}</h2>
                <div className="mt-3 space-y-3 text-base leading-relaxed text-bark/70">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-4 space-y-2 text-sm md:text-base text-bark/70">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2">
                        <span className="text-honey-700 font-bold" aria-hidden="true">✓</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <aside className="rounded-2xl border border-honey-200 bg-honey-50/70 p-5 md:p-6">
              <h2 className="font-serif text-xl font-bold text-bark">{t.compatibility}</h2>
              <p className="mt-2 text-sm md:text-base leading-relaxed text-bark/70">{t.compatibilityText}</p>
            </aside>

            <Link
              href={localizedPath(locale, guide.primaryHref)}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-honey-600 px-6 py-3 font-semibold text-white hover:bg-honey-700 transition-colors"
            >
              {copy.ctaLabel}
            </Link>

            <FaqBlock items={copy.faq} heading={t.faq} />
          </div>

          <aside className="lg:sticky lg:top-24 h-fit rounded-2xl border border-honey-100 bg-white p-5 shadow-sm">
            <h2 className="font-serif text-lg font-bold text-bark">{t.related}</h2>
            <div className="mt-4 space-y-2">
              {guide.relatedHrefs.map((item) => (
                <Link
                  key={item.href}
                  href={localizedPath(locale, item.href)}
                  className="block rounded-lg border border-honey-100 px-3 py-2.5 text-sm font-semibold text-honey-700 hover:bg-honey-50 transition-colors"
                >
                  {item.label[l]}
                </Link>
              ))}
              <Link
                href={localizedPath(locale, '/moto/guides')}
                className="block px-3 py-2 text-sm text-bark/60 hover:text-bark"
              >
                ← {t.guides}
              </Link>
            </div>
          </aside>
        </div>
      </article>
    </main>
  )
}
