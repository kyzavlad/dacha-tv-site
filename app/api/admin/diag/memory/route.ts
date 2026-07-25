export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'

// ─── Protected process-memory diagnostic (CRON_SECRET) ────────────────────────
// Reports live process.memoryUsage() plus uptime and the PM2 memory ceiling (if
// exposed via env). Secret-free. Use it to watch for sustained RSS growth
// without SSHing to the box:
//   curl -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3030/api/admin/diag/memory
function bytesToMb(n: number): number {
  return Math.round((n / 1024 / 1024) * 10) / 10
}

export function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const m = process.memoryUsage()
  // PM2 sets some vars in the process env; max_memory_restart is not standard,
  // so it is reported only if the operator exposes it as PM2_MAX_MEMORY_RESTART.
  const pm2Limit = process.env.PM2_MAX_MEMORY_RESTART ?? null

  return Response.json({
    ok: true,
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
    memory_mb: {
      rss: bytesToMb(m.rss),
      heapUsed: bytesToMb(m.heapUsed),
      heapTotal: bytesToMb(m.heapTotal),
      external: bytesToMb(m.external),
      arrayBuffers: bytesToMb(m.arrayBuffers ?? 0),
    },
    memory_bytes: {
      rss: m.rss,
      heapUsed: m.heapUsed,
      heapTotal: m.heapTotal,
      external: m.external,
      arrayBuffers: m.arrayBuffers ?? 0,
    },
    pm2_max_memory_restart: pm2Limit,
    timestamp: new Date().toISOString(),
  })
}
