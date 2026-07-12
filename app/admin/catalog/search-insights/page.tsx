export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Адмін: Пошукові запити', robots: 'noindex, nofollow' }

// Bounded window: aggregate at most this many recent rows in JS so the page stays
// cheap regardless of how large search_logs grows. Everything below is derived
// from this single time-windowed, capped query.
const MAX_ROWS = 5000
const DAY = 24 * 60 * 60 * 1000

// Wall-clock read kept out of the component body (Date.now() is flagged as impure
// inside a render function; a plain helper is fine and this page is dynamic).
function nowMs(): number { return Date.now() }

interface Row { query: string; query_norm: string; result_count: number | null; created_at: string }
interface Agg {
  query: string
  count30: number
  count7: number
  sumResults30: number
  zero30: number
}

function aggregate(rows: Row[], now: number) {
  const map = new Map<string, Agg>()
  const cutoff7 = now - 7 * DAY
  for (const r of rows) {
    const key = r.query_norm || r.query.toLowerCase()
    const a = map.get(key) ?? { query: r.query, count30: 0, count7: 0, sumResults30: 0, zero30: 0 }
    a.count30 += 1
    if (new Date(r.created_at).getTime() >= cutoff7) a.count7 += 1
    const rc = typeof r.result_count === 'number' ? r.result_count : 0
    a.sumResults30 += rc
    if (rc === 0) a.zero30 += 1
    map.set(key, a)
  }
  return [...map.values()]
}

const searchHref = (q: string, buyable = false) => `/search?q=${encodeURIComponent(q)}${buyable ? '&buyable=1' : ''}`

export default async function SearchInsightsPage() {
  let rows: Row[] = []
  let tableMissing = false
  let loadError: string | null = null

  try {
    const client = getAdminClient()
    const since = new Date(nowMs() - 30 * DAY).toISOString()
    const { data, error } = await client
      .from('search_logs')
      .select('query, query_norm, result_count, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS)
    if (error) {
      // PGRST205 = table not found (migration not applied yet).
      if (error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) tableMissing = true
      else loadError = error.message
    } else {
      rows = (data ?? []) as Row[]
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
  }

  const now = nowMs()
  const aggs = aggregate(rows, now)
  const totalSearches30 = rows.length
  const totalSearches7 = aggs.reduce((s, a) => s + a.count7, 0)

  const top = [...aggs].sort((a, b) => b.count30 - a.count30 || b.count7 - a.count7).slice(0, 40)
  const zeroResult = [...aggs]
    .filter((a) => a.zero30 === a.count30) // every logged run returned 0
    .sort((a, b) => b.count30 - a.count30)
    .slice(0, 25)
  // "Promote": real demand WITH supply — people search it and we return results.
  const promote = [...aggs]
    .filter((a) => a.sumResults30 > 0 && a.count30 >= 2)
    .sort((a, b) => b.count30 - a.count30)
    .slice(0, 20)

  const avg = (a: Agg) => (a.count30 > 0 ? Math.round((a.sumResults30 / a.count30) * 10) / 10 : 0)

  return (
    <div className="px-4 sm:px-6 py-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin/catalog" className="text-sm text-gray-500 hover:text-gray-900">← Каталог</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Пошукові запити</h1>
      </div>
      <p className="text-xs text-gray-500 mb-6">
        Внутрішній пошук на сайті за останні 30 днів (до {MAX_ROWS.toLocaleString('uk-UA')} останніх записів).
      </p>

      {tableMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          Таблиця <code className="font-mono">search_logs</code> ще не створена. Застосуйте міграцію{' '}
          <code className="font-mono">20260703_search_logs.sql</code>, і дані почнуть накопичуватися.
        </div>
      )}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700 font-mono break-all">
          {loadError}
        </div>
      )}

      {!tableMissing && !loadError && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <Stat label="Пошуків (30 днів)" value={totalSearches30.toLocaleString('uk-UA')} />
            <Stat label="Пошуків (7 днів)" value={totalSearches7.toLocaleString('uk-UA')} />
            <Stat label="Унікальних запитів" value={aggs.length.toLocaleString('uk-UA')} />
          </div>

          {/* What to promote */}
          <Section title="Що просувати цього тижня" hint="Реальний попит + є товари в результатах — гарні кандидати для реклами/SEO.">
            {promote.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-gray-100">
                {promote.map((a) => (
                  <li key={a.query} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={searchHref(a.query, true)} className="font-medium text-gray-900 hover:text-honey-700 truncate block">
                        {a.query}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {a.count30} пошуків / 30 дн · {a.count7} / 7 дн · ~{avg(a)} результатів — люди шукають це, і товари є.
                      </p>
                    </div>
                    <Link href={searchHref(a.query, true)} className="shrink-0 text-xs font-medium text-honey-700 hover:underline">
                      Відкрити ↗
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Top queries */}
          <Section title="Топ запитів (30 днів)">
            {top.length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                      <th className="py-2 pr-3 font-medium">Запит</th>
                      <th className="py-2 px-3 font-medium text-right">30 дн</th>
                      <th className="py-2 px-3 font-medium text-right">7 дн</th>
                      <th className="py-2 px-3 font-medium text-right">~Результати</th>
                      <th className="py-2 pl-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {top.map((a) => (
                      <tr key={a.query} className="hover:bg-gray-50/60">
                        <td className="py-2 pr-3 text-gray-900 truncate max-w-[220px]">{a.query}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{a.count30}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-500">{a.count7}</td>
                        <td className={`py-2 px-3 text-right tabular-nums ${avg(a) === 0 ? 'text-red-500' : 'text-gray-600'}`}>{avg(a)}</td>
                        <td className="py-2 pl-3 text-right">
                          <Link href={searchHref(a.query)} className="text-xs text-honey-700 hover:underline">↗</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Zero-result */}
          <Section title="Запити без результатів" hint="Люди шукають — ми нічого не показуємо. Кандидати на імпорт/синоніми/категорії.">
            {zeroResult.length === 0 ? <Empty text="Немає запитів, що завжди повертали 0." /> : (
              <ul className="flex flex-wrap gap-2">
                {zeroResult.map((a) => (
                  <Link key={a.query} href={searchHref(a.query)} className="inline-flex items-center gap-1.5 text-sm bg-red-50 text-red-700 border border-red-100 rounded-full px-3 py-1 hover:bg-red-100">
                    {a.query} <span className="text-xs text-red-400">×{a.count30}</span>
                  </Link>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-100 rounded-xl p-5 mb-6">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {hint && <p className="text-xs text-gray-500 mt-0.5 mb-3">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Empty({ text = 'Поки немає даних.' }: { text?: string }) {
  return <p className="text-sm text-gray-400 py-4">{text}</p>
}
