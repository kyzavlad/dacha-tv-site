import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page and API routes through without auth check
  if (pathname === '/admin/login' || pathname.startsWith('/api/admin')) {
    return NextResponse.next()
  }

  // Protect all /admin routes
  if (pathname.startsWith('/admin')) {
    const session = request.cookies.get('admin_session')
    if (session?.value !== '1') {
      const loginUrl = new URL('/admin/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
