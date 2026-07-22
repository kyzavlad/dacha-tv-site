import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE } from '@/lib/admin-session'

export async function GET() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION_COOKIE)

  return NextResponse.redirect(new URL('/admin/login', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'))
}
