import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { SellerInfo } from '@/components/shared/SellerInfo'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { buildAlternates, buildSocialMetadata } from '@/lib/seo'
import {
  RETURNS_POLICY_UPDATED_AT,
  returnsPolicyCopy,
} from '@/lib/returns-policy'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const t = returnsPolicyCopy(locale)
  const { canonical, languages } = buildAlternates(locale, '/returns')

  return buildSocialMetadata({
    bareTitle: t.title,
    description: t.intro,
    canonical,
    languages,
    imageAlt: t.title,
  })
}

const SUMMARY_ICONS = [RotateCcw, CircleDollarSign, Clock3] as const

export default async function ReturnsPage() {
  const locale = await getRequestLocale()
  const t = returnsPolicyCopy(locale)

  return (
    <main className="min-h-screen bg-cream">
      <section className="relative isolate overflow-hidden border-b border-honey-100 bg-white">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-80"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(circle at 82% 12%, rgba(245, 190, 73, 0.18), transparent 34%), radial-gradient(circle at 12% 80%, rgba(55, 104, 73, 0.10), transparent 31%)',
          }}
        />

        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-honey-200 bg-honey-50 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-honey-800">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t.eyebrow}
            </div>
            <h1 className="font-serif text-4xl font-bold tracking-tight text-bark sm:text-5xl md:text-6xl">
              {t.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-bark/65 sm:text-lg">
              {t.intro}
            </p>
            <p className="mt-5 inline-flex items-center gap-2 text-sm text-bark/50">
              <BadgeCheck className="h-4 w-4 text-forest-700" aria-hidden="true" />
              {t.updatedLabel} {RETURNS_POLICY_UPDATED_AT}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {t.summary.map((item, index) => {
            const Icon = SUMMARY_ICONS[index] ?? PackageCheck
            return (
              <article
                key={item.title}
                className="rounded-3xl border border-honey-100 bg-white p-6 shadow-[0_16px_50px_rgba(74,55,34,0.06)]"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-honey-50 text-honey-800">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="font-serif text-2xl font-bold text-bark">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-bark/65">{item.body}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8 lg:pb-24">
        <div className="space-y-5">
          {t.sections.map((section) => (
            <article
              key={section.heading}
              className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8"
            >
              <h2 className="font-serif text-2xl font-bold text-bark sm:text-3xl">
                {section.heading}
              </h2>
              {section.body && (
                <p className="mt-4 text-[15px] leading-7 text-bark/72 sm:text-base">
                  {section.body}
                </p>
              )}
              {section.bullets && (
                <ul className="mt-5 space-y-3">
                  {section.bullets.map((item) => (
                    <li key={item} className="flex gap-3 text-[15px] leading-7 text-bark/72 sm:text-base">
                      <PackageCheck className="mt-1 h-5 w-5 shrink-0 text-forest-700" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <div className="overflow-hidden rounded-3xl border border-forest-200 bg-forest-900 p-6 text-white shadow-[0_20px_60px_rgba(24,63,42,0.18)]">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="font-serif text-2xl font-bold">{t.contactTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-white/75">{t.contactBody}</p>
            <Link
              href={localizedPath(locale, '/contact')}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-forest-900 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-forest-900"
            >
              {t.contactCta}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <SellerInfo />

          <div className="rounded-2xl border border-honey-100 bg-honey-50/70 p-5 text-xs leading-5 text-bark/60">
            <p>{t.legalNote}</p>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href="https://zakon.rada.gov.ua/laws/show/1023-12"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-bark underline decoration-bark/25 underline-offset-4 hover:decoration-bark"
              >
                Закон України «Про захист прав споживачів»
              </a>
              <a
                href="https://zakon.rada.gov.ua/laws/show/172-94-%D0%BF"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-bark underline decoration-bark/25 underline-offset-4 hover:decoration-bark"
              >
                Постанова КМУ № 172
              </a>
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}
