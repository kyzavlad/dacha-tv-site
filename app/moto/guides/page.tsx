export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumb } from '@/components/catalog/Breadcrumb'
import { StructuredData } from '@/components/shared/StructuredData'
import { breadcrumbSchema } from '@/lib/schema'
import { buildAlternates, buildSocialMetadata } from '@/lib/seo'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { SCOOTER_GUIDE_SLUGS, SCOOTER_GUIDES, type GuideLocale } from '@/lib/moto/scooter-guides'

const COPY = {
  uk: {
    title: 'Поради з підбору запчастин для скутера',
    description: 'Практичні чеклисти для Honda Dio, Yamaha Jog, Suzuki Lets, ременів варіатора та карбюраторів — щоб швидше звірити модель і перейти до релевантного каталогу.',
    home: 'Головна',
    guides: 'Поради',
    eyebrow: 'Підбір без випадкових замовлень',
    intro: 'Ці матеріали не замінюють перевірку конкретної деталі. Їхня задача — допомогти зібрати правильні дані про скутер, звузити каталог і перейти до товарів, які варто перевірити першими.',
    read: 'Відкрити чеклист',
    noteTitle: 'Швидкий принцип',
    note: 'Модель → модифікація/рама → маркування старої деталі → картка товару → підтвердження сумісності. Не замовляйте лише за зовнішньою схожістю.',
  },
  ru: {
    title: 'Советы по подбору запчастей для скутера',
    description: 'Практические чеклисты для Honda Dio, Yamaha Jog, Suzuki Lets, ремней вариатора и карбюраторов — чтобы быстрее сверить модель и перейти к релевантному каталогу.',
    home: 'Главная',
    guides: 'Советы',
    eyebrow: 'Подбор без случайных заказов',
    intro: 'Эти материалы не заменяют проверку конкретной детали. Их задача — помочь собрать правильные данные о скутере, сузить каталог и перейти к товарам, которые стоит проверить первыми.',
    read: 'Открыть чеклист',
    noteTitle: 'Быстрый принцип',
    note: 'Модель → модификация/рама → маркировка старой детали → карточка товара → подтверждение совместимости. Не заказывайте только по внешнему сходству.',
  },
} satisfies Record<GuideLocale, Record<string, string>>

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  if (locale === 'en') return { title: COPY.uk.title, robots: { index: false, follow: false } }
  const l: GuideLocale = locale === 'ru' ? 'ru' : 'uk'
  const { canonical, languages } = buildAlternates(locale, '/moto/guides', ['uk', 'ru'])
  return buildSocialMetadata({
    bareTitle: COPY[l].title,
    description: COPY[l].description,
    canonical,
    languages,
  })
}

export default async function ScooterGuidesPage() {
  const locale = await getRequestLocale()
  if (locale === 'en') notFound()
  const l: GuideLocale = locale === 'ru' ? 'ru' : 'uk'
  const t = COPY[l]
  const crumbs = [
    { label: t.home, href: localizedPath(locale, '/') },
    { label: t.guides },
  ]

  return (
    <main className="min-h-screen bg-cream">
      <StructuredData data={breadcrumbSchema(crumbs)} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <Breadcrumb crumbs={crumbs} />

        <section className="mt-7 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-honey-700">{t.eyebrow}</p>
          <h1 className="mt-3 font-serif text-3xl md:text-5xl font-bold text-bark leading-tight">{t.title}</h1>
          <p className="mt-5 text-base md:text-lg leading-relaxed text-bark/70">{t.intro}</p>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2" aria-label={t.guides}>
          {SCOOTER_GUIDE_SLUGS.map((slug) => {
            const guide = SCOOTER_GUIDES[slug]
            const copy = guide.copy[l]
            return (
              <article key={slug} className="rounded-2xl border border-honey-100 bg-white p-6 shadow-sm">
                {guide.modelLabel && (
                  <p className="text-xs font-bold uppercase tracking-wide text-honey-700 mb-2">{guide.modelLabel}</p>
                )}
                <h2 className="font-serif text-xl md:text-2xl font-bold text-bark leading-snug">{copy.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-bark/65">{copy.intro}</p>
                <Link
                  href={localizedPath(locale, `/moto/guides/${guide.slug}`)}
                  className="mt-5 inline-flex items-center gap-2 font-semibold text-honey-700 hover:text-honey-800"
                >
                  {t.read}<span aria-hidden="true">→</span>
                </Link>
              </article>
            )
          })}
        </section>

        <aside className="mt-10 rounded-2xl border border-honey-200 bg-honey-50/70 p-5 md:p-6 max-w-4xl">
          <h2 className="font-serif text-xl font-bold text-bark">{t.noteTitle}</h2>
          <p className="mt-2 text-sm md:text-base leading-relaxed text-bark/70">{t.note}</p>
        </aside>
      </div>
    </main>
  )
}
