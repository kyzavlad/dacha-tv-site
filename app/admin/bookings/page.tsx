export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { getAllBookings } from '@/lib/bookings/queries'
import { AdminBookingsClient } from './AdminBookingsClient'

export const metadata: Metadata = { title: 'Адмін — Бронювання', robots: 'noindex, nofollow' }

export default async function AdminBookingsPage() {
  const bookings = await getAllBookings().catch(() => [])
  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <h1 className="text-xl font-bold text-gray-900 font-serif mb-5">Бронювання</h1>
      <AdminBookingsClient initialBookings={bookings} />
    </div>
  )
}
