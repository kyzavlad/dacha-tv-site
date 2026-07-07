import { GA_MEASUREMENT_ID, GOOGLE_ADS_ID } from '@/lib/analytics/gtag'

// Loads gtag.js and initialises every configured Google tag (GA4 + Google Ads).
// Renders nothing when neither id is set, so the site ships zero analytics
// weight until env vars are provided. Placed in <head> by the root layout.
export function Analytics() {
  const primaryId = GA_MEASUREMENT_ID || GOOGLE_ADS_ID
  if (!primaryId) return null

  const configLines = [
    GA_MEASUREMENT_ID && `gtag('config','${GA_MEASUREMENT_ID}');`,
    GOOGLE_ADS_ID && `gtag('config','${GOOGLE_ADS_ID}');`,
  ]
    .filter(Boolean)
    .join('')

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${primaryId}`} />
      <script
        dangerouslySetInnerHTML={{
          __html:
            `window.dataLayer=window.dataLayer||[];` +
            `function gtag(){dataLayer.push(arguments)}` +
            `gtag('js',new Date());` +
            configLines,
        }}
      />
    </>
  )
}
