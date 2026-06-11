export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { inspectSupplierFeeds } from '@/lib/supplier/sync'

// Phase 1 diagnostic — inspect the REAL supplier payloads (json / xml / yml) and
// report exactly where category names live, without dumping full feeds.
// Protected by CRON_SECRET. Call in production:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/diag/supplier-feeds
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const report = await inspectSupplierFeeds()
    return Response.json({ ok: true, report })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
