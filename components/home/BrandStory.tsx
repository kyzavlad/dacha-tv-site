import { existsSync } from 'fs'
import { join } from 'path'
import { CTAButton } from '@/components/shared/CTAButton'
import { SafeImage } from '@/components/shared/SafeImage'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { homeDict } from '@/lib/i18n/sections/home'

const BRAND_STORY_IMAGE = '/images/dacha-tv/brand-story.jpg'

export async function BrandStory() {
  const locale = await getRequestLocale()
  const t = homeDict(locale)
  const hasImage = existsSync(join(process.cwd(), 'public', BRAND_STORY_IMAGE))

  const TRUST_POINTS = [
    { label: t.storyTrust1Label, description: t.storyTrust1Desc },
    { label: t.storyTrust2Label, description: t.storyTrust2Desc },
    { label: t.storyTrust3Label, description: t.storyTrust3Desc },
    { label: t.storyTrust4Label, description: t.storyTrust4Desc },
  ]

  return (
    <section className="py-20 md:py-28 bg-white" aria-labelledby="brand-story-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`grid grid-cols-1 ${hasImage ? 'lg:grid-cols-2' : ''} gap-16 items-center`}>
          {/* Apiary photo — only shown when image file exists */}
          {hasImage && (
            <div className="relative order-2 lg:order-1">
              <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-honey-50">
                {/* Plain <img> (no next/image optimizer, which 402s on Hobby).
                    Falls back to a branded gradient if the file is ever missing. */}
                <SafeImage
                  src={BRAND_STORY_IMAGE}
                  alt={t.storyImageAlt}
                  className="absolute inset-0 h-full w-full object-cover"
                  fallback={
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-honey-100 via-honey-50 to-forest-100">
                      <span className="text-6xl opacity-40" aria-hidden="true">🐝</span>
                    </div>
                  }
                />
              </div>

              {/* Floating stat card */}
              <div className="absolute -bottom-5 -right-4 sm:-right-6 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-center gap-3">
                <div className="w-11 h-11 bg-honey-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-honey-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                  </svg>
                </div>
                <div>
                  <p className="font-serif font-bold text-bark text-sm">{t.storyStatTitle}</p>
                  <p className="text-gray-400 text-xs">{t.storyStatLocation}</p>
                </div>
              </div>
            </div>
          )}

          {/* Text content */}
          <div className={hasImage ? 'order-1 lg:order-2' : ''}>
            <span className="text-xs font-semibold text-honey-700 uppercase tracking-widest mb-4 block">
              {t.storyEyebrow}
            </span>
            <h2 id="brand-story-heading" className="font-serif text-3xl md:text-4xl font-bold text-bark mb-6 leading-tight">
              {t.storyTitle}
            </h2>

            <div className="space-y-4 text-gray-600 leading-relaxed text-base mb-8">
              <p>
                {t.storyPara1}
              </p>
              <p>
                {t.storyPara2}
              </p>
            </div>

            {/* Trust points */}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
              {TRUST_POINTS.map(({ label, description }) => (
                <li key={label} className="flex items-start gap-3 bg-honey-50 rounded-xl p-4 border border-honey-100">
                  <div className="w-5 h-5 rounded-full bg-honey-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-bark text-sm">{label}</p>
                    <p className="text-gray-500 text-xs leading-relaxed mt-0.5">{description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <CTAButton href={localizedPath(locale, '/about')} variant="outline">
              {t.storyCta}
            </CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}
