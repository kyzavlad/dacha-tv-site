#!/usr/bin/env node
// ─── Repeat-request memory regression harness ─────────────────────────────────
// Proves the RSS leak is fixed: hammer a route many times and assert the
// server's RSS does not grow without bound. Measures RSS via the protected
// /api/admin/diag/memory endpoint (process.memoryUsage().rss on the server).
//
// Usage (against an already-running standalone/production server):
//   BASE_URL=http://127.0.0.1:3040 CRON_SECRET=... node scripts/memory-regression.mjs
//
// Exit 0 if every route stays under the growth threshold, 1 otherwise.

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3040'
const SECRET = process.env.CRON_SECRET || ''
// Per-route sustained-growth ceiling. A leak-free server settles to a steady
// state; small fluctuation is fine, linear growth is not. /api/health did
// ~40–55MB PER CALL before the fix, so even a few calls would blow past this.
const THRESHOLD_MB = Number(process.env.MEM_THRESHOLD_MB || '60')

async function rssMb() {
  const res = await fetch(`${BASE}/api/admin/diag/memory`, { headers: { 'x-cron-secret': SECRET } })
  if (!res.ok) throw new Error(`diag/memory HTTP ${res.status} (is CRON_SECRET set and the server up?)`)
  const j = await res.json()
  return j.memory_mb.rss
}

async function hammer(path, times) {
  for (let i = 0; i < times; i++) {
    const res = await fetch(`${BASE}${path}`)
    // Drain the body so sockets are released.
    await res.text().catch(() => '')
  }
}

async function measure(label, path, times) {
  await hammer(path, 5) // warm
  const before = await rssMb()
  await hammer(path, times)
  // brief settle so any deferred frees land before the final read
  await new Promise((r) => setTimeout(r, 500))
  const after = await rssMb()
  const growth = Math.round((after - before) * 10) / 10
  const perCall = Math.round((growth / times) * 1000) / 1000
  const pass = growth <= THRESHOLD_MB
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(22)} calls=${String(times).padStart(4)}  rss ${before}→${after} MB  growth=${growth} MB  (~${perCall} MB/call)`,
  )
  return pass
}

async function main() {
  if (!SECRET) {
    console.error('CRON_SECRET is required to read /api/admin/diag/memory')
    process.exit(2)
  }
  console.log(`Memory regression against ${BASE} (threshold ${THRESHOLD_MB} MB/route)`)
  const results = []
  results.push(await measure('GET /api/health x200', '/api/health', 200))
  results.push(await measure('GET / x40', '/', 40))
  results.push(await measure('GET /catalog/all x40', '/catalog/all', 40))
  results.push(await measure('GET /en/catalog/all x40', '/en/catalog/all', 40))
  const ok = results.every(Boolean)
  console.log(ok ? '\nOVERALL: PASS — no unbounded RSS growth' : '\nOVERALL: FAIL — sustained RSS growth detected')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(2)
})
