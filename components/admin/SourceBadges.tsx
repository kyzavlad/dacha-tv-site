import { parseStoredSource } from '@/lib/analytics/attribution'

// Renders a stored order/inquiry `source` as clean labelled badges instead of one
// long string, so an admin can read the marketing attribution (UTM / referrer /
// landing page) at a glance. Falls back to the plain page path when there is no
// attribution. Pure/presentational — safe in server components.
export function SourceBadges({ source }: { source: string | null | undefined }) {
  const s = parseStoredSource(source)
  if (!s.raw) return null

  const badge = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {s.utm && (
        <span className={`${badge} border-honey-200 bg-honey-50 text-honey-800`} title="UTM (джерело / канал / кампанія)">
          📣 {s.utm.split('/').join(' / ')}
        </span>
      )}
      {s.ref && (
        <span className={`${badge} border-gray-200 bg-gray-50 text-gray-600`} title="Реферер">
          ref: {s.ref}
        </span>
      )}
      {s.lp && (
        <span className={`${badge} border-gray-200 bg-gray-50 text-gray-600`} title="Сторінка входу">
          ↳ {s.lp}
        </span>
      )}
      {/* No attribution captured — show the plain page path so nothing is lost. */}
      {!s.utm && !s.ref && !s.lp && s.page && (
        <span className={`${badge} border-gray-200 bg-gray-50 text-gray-500 font-mono`}>{s.page}</span>
      )}
    </div>
  )
}
