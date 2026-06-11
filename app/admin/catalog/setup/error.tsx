'use client'

export default function SetupError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
        <div className="text-sm font-semibold text-red-800">Помилка рендерингу сторінки налаштування</div>
        <div className="text-xs text-red-700 font-mono break-all">{error.message}</div>
        {error.digest && (
          <div className="text-xs text-red-400">digest: {error.digest}</div>
        )}
        <div className="text-xs text-red-600">
          Перевірте Vercel runtime logs за цим digest та переконайтесь, що всі env vars встановлені:
          NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPPLIER_API_URL, SUPPLIER_API_KEY, CRON_SECRET.
        </div>
        <button
          onClick={unstable_retry}
          className="text-xs bg-red-700 text-white px-3 py-1.5 rounded-full hover:bg-red-800 transition-colors"
        >
          Спробувати знову
        </button>
      </div>
    </div>
  )
}
