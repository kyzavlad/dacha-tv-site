// ─── Shared helpers for the one-time CURRENT-project catalog scripts ──────────
// Self-contained (only @supabase/supabase-js + node builtins). Every script is
// DRY-RUN by default; APPLY requires --apply AND --current-ref=<ref> matching the
// live project. Service-role keys are read from env and never printed.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const ARTIFACT_DIR = resolve(process.cwd(), 'audit/catalog-v3')

export interface Creds { url: string; key: string }

export function loadCurrentEnv(): Creds {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const missing: string[] = []
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length) throw new Error(`Missing required env: ${missing.join(', ')}`)
  return { url, key }
}

export function makeClient({ url, key }: Creds): SupabaseClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Node has no native WebSocket — supabase-js needs an explicit transport.
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  })
}

export function projectRef(url: string): string {
  try { return new URL(url).host.split('.')[0] } catch { return '' }
}
export function sanitizeRef(url: string): string {
  const r = projectRef(url)
  return r ? `ref:${r.slice(0, 4)}…` : 'ref:?'
}

export interface CommonArgs { apply: boolean; currentRef: string | null; extra: string[] }
export function parseArgs(argv: string[]): CommonArgs {
  const get = (p: string) => { const a = argv.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null }
  return { apply: argv.includes('--apply'), currentRef: get('--current-ref='), extra: argv }
}

// Gate an APPLY: require --current-ref to match the live project ref. Returns an
// error string, or null when APPLY may proceed.
export function verifyApply(env: Creds, args: CommonArgs): string | null {
  if (!args.apply) return null
  const live = projectRef(env.url)
  if (!args.currentRef) return `APPLY requires --current-ref=${live || '<ref>'} (explicit project confirmation).`
  if (args.currentRef !== live) return `--current-ref (${args.currentRef}) does not match the live current project ref.`
  return null
}

export function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}

export function writeArtifact(name: string, data: unknown): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  const path = resolve(ARTIFACT_DIR, name)
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8')
  return path
}

// Paginated read past the 1000-row PostgREST cap. Selected columns only; ordered
// by `id` for stable paging. For filtered reads, callers query the client
// directly (the affected sets here — categories, metal, logs — are small).
export async function readAll<T = Record<string, unknown>>(
  client: SupabaseClient, table: string, columns: string,
): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(`readAll ${table}: ${error.message}`)
    const rows = (data ?? []) as unknown as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export function log(msg: string): void { process.stdout.write(`${msg}\n`) }
export function fail(msg: string): never { process.stderr.write(`\nFATAL: ${msg}\n\n`); process.exit(1) }
