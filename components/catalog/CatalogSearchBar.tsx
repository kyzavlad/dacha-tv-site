// Public catalog search — a plain GET form that submits ?q= to /catalog. No
// client JS required, so it works everywhere and degrades gracefully.
export function CatalogSearchBar({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <form action="/catalog" method="get" role="search" className="flex w-full max-w-xl gap-2">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Пошук товарів у магазині…"
        aria-label="Пошук товарів"
        className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-bark placeholder:text-gray-400 focus:outline-none focus:border-honey-400"
      />
      <button
        type="submit"
        className="rounded-xl bg-honey-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-honey-800 transition-colors"
      >
        Знайти
      </button>
    </form>
  )
}
