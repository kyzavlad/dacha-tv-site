import { createClient } from '@supabase/supabase-js'

function normalizeSupabaseUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    return `${u.protocol}//${u.host}`
  } catch {
    return raw.trim().replace(/\/+$/, '')
  }
}

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin credentials are not configured')
  return createClient(normalizeSupabaseUrl(url), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
