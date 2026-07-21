import { YouTubeFacade } from '@/components/shared/YouTubeFacade'
import { SocialIcons } from '@/components/shared/SocialIcons'
import { LAUNCH_YOUTUBE_URL, LAUNCH_YOUTUBE_VIDEO_ID } from '@/lib/launch-defaults'
import { getRequestLocale } from '@/lib/i18n'
import { homeDict } from '@/lib/i18n/sections/home'
import type { SiteSettings } from '@/types'

interface YouTubeSectionProps {
  siteSettings: SiteSettings | null
  videoId?: string
}

export async function YouTubeSection({ siteSettings, videoId }: YouTubeSectionProps) {
  const t = homeDict(await getRequestLocale())
  const resolvedVideoId = videoId || LAUNCH_YOUTUBE_VIDEO_ID
  const channelUrl = siteSettings?.youtube_url || LAUNCH_YOUTUBE_URL

  // Content pillars of the Dacha TV channel — a brand channel about the dacha and
  // farming, not only honey. Rendered as elegant chips under the video.
  const CHANNEL_TOPICS = [
    t.ytTopicDacha,
    t.ytTopicFarm,
    t.ytTopicApiary,
    t.ytTopicFlowers,
    t.ytTopicLavender,
    t.ytTopicGoods,
    t.ytTopicSolutions,
  ]

  return (
    <section className="py-16 md:py-24 bg-bark" aria-labelledby="youtube-heading">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="text-xs font-semibold text-honey-500 uppercase tracking-widest mb-3 block">
            {t.ytEyebrow}
          </span>
          <h2 id="youtube-heading" className="font-serif text-3xl md:text-4xl font-bold text-cream mb-4">
            {t.ytTitle}
          </h2>
          <p className="text-cream/65 text-lg max-w-2xl mx-auto">
            {t.ytIntro}
          </p>

          {/* Content pillars */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {CHANNEL_TOPICS.map((topic) => (
              <span
                key={topic}
                className="text-xs font-medium text-cream/75 bg-white/8 border border-white/12 rounded-full px-3.5 py-1.5"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>

        <YouTubeFacade
          videoId={resolvedVideoId}
          title={t.ytFacadeTitle}
          className="shadow-2xl mb-8"
        />

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-full transition-colors min-h-[48px]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            {t.ytOpenChannel}
          </a>
          <SocialIcons
            siteSettings={siteSettings}
            className="flex items-center gap-2"
            iconClassName="text-cream/60 hover:text-honey-300 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          />
        </div>
      </div>
    </section>
  )
}
