export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase/client'
import { HourlyCalendar } from '@/components/bookings/HourlyCalendar'
import { YouTubeFacade } from '@/components/shared/YouTubeFacade'
import { LAVENDER_INSTAGRAM_URL, LAVENDER_INSTAGRAM_HANDLE } from '@/lib/launch-defaults'

export const metadata: Metadata = {
  title: 'Лавандове поле',
  description: 'Оренда лавандового поля на Харківщині для фотосесій і відпочинку: від 1000 ₴/год. Букети лаванди під замовлення. Сезон: червень–липень.',
  alternates: { canonical: '/lavender' },
  openGraph: {
    title: 'Лавандове поле',
    description: 'Оренда лавандового поля для фотосесій і відпочинку на Харківщині. Букети лаванди під замовлення.',
    siteName: 'Дача TV',
    type: 'website',
    images: [{ url: '/images/dacha-tv/logo-square.png', width: 1200, height: 1200, alt: 'Дача TV: лавандове поле' }],
  },
}

// Static Instagram gallery cards — shown when no Instagram API token is
// configured (we never scrape Instagram). Each card uses a layered violet CSS
// gradient + emoji so the section always renders gracefully and on-brand for
// lavender, without any fragile third-party embed.
const INSTAGRAM_CARDS = [
  { gradient: 'from-[#6b3fa0] via-[#7c4db8] to-[#9b6fd4]', accent: 'from-fuchsia-500/30 to-transparent', emoji: '🪻', caption: 'Цвітіння лавандового поля', tag: '#лавандовеполе' },
  { gradient: 'from-[#4a2d7a] via-[#6b3fa0] to-[#8b5cc7]', accent: 'from-violet-300/20 to-transparent', emoji: '💜', caption: 'Фотосесія серед лаванди', tag: '#lavender_stories' },
  { gradient: 'from-[#3c2466] via-[#5b3a93] to-[#7c4db8]', accent: 'from-purple-300/20 to-transparent', emoji: '📸', caption: 'Світанок над полем', tag: '#коротич' },
  { gradient: 'from-[#5b3a93] via-[#7c4db8] to-[#a37dd4]', accent: 'from-white/10 to-transparent', emoji: '💐', caption: 'Свіжі букети лаванди', tag: '#букетлаванди' },
  { gradient: 'from-[#8b3a8b] via-[#9b4db8] to-[#7c4db8]', accent: 'from-fuchsia-400/25 to-transparent', emoji: '🌅', caption: 'Захід сонця в полі', tag: '#харківщина' },
  { gradient: 'from-[#2d1f5e] via-[#4a2d7a] to-[#6b4fa0]', accent: 'from-indigo-300/20 to-transparent', emoji: '🌿', caption: 'Сезон лаванди', tag: '#lavanda' },
]

async function getLavenderService() {
  const client = getSupabaseClient()
  if (!client) return null
  const { data } = await client
    .from('services')
    .select('id, slug, name, price_uah, capacity, extra_guest_price_uah, slot_start_hour, slot_end_hour, booking_type, short_description, description')
    .eq('slug', 'orenda-lavandovoho-polia')
    .single()
  return data
}

export default async function LavenderPage() {
  const service = await getLavenderService().catch(() => null)
  const maxDateISO = `${new Date().getFullYear()}-07-20`

  return (
    <div className="bg-white min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#4a2d7a' }} className="text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-14 md:pt-14 md:pb-20">
          <nav aria-label="Навігація" className="text-sm text-white/40 mb-8">
            <Link href="/" className="hover:text-white/70 transition-colors">Головна</Link>
            <span className="mx-2">›</span>
            <span className="text-white/70">Лаванда</span>
          </nav>
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
              Садиба Дача TV · Харківщина
            </p>
            <h1 className="font-serif text-4xl md:text-5xl font-bold mb-5 leading-tight">
              Лавандове поле
            </h1>
            <p className="text-white/65 text-lg leading-relaxed mb-8">
              Сезон цвітіння: червень–липень. Оренда поля для фотосесій і відпочинку.
              Букети лаванди під замовлення.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <a
                href="#orenda"
                className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-white text-purple-900 font-bold text-base md:text-lg rounded-2xl shadow-xl shadow-black/25 ring-2 ring-white/60 hover:bg-purple-50 hover:ring-white hover:scale-[1.02] active:scale-100 transition-all duration-200 w-full sm:w-auto"
              >
                Забронювати поле
                <span aria-hidden="true" className="text-xl group-hover:translate-x-1 transition-transform">→</span>
              </a>
              <a
                href="#instagram"
                className="inline-flex items-center justify-center gap-2 px-6 py-4 border border-white/25 text-white/80 font-medium text-sm rounded-2xl hover:bg-white/10 transition-colors w-full sm:w-auto"
              >
                Фото в Instagram
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 space-y-16 md:space-y-20">

        {/* Lavender field rental */}
        {service && (
          <section id="orenda" className="scroll-mt-20">
            <div className="mb-8">
              <span className="text-xs font-semibold text-purple-500 uppercase tracking-widest mb-2 block">Оренда локації</span>
              <h2 className="font-serif text-2xl md:text-3xl font-bold text-gray-900">Лавандове поле</h2>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
              {/* Left: info */}
              <div className="space-y-6">
                <p className="text-gray-600 leading-relaxed">
                  Орендуйте лавандове поле на нашій садибі для фотосесій, освітніх, культурних і
                  оздоровчих заходів. Вартість включає 5 осіб, кожна додаткова — 200 ₴.
                </p>

                {/* Price tiers */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-purple-500 uppercase tracking-widest">Вартість оренди</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-violet-100 border border-purple-100 p-4">
                      <p className="text-xs text-purple-500 font-medium mb-1">Ранок / день</p>
                      <p className="text-lg font-bold text-purple-900 leading-none">1 000 ₴</p>
                      <p className="text-xs text-purple-600 mt-1">за годину · 06:00–15:00</p>
                    </div>
                    <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-100 border border-violet-100 p-4">
                      <p className="text-xs text-violet-500 font-medium mb-1">Вечір</p>
                      <p className="text-lg font-bold text-violet-900 leading-none">1 200 ₴</p>
                      <p className="text-xs text-violet-600 mt-1">за годину · 15:00–21:00</p>
                    </div>
                  </div>
                </div>

                {/* Details rows */}
                <div className="rounded-2xl border border-purple-100 bg-purple-50/40 divide-y divide-purple-100/60">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <span aria-hidden="true">👥</span> Включено гостей
                    </span>
                    <span className="text-sm font-semibold text-gray-800">до {service.capacity ?? 5} осіб</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <span aria-hidden="true">➕</span> Додатковий гість
                    </span>
                    <span className="text-sm font-semibold text-gray-800">+{service.extra_guest_price_uah ?? 200} ₴/особа</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <span aria-hidden="true">🕐</span> Час роботи
                    </span>
                    <span className="text-sm font-semibold text-gray-800">{String(service.slot_start_hour ?? 6).padStart(2, '0')}:00–{String(service.slot_end_hour ?? 21).padStart(2, '0')}:00</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <span aria-hidden="true">🪻</span> Сезон
                    </span>
                    <span className="text-sm font-semibold text-gray-800">Червень – Липень</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-sm text-gray-700">
                  <p className="font-semibold text-amber-800 mb-1">💳 Передплата 100%</p>
                  <p>Реквізити для оплати надійдуть у повідомленні після підтвердження.</p>
                </div>

                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <p className="font-semibold text-gray-800 text-sm">📍 Адреса</p>
                    <p className="text-gray-600 text-sm mt-0.5">Харківська обл., смт Коротич, вул. Дачна, 27</p>
                    <p className="text-gray-500 text-xs mt-0.5">Щодня 06:00–21:00</p>
                  </div>
                  <a
                    href="https://www.google.com/maps/dir/?api=1&destination=49.9420503,36.0561702"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-3 bg-white text-purple-700 font-semibold text-sm hover:bg-purple-50 transition-colors"
                  >
                    Прокласти маршрут →
                  </a>
                </div>
              </div>

              {/* Right: booking calendar */}
              <div>
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900 text-base">Забронювати час</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Оберіть дату та годину — підтвердимо дзвінком.</p>
                </div>
                <HourlyCalendar
                  serviceSlug={service.slug}
                  serviceName={service.name}
                  pricePerHour={service.price_uah ?? 1000}
                  capacity={service.capacity ?? 5}
                  extraGuestPrice={service.extra_guest_price_uah ?? 200}
                  slotStartHour={service.slot_start_hour ?? 6}
                  slotEndHour={service.slot_end_hour ?? 21}
                  source="/lavender"
                  maxDateISO={maxDateISO}
                  includedGuests={5}
                  maxGuests={25}
                  maxDurationHours={12}
                  enableBouquets
                  bouquetPrice={100}
                  requireRules
                  rulesLabel="З правилами відвідування лавандового поля ознайомлений(а)"
                  eveningStartHour={15}
                  eveningPriceUah={1200}
                />
              </div>
            </div>
          </section>
        )}

        {/* No-service fallback */}
        {!service && (
          <div className="text-center py-16 text-gray-400">
            <p>Інформацію оновлюємо. Зв&apos;яжіться з нами для деталей.</p>
          </div>
        )}

        {/* ── How to get here video ────────────────────────────────────── */}
        {/* Lightweight click-to-load facade (no heavy YouTube scripts, no
            scraping). 16:9, responsive, never overflows on mobile. */}
        <section id="route" className="scroll-mt-20">
          <div className="text-center mb-8">
            <span className="text-xs font-semibold text-purple-500 uppercase tracking-widest mb-2 block">
              Як нас знайти
            </span>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Як доїхати до лавандової локації
            </h2>
            <p className="text-gray-500 max-w-md mx-auto text-sm leading-relaxed">
              Подивіться коротке відео з маршрутом до поля — так буде простіше
              спланувати дорогу й знайти нас ще до бронювання.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <YouTubeFacade
              videoId="Us1llGkYt9s"
              title="Як доїхати до лавандового поля Дача TV"
              className="shadow-xl"
            />
          </div>
        </section>

        {/* ── Instagram block ──────────────────────────────────────────── */}
        {/* Premium, lavender-specific Instagram showcase. We never scrape
            Instagram — these are elegant static "latest post" style cards that
            all link to the dedicated lavender profile, so the section stays
            beautiful and unbroken even when Instagram is unavailable. */}
        <section id="instagram" className="scroll-mt-20">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#3c2466] via-[#4a2d7a] to-[#5b3a93] p-6 sm:p-10 md:p-12">
            {/* Soft glow accents */}
            <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-fuchsia-500/20 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 w-64 h-64 rounded-full bg-violet-400/20 blur-3xl" aria-hidden="true" />

            <div className="relative">
              <div className="text-center mb-8">
                <a
                  href={LAVENDER_INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-white/70 uppercase tracking-widest mb-3 hover:text-white transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
                  </svg>
                  {LAVENDER_INSTAGRAM_HANDLE}
                </a>
                <h2 className="font-serif text-2xl md:text-3xl font-bold text-white mb-3">
                  Лаванда в Instagram
                </h2>
                <p className="text-white/60 max-w-md mx-auto text-sm leading-relaxed">
                  Цвітіння, фотосесії та живі сторіс просто з поля. Підписуйтесь, щоб не пропустити сезон.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {INSTAGRAM_CARDS.map((card, i) => (
                  <a
                    key={i}
                    href={LAVENDER_INSTAGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative overflow-hidden rounded-2xl aspect-square ring-1 ring-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label={`${card.caption} — Instagram`}
                  >
                    {/* Base gradient */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} transition-transform duration-500 group-hover:scale-[1.06]`} />
                    {/* Radial accent glow — top-left */}
                    <div className={`pointer-events-none absolute -top-6 -left-6 w-2/3 h-2/3 rounded-full bg-gradient-radial ${card.accent} blur-2xl`} aria-hidden="true" />
                    {/* Subtle noise overlay for depth */}
                    <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay bg-[url('/noise.png')] bg-repeat" aria-hidden="true" />
                    {/* Center emoji */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-4xl md:text-5xl filter drop-shadow-lg select-none group-hover:scale-110 transition-transform duration-300">{card.emoji}</span>
                    </div>
                    {/* Caption bar */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 py-3 translate-y-0.5 group-hover:translate-y-0 transition-transform duration-200">
                      <p className="text-white text-xs font-semibold leading-snug">{card.caption}</p>
                      <p className="text-white/55 text-[10px] mt-0.5 tracking-wide">{card.tag}</p>
                    </div>
                  </a>
                ))}
              </div>

              <div className="text-center mt-8">
                <a
                  href={LAVENDER_INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 px-8 py-4 bg-white text-purple-900 font-semibold rounded-2xl hover:bg-purple-50 active:scale-[0.98] transition-all shadow-lg shadow-black/20 w-full sm:w-auto justify-center"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
                  </svg>
                  Підписатися в Instagram
                </a>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
