import Link from 'next/link'
import { CTAButton } from '@/components/shared/CTAButton'
import { PhoneLink } from '@/components/shared/PhoneLink'
import type { SiteSettings } from '@/types'

interface HeroProps {
  tagline?: string
  subtext?: string
  siteSettings: SiteSettings | null
}

export function Hero({ tagline, subtext, siteSettings }: HeroProps) {
  const displayTagline = tagline || 'Дача TV — натуральні продукти, товари для господарства та корисні рішення для дому'
  const displaySubtext =
    subtext ||
    'Мед і продукти пасіки, квіти та лаванда, сезонні натуральні продукти, металопрофіль і товари для господарства — напряму від виробників та партнерів.'

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden" aria-label="Головний банер">
      {/* Background */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-bark via-honey-950 to-bark"
        aria-hidden="true"
      />
      {/* Subtle warm glow */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 20% 60%, #d97706 0%, transparent 55%), radial-gradient(ellipse at 75% 30%, #92400e 0%, transparent 45%)',
        }}
        aria-hidden="true"
      />
      {/* Texture overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36 w-full">
        <div className="max-w-3xl">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2.5 bg-white/10 border border-white/15 rounded-full px-4 py-2 mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-honey-400 animate-pulse flex-shrink-0" aria-hidden="true" />
            <span className="text-honey-200 text-sm font-medium tracking-wide">
              Напряму від виробників та партнерів · без зайвих посередників
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-[1.1] mb-7 tracking-tight">
            {displayTagline}
          </h1>

          {/* Subtext */}
          <p className="text-lg md:text-xl text-white/65 mb-10 leading-relaxed max-w-2xl">
            {displaySubtext}
          </p>

          {/* CTA row */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <CTAButton href="/catalog" size="lg" variant="primary">
              Перейти в магазин
            </CTAButton>
            <Link
              href="/products"
              className="inline-flex items-center justify-center gap-2 px-9 py-4 text-lg text-white/70 hover:text-white border border-white/20 hover:border-white/40 rounded-full transition-all min-h-[56px]"
            >
              Продукти пасіки
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Phone — shown when available */}
          {siteSettings?.phone && (
            <div className="mt-10 pt-10 border-t border-white/10 flex items-center gap-3">
              <span className="text-white/40 text-sm">або зателефонуйте:</span>
              <PhoneLink
                phone={siteSettings.phone}
                showIcon
                className="text-xl font-bold text-honey-300 hover:text-honey-200 transition-colors"
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-cream/20 to-transparent pointer-events-none"
        aria-hidden="true"
      />
    </section>
  )
}
