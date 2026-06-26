export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { publishBatch } from '@/lib/catalog/automation'
import { publishDraftProducts } from '@/lib/catalog/pipeline'

// Daily cron (no params)      → publishBatch(): publishes ALL drafts, logged. Unchanged.
// Manual dry-run              → ?dry=true[&limit=N]: reports wouldPublish + samples, writes nothing.
// Manual apply (capped)       → ?limit=N: publishes up to N drafts with full reporting.
// Manual apply (all)          → ?skipCap=true: publishes all drafts with reporting.
// Quality dry-run             → ?dry=true&quality=true[&limit=N]: reports eligible quality rows.
// Quality apply               → ?quality=true[&limit=N]: publishes only image+meta complete drafts.
//
// NOTE: there is no publish cap in the system — AUTOMATION_MAX_PUBLISHED only
// gates IMPORT, not publish. skipCap is accepted for symmetry with import-products
// and simply means "no limit".
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === 'true'
  const skipCap = url.searchParams.get('skipCap') === 'true'
  const quality = url.searchParams.get('quality') === 'true'
  const limitRaw = url.searchParams.get('limit')
  const hasLimit = limitRaw !== null
  const limit = hasLimit
    ? Math.min(Math.max(parseInt(limitRaw as string, 10) || 1, 1), 200000)
    : undefined

  // Manual path: any of dry / limit / skipCap / quality present → use the reporting fn.
  if (dry || hasLimit || skipCap || quality) {
    const result = await publishDraftProducts({ dryRun: dry, limit, quality })
    return Response.json({ ...result, dryRun: dry })
  }

  // No params → daily cron behaviour, unchanged.
  const result = await publishBatch()
  return Response.json(result)
}
