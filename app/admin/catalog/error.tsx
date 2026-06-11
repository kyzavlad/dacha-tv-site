'use client'

// Route-segment error boundary for the whole /admin/catalog area (pipeline,
// setup, catalog, categories, import). Next.js 16 bubbles uncaught errors —
// including any that escape a Server Action transition — to the nearest
// error.tsx. Without this boundary such an error navigates the browser to the
// default full-page crash screen. With it, the admin sees a readable, retryable
// message and the rest of the app stays intact.
export default function CatalogAdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
        <div className="text-sm font-semibold text-red-800">Сталася помилка в адмін-каталозі</div>
        <div className="text-xs text-red-700 font-mono break-all">{error.message}</div>
        {error.digest && <div className="text-xs text-red-400">digest: {error.digest}</div>}
        <div className="text-xs text-red-600">
          Дані не змінено. Натисніть «Спробувати знову», щоб перезавантажити секцію. Якщо помилка
          повторюється — перевірте Vercel runtime logs за digest і чи застосовані міграції бази (047–052).
        </div>
        <button
          onClick={() => unstable_retry()}
          className="text-xs bg-red-700 text-white px-3 py-1.5 rounded-full hover:bg-red-800 transition-colors"
        >
          Спробувати знову
        </button>
      </div>
    </div>
  )
}
