export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { getSupabaseClient } from '@/lib/supabase/client'
import { HourlyCalendar } from '@/components/bookings/HourlyCalendar'

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
      {/* Hero */}
      <div style={{ backgroundColor: '#4a2d7a' }} className="text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
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
              Лаванда
            </h1>
            <p className="text-white/60 text-lg leading-relaxed mb-6">
              Цвітіння у червні–липні. Орендуйте поле для фотосесії, освітніх, культурних і оздоровчих заходів.
              За бажанням: букети лаванди під замовлення.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <a
                href="#orenda"
                className="group inline-flex items-center justify-center gap-2.5 px-9 py-5 bg-white text-purple-900 font-extrabold uppercase tracking-wide text-lg md:text-xl rounded-2xl shadow-2xl shadow-black/30 ring-2 ring-white/70 hover:bg-purple-50 hover:ring-white hover:scale-[1.03] active:scale-100 transition-all duration-200"
              >
                Забронювати поле
                <span aria-hidden="true" className="text-2xl group-hover:translate-x-1 transition-transform">→</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">

        {/* Lavender field rental */}
        {service && (
          <section id="orenda" className="scroll-mt-24">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-6 h-px bg-purple-300" />
              <h2 className="font-serif text-2xl font-bold text-gray-900">Оренда лавандового поля</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-gray-600 leading-relaxed mb-4">{service.description}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <span className="text-purple-600 font-semibold w-28">Ціна:</span>
                    <span>06:00–15:00: 1000 ₴/год · 15:00–21:00: 1200 ₴/год</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-purple-600 font-semibold w-28">Включено:</span>
                    <span>{service.capacity ?? 5} осіб</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-purple-600 font-semibold w-28">Додатково:</span>
                    <span>+{service.extra_guest_price_uah ?? 200} ₴/особа</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-purple-600 font-semibold w-28">Час роботи:</span>
                    <span>{String(service.slot_start_hour ?? 6).padStart(2, '0')}:00 – {String(service.slot_end_hour ?? 21).padStart(2, '0')}:00</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-purple-600 font-semibold w-28">Сезон:</span>
                    <span>Червень – Липень</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Забронювати час</h3>
                <p className="text-xs text-gray-500 mb-4">Оберіть дату та годину: підтвердимо дзвінком.</p>
                
              <div className="mt-8 rounded-2xl border border-purple-100 bg-purple-50/70 p-5 text-sm text-gray-700 space-y-3">
                <p className="font-semibold text-purple-800">
                  Бронювання локації здійснюється за 100% передплатою, реквізити надійдуть вам у повідомленні.
                </p>
                <div>
                  <p className="font-semibold text-bark mb-1">Адреса локації:</p>
                  <p>Харківська область, смт Коротич, вул. Дачна, 27</p>
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=Харківська%20область%20Коротич%20Дачна%2027"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center text-purple-700 font-semibold hover:text-purple-900"
                  >
                    Прокласти маршрут →
                  </a>
                </div>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Харківська%20область%20Коротич%20Дачна%2027"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-xl border border-purple-100 bg-white"
                >
                  <div className="aspect-[16/9] bg-gradient-to-br from-purple-100 via-purple-50 to-green-50 flex items-center justify-center text-center px-6">
                    <div>
                      <div className="text-4xl mb-3">📍</div>
                      <p className="font-serif text-xl font-bold text-bark">Коротич, вул. Дачна, 27</p>
                      <p className="text-gray-500 mt-1">Натисніть, щоб відкрити карту</p>
                    </div>
                  </div>
                </a>
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
                  maxGuests={5}
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

        {/* When no data loaded */}
        {!service && (
          <div className="text-center py-12 text-gray-400">
            <p>Інформацію оновлюємо. Зв&apos;яжіться з нами для деталей.</p>
          </div>
        )}
      </div>
    </div>
  )
}
