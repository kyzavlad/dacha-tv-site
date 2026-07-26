import type { SupabaseClientOptions } from '@supabase/supabase-js'

// ─── Node 20-compatible Realtime transport for the singleton clients ──────────
// @supabase/supabase-js eagerly constructs a RealtimeClient inside createClient.
// Since realtime-js 2.11x, that constructor resolves a WebSocket implementation
// UP FRONT (RealtimeClient._initializeOptions → WebSocketFactory) and THROWS on
// Node < 22, where there is no global WebSocket ("Node.js detected but native
// WebSocket not found… provide a WebSocket implementation via the transport
// option"). Production runs Node 20, so every server createClient call — i.e.
// all four process singletons — must pass an explicit transport there.
//
// Resolution (cached once per process):
//   • native WebSocket present (browser, Node 22+)  → no option; native is used
//   • server-side Node without native WebSocket (Node 20) → the `ws` package
//   • anything else (defensive)                     → no option
//
// Browser-bundle safety: lib/supabase/catalog.ts is imported by a client
// component (CatalogSortSelect → CATALOG_SORTS), so this module ships to the
// browser too. That is safe by construction:
//   1. browsers always have a native WebSocket, so the require branch is
//      unreachable there (guarded by BOTH the WebSocket and window checks);
//   2. the `ws` package declares a `browser` field stub, so client bundlers
//      resolve the require to a tiny inert stub — no Node internals, no
//      secret-bearing code, nothing executed.
// The service-role key never appears here; this module only picks a transport.

type RealtimeOptions = NonNullable<SupabaseClientOptions<'public'>['realtime']>

let resolved: { realtime?: RealtimeOptions } | null = null

// Options fragment to spread into createClient(): `{ ...realtimeCompatOptions() }`.
// Returns {} when the runtime's native WebSocket suffices.
export function realtimeCompatOptions(): { realtime?: RealtimeOptions } {
  if (resolved) return resolved

  const hasNativeWebSocket = typeof WebSocket !== 'undefined'
  const isServerNode =
    typeof window === 'undefined' &&
    typeof process !== 'undefined' &&
    Boolean(process.versions?.node)

  if (!hasNativeWebSocket && isServerNode) {
    // Node 20: supply the `ws` client as the Realtime transport.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeWs = require('ws') as { WebSocket: RealtimeOptions['transport'] }
    resolved = { realtime: { transport: nodeWs.WebSocket } }
  } else {
    resolved = {}
  }
  return resolved
}
