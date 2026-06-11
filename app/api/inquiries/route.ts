import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  if (!session || session.value !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const validStatuses = ['new', 'contacted', 'completed', 'cancelled']

  try {
    const supabase = getAdminClient()
    let query = supabase.from('inquiries').select('*').order('created_at', { ascending: false })
    if (status && status !== 'all' && validStatuses.includes(status)) {
      query = query.eq('status', status)
    }
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    if (msg.includes('not configured')) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  if (!session || session.value !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, status, notes } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const validStatuses = ['new', 'contacted', 'completed', 'cancelled']
    const update: Record<string, unknown> = {}
    if (status !== undefined) {
      if (!validStatuses.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      update.status = status
    }
    if (notes !== undefined) update.notes = notes
    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    const supabase = getAdminClient()
    const { error } = await supabase.from('inquiries').update(update).eq('id', id)
    if (error) {
      // notes column missing — retry status-only
      if (update.notes !== undefined && error.message?.includes('notes')) {
        const { status: st } = update
        if (st) {
          const { error: e2 } = await supabase.from('inquiries').update({ status: st }).eq('id', id)
          if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
          return NextResponse.json({ ok: true, notesSaved: false })
        }
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    if (msg.includes('not configured')) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
