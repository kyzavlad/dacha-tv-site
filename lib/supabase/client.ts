/*
 * Supabase server-side client using service role key.
 * NEVER import this in client components or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 *
 * Required SQL migration (run in Supabase SQL editor):
 *
 * CREATE TABLE inquiries (
 *   id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   created_at      TIMESTAMPTZ DEFAULT NOW(),
 *   type            TEXT NOT NULL CHECK (type IN ('honey_order', 'beekeeper_inquiry', 'general')),
 *   name            TEXT NOT NULL,
 *   phone           TEXT NOT NULL,
 *   product         TEXT,
 *   packaging       TEXT,
 *   breed           TEXT,
 *   quantity        TEXT,
 *   timing          TEXT,
 *   message         TEXT,
 *   status          TEXT NOT NULL DEFAULT 'new'
 *                   CHECK (status IN ('new', 'contacted', 'completed', 'cancelled')),
 *   admin_notes     TEXT,
 *   notified_at     TIMESTAMPTZ
 * );
 * CREATE INDEX inquiries_status_created ON inquiries (status, created_at DESC);
 */

import { createClient } from '@supabase/supabase-js'
import type { Inquiry } from '@/types'

// Expose row type for typed queries
export type { Inquiry }

function normalizeSupabaseUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    return `${u.protocol}//${u.host}`
  } catch {
    return raw.trim().replace(/\/+$/, '')
  }
}

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(normalizeSupabaseUrl(url), key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
